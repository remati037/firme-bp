/**
 * Signali na stranici firme — računaju se u kodu, nikad ih ne piše AI.
 *
 * Pravila su iz CLAUDE.md (sekcija "Signali"). Svaki signal je samostalna
 * rečenica sa brojem, da ima smisla i izvučen iz konteksta (SEO.md §7).
 *
 * Signal NIJE bonitetna ocena. Formulacije su činjenične ("kapital je
 * negativan"), bez preporuke da li poslovati sa firmom.
 */

import { formatBroj, formatDatum, formatRSD, starostUGodinama } from "./format";
import type { Blokada, Finansije, Firma, Zabrana } from "./queries";

export type TezinaSignala = "crit" | "warn" | "ok";

export type Signal = {
  tezina: TezinaSignala;
  naslov: string;
  tekst: string;
};

export function izracunajSignale(
  firma: Firma,
  fi: Finansije | null | undefined,
  datumPreseka: string,
  blokada?: Blokada | null,
  zabrane?: Zabrana[],
): Signal[] {
  const signali: Signal[] = [];
  const godina = fi?.godina;

  // 1. Negativan kapital
  if (fi && fi.kapital !== null && fi.kapital < 0) {
    signali.push({
      tezina: "crit",
      naslov: "Negativan kapital",
      tekst: `U poslednjem izveštaju (${godina}) kapital je ${formatRSD(fi.kapital)}.`,
    });
  }

  // 2. Gubitak veći od kapitala
  const netoGubitak = fi?.neto_gubitak ?? 0;
  if (fi && netoGubitak > 0 && fi.kapital !== null && fi.kapital > 0 && netoGubitak > fi.kapital) {
    signali.push({
      tezina: "warn",
      naslov: "Gubitak veći od kapitala",
      tekst: `Neto gubitak u ${godina}. iznosi ${formatRSD(netoGubitak)}, uz kapital od ${formatRSD(fi.kapital)}.`,
    });
  }

  // 3. Nula prihoda uz prijavljene zaposlene
  const zaposleni = fi?.prosecan_broj_zaposlenih ?? 0;
  if (fi && (fi.ukupni_prihodi ?? 0) === 0 && zaposleni > 0) {
    signali.push({
      tezina: "warn",
      naslov: "Nula prihoda uz prijavljene zaposlene",
      tekst: `Za ${godina}. firma je prijavila ${formatBroj(zaposleni)} zaposlenih, a ukupan prihod je nula.`,
    });
  }

  // 4. Status nije aktivan
  const status = (firma.status ?? "").toLowerCase();
  if (firma.status_aktivan === false || status.includes("stečaj") || status.includes("likvidacij")) {
    const uStecaju = status.includes("stečaj") || status.includes("stecaj");
    signali.push({
      tezina: uStecaju ? "crit" : "warn",
      naslov: `Status: ${firma.status ?? "nije aktivan"}`,
      tekst: `Prema APR presek podataka firma nije u statusu „Aktivan".`,
    });
  }

  // 5. Mlađa od 12 meseci, mereno na datum preseka, ne na današnji dan
  const starost = starostUGodinama(firma.datum_osnivanja, datumPreseka);
  if (starost === 0) {
    signali.push({
      tezina: "warn",
      naslov: "Firma je mlađa od godinu dana",
      tekst: `Registrovana je manje od 12 meseci pre preseka podataka, pa istorija poslovanja još ne postoji.`,
    });
  }

  // 6. Aktivna blokada: zabrana raspolaganja sredstvima (NBS, prinudna naplata)
  if (blokada?.zabrana_prenosa) {
    signali.push({
      tezina: "crit",
      naslov: "Aktivna blokada računa",
      tekst: `Prema NBS registru dužnika u prinudnoj naplati, od ${formatDatum(
        blokada.zabrana_prenosa,
      )} firma ne može da raspolaže sredstvima na računima kod banaka.${
        blokada.iznos ? ` Ukupan iznos blokade je ${formatDinarski(blokada.iznos)}.` : ""
      }`,
    });
  }

  // 7. Istorija blokade u poslednjih 5 godina (bez tekuće zabrane ili uz nju)
  const ukupnoDana = blokada?.ukupno_dana ?? 0;
  if (ukupnoDana > 0) {
    signali.push({
      tezina: "warn",
      naslov: "Blokada u poslednjih pet godina",
      tekst: `Firma je bila u blokadi ${formatBroj(ukupnoDana)} ${pluralDana(
        ukupnoDana,
      )} u poslednjih pet godina${
        blokada?.iznos ? `, sa ukupnim iznosom blokade od ${formatDinarski(blokada.iznos)}` : ""
      } (NBS, registar dužnika u prinudnoj naplati).`,
    });
  }

  // 8. Aktivno privremeno ograničenje prava (APR evidencija; izbrisana !== true)
  const aktivne = (zabrane ?? []).filter((z) => z.izbrisana !== true);
  const prvaAktivna = aktivne[0];
  if (prvaAktivna) {
    signali.push({
      tezina: "crit",
      naslov: "Aktivno privremeno ograničenje prava",
      tekst: `Prema APR evidenciji privremenih ograničenja, na snazi je mera: ${kratkaVrsta(
        prvaAktivna.vrsta,
      )}${prvaAktivna.pocetak_vazenja ? `, od ${formatDatumBezTačke(prvaAktivna.pocetak_vazenja)}` : ""}${
        aktivne.length > 1 ? ` (ukupno ${formatBroj(aktivne.length)} aktivnih mera)` : ""
      }.`,
    });
  }

  // 9. Istorija privremenih ograničenja (sve mere, uključujući skinute)
  const ukupnoZabrana = zabrane?.length ?? 0;
  if (ukupnoZabrana > 0 && !prvaAktivna) {
    const poslednja = zabrane![0];
    signali.push({
      tezina: "warn",
      naslov: "Privremena ograničenja u evidenciji",
      tekst: `Firma ima ${formatBroj(ukupnoZabrana)} ${pluralMera(
        ukupnoZabrana,
      )} u APR evidenciji privremenih ograničenja prava${
        poslednja?.pocetak_vazenja ? ` (poslednja od ${formatDatum(poslednja.pocetak_vazenja)})` : ""
      }.`,
    });
  }

  return signali;
}

