/**
 * Poređenje dve do četiri firme — čista logika, bez baze i bez React-a.
 *
 * Odvojeno od `uporedi-podaci.ts` iz istog razloga iz kog je `pokazatelji.ts`
 * odvojen od `firma-podaci.ts`: računica se testira bez Supabase klijenta.
 *
 * Novčane vrednosti ostaju u HILJADAMA dinara (APR format) i množe se tek u
 * prikazu, kroz `<Novac hiljade>`. Nula je "nema podatka" (CLAUDE.md, pravilo
 * 5 i 6), pa se povoljnija strana NE proglašava kad ijedna strana nema broj —
 * inače bi firma bez predatog izveštaja "gubila" po svakom redu, što je
 * netačno: ona nije lošija, o njoj se ne zna.
 */

import { formatDatum, formatProcenat, starostUGodinama } from "./format";
import type { Pokazatelji } from "./pokazatelji";
import { vrstaStatusa } from "./prikaz";
import type { Blokada, Finansije, Firma } from "./queries";

/**
 * Gornja granica broja firmi u jednom poređenju.
 *
 * Četiri kolone su i granica čitljivosti tabele i granica zdravog razuma za
 * ISR: bez ograničenja bi `/uporedi/a/b/c/d/e/…` bio beskonačan izvor novih
 * keširanih stranica koje niko nije tražio.
 */
export const MAX_FIRMI = 4;
export const MIN_FIRMI = 2;

/** Jedna strana poređenja, već sklopljena iz baze. */
export type StranaPoredjenja = {
  firma: Firma;
  /** Skraćeno ime, isto ono koje stoji u H1 stranice firme. */
  ime: string;
  fi: Finansije | null;
  pokazatelji: Pokazatelji;
  blokada: Blokada | null;
  rangDelatnost: number | null;
  ukupnoDelatnost: number | null;
};

export type VrstaVrednosti = "novac" | "broj" | "procenat" | "rang";

/** Smer u kom je vrednost povoljnija; null znači da se strane ne rangiraju. */
type Smer = "vece" | "manje" | null;

export type RedPoredjenja = {
  naziv: string;
  vrsta: VrstaVrednosti;
  /** Vrednost po strani, istim redosledom kojim su firme prosleđene. */
  vrednosti: (number | null)[];
  /**
   * Indeksi strana sa najpovoljnijom vrednošću. Prazno kad se red ne rangira,
   * kad manje od dve strane imaju podatak, ili kad su sve poznate vrednosti
   * jednake. Više indeksa znači neodlučeno na vrhu.
   */
  najbolji: number[];
  /** Kad je true, nula je legitiman podatak (starost, dani blokade). */
  nulaJePodatak?: boolean;
};

function najboljiIndeksi(vrednosti: (number | null)[], smer: Smer): number[] {
  if (smer === null) return [];

  const poznate = vrednosti.filter((v): v is number => v !== null);
  // Jedna vrednost nije poređenje, a jednake vrednosti nemaju pobednika.
  if (poznate.length < 2) return [];
  if (poznate.every((v) => v === poznate[0])) return [];

  const najbolja = smer === "vece" ? Math.max(...poznate) : Math.min(...poznate);
  return vrednosti.flatMap((v, i) => (v === najbolja ? [i] : []));
}

function red(
  naziv: string,
  vrsta: VrstaVrednosti,
  vrednosti: (number | null)[],
  smer: Smer,
  nulaJePodatak = false,
): RedPoredjenja {
  return { naziv, vrsta, vrednosti, najbolji: najboljiIndeksi(vrednosti, smer), nulaJePodatak };
}

/**
 * Neto rezultat ima smisla samo uz prihod. Firma bez prihoda ima `netoRezultat`
 * jednak nuli (dobitak minus gubitak, oba nula), a to nije "nula dinara dobiti"
 * nego "izveštaj nije predat".
 */
function netoUzPrihod(p: Pokazatelji): number | null {
  return p.prihodi === null ? null : p.netoRezultat;
}