/** Iznos blokade je u DINARIMA (NBS), za razliku od APR finansija u hiljadama. */
function formatDinarski(iznos: number): string {
  return `${formatBroj(iznos)} RSD`;
}

function pluralDana(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 14) return "dana";
  if (n % 10 === 1) return "dan";
  return "dana";
}

/** formatDatum bez završne tačke ("03.06.2026." → "03.06.2026") za sredinu rečenice. */
function formatDatumBezTačke(datum: string): string {
  return formatDatum(datum).replace(/\.$/, "");
}

/** Kratak naziv vrste mere iz punog teksta (npr. "[5] Мера изречена..." → "poreska mera"). */
export function kratkaVrsta(vrsta: string | null | undefined): string {
  const m = vrsta?.match(/^\[(\d)\]/);
  const kratko: Record<string, string> = {
    "1": "zabrana obavljanja delatnosti",
    "2": "zabrana raspolaganja novčanim sredstvima",
    "3": "zabrana vršenja dužnosti odgovornom licu",
    "4": "zabrana raspolaganja udelima",
    "5": "poreska mera",
  };
  if (m && kratko[m[1]]) return kratko[m[1]];
  const cist = vrsta?.replace(/^\[\d+\]\s*/, "").trim();
  return cist && cist.length > 0 ? cist : "privremeno ograničenje";
}

function pluralMera(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "meru";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "mere";
  return "mera";
}

/**
 * Poruka kad signala nema. Prikazuje se kao zelena linija (odobreni prototip),
 * da sekcija nikad ne ostane prazan prostor.
 */
export function porukaBezSignala(fi: Finansije | null | undefined): Signal {
  const imaPrihod = (fi?.ukupni_prihodi ?? 0) > 0;
  return {
    tezina: "ok",
    naslov: "Bez upozoravajućih signala",
    tekst: imaPrihod
      ? "Firma je aktivna, kapital nije negativan i prihodi su prijavljeni."
      : "Firma je aktivna i nema upozoravajućih podataka u poslednjem preseku.",
  };
}