/** Dana u blokadi u poslednjih 5 godina; firma bez reda u `blokade` ima nula. */
export function danaUBlokadi(strana: StranaPoredjenja): number {
  return strana.blokada?.ukupno_dana ?? 0;
}

/** Ima li firma aktivnu zabranu raspolaganja sredstvima. */
export function imaAktivnuBlokadu(strana: StranaPoredjenja): boolean {
  return Boolean(strana.blokada?.zabrana_prenosa);
}

/**
 * Redovi tabele poređenja, fiksnim redosledom.
 *
 * `naDan` je datum preseka, ne današnji dan — starost firme mora da se poklopi
 * sa onim što piše na stranici firme, a ta je keširana 30 dana.
 */
export function redoviPoredjenja(strane: StranaPoredjenja[], naDan: string): RedPoredjenja[] {
  const po = <T,>(uzmi: (s: StranaPoredjenja) => T): T[] => strane.map(uzmi);

  const redovi: RedPoredjenja[] = [
    red("Ukupan prihod", "novac", po((s) => s.pokazatelji.prihodi), "vece"),
    red("Neto rezultat", "novac", po((s) => netoUzPrihod(s.pokazatelji)), "vece"),
    red("Kapital", "novac", po((s) => s.pokazatelji.kapital), "vece"),
    red("Poslovna imovina", "novac", po((s) => s.pokazatelji.imovina), "vece"),
    // Više zaposlenih nije ni bolje ni gore — to je veličina, ne kvalitet.
    red("Zaposleni", "broj", po((s) => s.pokazatelji.zaposleni), null),
    red("Prihod po zaposlenom", "novac", po((s) => s.pokazatelji.prihodPoZaposlenom), "vece"),
    red("Neto marža", "procenat", po((s) => s.pokazatelji.netoMarza), "vece"),
    red("Učešće kapitala u imovini", "procenat", po((s) => s.pokazatelji.kapitalPremaImovini), "vece"),
  ];

  // Rang se poredi samo unutar iste delatnosti; 12. mesto u pekarama i 12. u
  // građevini nisu ista stvar. Uz tri firme dovoljna je jedna iz druge
  // delatnosti da red izgubi smisao.
  const delatnost = strane[0]?.firma.sifra_delatnosti;
  if (delatnost && strane.every((s) => s.firma.sifra_delatnosti === delatnost)) {
    redovi.push(red("Rang u delatnosti", "rang", po((s) => s.rangDelatnost), "manje"));
  }

  redovi.push(
    red("Starost (godina)", "broj", po((s) => starostUGodinama(s.firma.datum_osnivanja, naDan)), null, true),
    red("Dana u blokadi (5 godina)", "broj", po(danaUBlokadi), "manje", true),
  );

  return redovi;
}

const JEDNA_DECIMALA = new Intl.NumberFormat("sr-RS", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "A", "A i B", "A, B i C" — nabrajanje imena u srpskom. */
function nabroj(imena: string[]): string {
  if (imena.length <= 1) return imena[0] ?? "";
  return `${imena.slice(0, -1).join(", ")} i ${imena[imena.length - 1]}`;
}

/** "A ili B" za par, "A, B i C" za tri i više — naslov i H1 poređenja. */
export function naslovPoredjenja(imena: string[]): string {
  return imena.length === 2 ? `${imena[0]} ili ${imena[1]}` : nabroj(imena);
}

/** Koliko je puta veći veći broj. Null kad se odnos ne može izračunati. */
function odnos(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  const veci = Math.max(a, b);
  const manji = Math.min(a, b);
  if (manji <= 0 || veci <= 0) return null;
  return veci / manji;
}

/** Strana sa najvećom, odnosno najmanjom vrednošću datog pokazatelja. */
function krajevi(
  strane: StranaPoredjenja[],
  uzmi: (s: StranaPoredjenja) => number | null,
): { max: StranaPoredjenja; min: StranaPoredjenja; vrednostMax: number; vrednostMin: number } | null {
  const sa = strane.filter((s) => uzmi(s) !== null);
  if (sa.length < 2) return null;

  let max = sa[0];
  let min = sa[0];
  for (const s of sa) {
    if ((uzmi(s) as number) > (uzmi(max) as number)) max = s;
    if ((uzmi(s) as number) < (uzmi(min) as number)) min = s;
  }
  return { max, min, vrednostMax: uzmi(max) as number, vrednostMin: uzmi(min) as number };
}

/**
 * Zaključak poređenja: najviše tri rečenice, računate u kodu.
 *
 * Nije AI (CLAUDE.md dozvoljava AI samo za sažetak firme) i namerno ne donosi
 * sud o tome sa kim treba poslovati — samo konstatuje razliku u brojevima.
 * Redosled je po važnosti: status, pa blokada, pa veličina, pa profitabilnost.
 *
 * Formulacije se razlikuju za dve firme i za više njih: "a druga nema" je
 * tačno samo kad drugih ima tačno jedna.
 */
export function zakljucciPoredjenja(strane: StranaPoredjenja[]): string[] {
  const recenice: string[] = [];
  const par = strane.length === 2;

  // 1. Status je najjači signal — firma u stečaju se ne poredi po marži.
  const neaktivne = strane.filter(
    (s) => vrstaStatusa(s.firma.status, s.firma.status_aktivan) !== "aktivan",
  );
  if (neaktivne.length && neaktivne.length < strane.length) {
    if (neaktivne.length === 1) {
      const s = neaktivne[0];
      const ostale = strane.filter((d) => d !== s);
      recenice.push(
        `${s.ime} nije u statusu aktivne firme (${s.firma.status ?? "status nepoznat"}), ${
          par ? `dok ${ostale[0].ime} jeste` : "za razliku od ostalih u poređenju"
        }.`,
      );
    } else {
      recenice.push(`${nabroj(neaktivne.map((s) => s.ime))} nisu u statusu aktivne firme.`);
    }
  }

  // 2. Blokada računa.
  const uBlokadi = strane.filter(imaAktivnuBlokadu);
  if (uBlokadi.length === strane.length) {
    recenice.push(
      `${par ? "Obe firme imaju" : "Sve firme u poređenju imaju"} aktivnu blokadu računa u NBS registru prinudne naplate.`,
    );
  } else if (uBlokadi.length === 1) {
    const s = uBlokadi[0];
    const ostale = strane.filter((d) => d !== s);
    recenice.push(
      `${s.ime} ima aktivnu blokadu računa (zabrana prenosa od ${formatDatum(
        s.blokada?.zabrana_prenosa,
      )}), ${par ? `a ${ostale[0].ime} nema` : "a ostale nemaju"}.`,
    );
  } else if (uBlokadi.length > 1) {
    recenice.push(`${nabroj(uBlokadi.map((s) => s.ime))} imaju aktivnu blokadu računa.`);
  } else {
    const bile = strane.filter((s) => danaUBlokadi(s) > 0);
    if (bile.length && bile.length < strane.length) {
      const najduza = bile.reduce((a, b) => (danaUBlokadi(a) >= danaUBlokadi(b) ? a : b));
      recenice.push(
        bile.length === 1
          ? `${najduza.ime} je u poslednjih 5 godina bila u blokadi ${danaUBlokadi(najduza)} dana, a ${
              par ? strane.filter((d) => d !== najduza)[0].ime : "ostale"
            } nijednom.`
          : `${nabroj(bile.map((s) => s.ime))} su u poslednjih 5 godina bile u blokadi, najduže ${najduza.ime} (${danaUBlokadi(najduza)} dana).`,
      );
    }
  }

  // 3. Veličina.
  const saPrihodom = strane.filter((s) => s.pokazatelji.prihodi !== null);
  const bezPrihoda = strane.filter((s) => s.pokazatelji.prihodi === null);

  if (saPrihodom.length === 0) {
    recenice.push(
      `${par ? "Nijedna od dve firme" : "Nijedna firma u poređenju"} nema predat finansijski izveštaj, pa se brojevi ne porede.`,
    );
  } else if (saPrihodom.length === 1) {
    recenice.push(
      `${nabroj(bezPrihoda.map((s) => s.ime))} ${
        bezPrihoda.length === 1 ? "nema" : "nemaju"
      } predat finansijski izveštaj, pa se prihod poredi samo za ${saPrihodom[0].ime}.`,
    );
  } else {
    const k = krajevi(strane, (s) => s.pokazatelji.prihodi);
    const puta = k ? odnos(k.vrednostMax, k.vrednostMin) : null;

    if (puta !== null && puta >= 1.15 && k) {
      recenice.push(
        par
          ? `${k.max.ime} ima ${JEDNA_DECIMALA.format(puta)}× veći prihod.`
          : `Najveći prihod ima ${k.max.ime}, ${JEDNA_DECIMALA.format(puta)}× veći od najmanjeg (${k.min.ime}).`,
      );
    } else {
      recenice.push(
        par ? "Prihodi su im na sličnom nivou." : "Prihodi su im svima na sličnom nivou.",
      );
    }

    if (bezPrihoda.length) {
      recenice.push(
        `${nabroj(bezPrihoda.map((s) => s.ime))} ${
          bezPrihoda.length === 1 ? "nema" : "nemaju"
        } predat finansijski izveštaj.`,
      );
    }
  }

  // 4. Profitabilnost, samo kad razlika nije šum.
  const m = krajevi(strane, (s) => s.pokazatelji.netoMarza);
  if (m && m.vrednostMax - m.vrednostMin >= 2) {
    recenice.push(
      par
        ? `${m.max.ime} ima veću neto maržu, za ${JEDNA_DECIMALA.format(m.vrednostMax - m.vrednostMin)} procentnih poena.`
        : `Najveću neto maržu ima ${m.max.ime} (${formatProcenat(m.vrednostMax)}), najmanju ${m.min.ime} (${formatProcenat(m.vrednostMin)}).`,
    );
  }

  return recenice.slice(0, 3);
}

/**
 * Kanonski redosled firmi u URL-u: abecedno po slugu.
 *
 * `/uporedi/a/b` i `/uporedi/b/a` prikazuju isto, pa bez ovoga Google dobija
 * dva URL-a sa istim sadržajem. Sa tri firme ima šest permutacija, pa pravilo
 * postaje još važnije. Stranica se renderuje redosledom koji je korisnik
 * izabrao, a `canonical` uvek pokazuje na sortirani niz.
 */
export function kanonskiRedosled(slugovi: string[]): string[] {
  return [...slugovi].sort((a, b) => a.localeCompare(b));
}

/** Najveći dozvoljen odnos prihoda da bi poređenje bilo smisleno za indeks. */
const MAX_ODNOS_ZA_INDEKS = 5;

/**
 * Sme li poređenje u indeks.
 *
 * Parova ima 8,9 milijardi (133.634²), a trojki neuporedivo više, pa je
 * `noindex` podrazumevano stanje. U indeks ide samo uzak skup parova gde
 * poređenje nekome zaista odgovara na pitanje: ista delatnost, ista opština,
 * obe firme sa izveštajem i uporediva veličina (SEO.md §1.4, tanak sadržaj).
 *
 * Trojke se ne indeksiraju nikad — to je alat, ne stranica za pretragu.
 */
export function smeUIndeks(strane: StranaPoredjenja[]): boolean {
  if (strane.length !== 2) return false;

  const [a, b] = strane;
  if (!a.firma.sifra_delatnosti || a.firma.sifra_delatnosti !== b.firma.sifra_delatnosti) return false;
  if (!a.firma.sifra_opstine || a.firma.sifra_opstine !== b.firma.sifra_opstine) return false;

  const puta = odnos(a.pokazatelji.prihodi, b.pokazatelji.prihodi);
  return puta !== null && puta <= MAX_ODNOS_ZA_INDEKS;
}
