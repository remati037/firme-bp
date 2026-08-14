/**
 * Deterministički narativ za sekciju "Analiza".
 *
 * Ovo je ~70 odsto te sekcije i istovremeno odbrana od Google-ovog filtera za
 * scaled content abuse (SEO.md §1.6): rečenice se sastavljaju iz brojeva u
 * bazi, izračunate su u kodu i proverljivo tačne. AI dodaje samo interpretaciju
 * u jednom do dva pasusa, i to iz `ai_summaries`, serverski.
 *
 * Pravila za rečenice (SEO.md §7):
 *  - svaka rečenica stoji sama za sebe: ima ime firme ili jasan subjekat,
 *    broj i kontekst uz taj broj
 *  - loše: "23% iznad proseka"; dobro: "23 odsto iznad medijane delatnosti 4690"
 *  - nijedna tvrdnja ne izlazi izvan prosleđenih brojeva
 */

import { formatBroj, formatRSD, pluralSrpski } from "./format";
import type { Pokazatelji } from "./pokazatelji";

export type NarativUlaz = {
  /** Skraćeno poslovno ime, isto ono koje je u H1. */
  ime: string;
  pokazatelji: Pokazatelji;
  /** Godina izveštaja; kad izveštaja nema, godina poslednjeg preseka. */
  godina: number | null;
  sifraDelatnosti?: string | null;
  nazivDelatnosti?: string | null;
  medijanPrihodaPoZaposlenom?: number | null;
  medijanPrihoda?: number | null;
  brojFirmiUDelatnosti?: number | null;
  rangDelatnost?: number | null;
  ukupnoDelatnost?: number | null;
  rangOpstina?: number | null;
  ukupnoOpstina?: number | null;
  opstina?: string | null;
};

const zaokruzi = (v: number): number => Math.round(Math.abs(v));

function delatnostUZagradi(ulaz: NarativUlaz): string {
  const naziv = ulaz.nazivDelatnosti?.trim();
  if (ulaz.sifraDelatnosti && naziv) return `${ulaz.sifraDelatnosti} (${naziv.toLowerCase()})`;
  if (ulaz.sifraDelatnosti) return ulaz.sifraDelatnosti;
  return naziv ? naziv.toLowerCase() : "";
}

/**
 * Vraća niz samostalnih rečenica. Stranica ih spaja u pasus, ali svaka
 * rečenica mora da ima smisla i izvučena iz konteksta (format koji LLM citira).
 */
export function narativ(ulaz: NarativUlaz): string[] {
  const p = ulaz.pokazatelji;
  const recenice: string[] = [];

  if (p.prihodi === null) {
    return narativBezFinansija(ulaz);
  }

  const godina = p.godina ?? ulaz.godina;

  // 1. Prihod, zaposleni, prihod po zaposlenom
  if (p.zaposleni !== null && p.prihodPoZaposlenom !== null) {
    recenice.push(
      `Firma ${ulaz.ime} je u ${godina}. ostvarila prihod od ${formatRSD(p.prihodi)} sa ${formatBroj(
        p.zaposleni,
      )} ${pluralSrpski(p.zaposleni, "zaposlenim", "zaposlena", "zaposlenih")}, što je ${formatRSD(
        p.prihodPoZaposlenom,
      )} po zaposlenom.`,
    );
  } else {
    recenice.push(
      `Firma ${ulaz.ime} je u ${godina}. ostvarila prihod od ${formatRSD(p.prihodi)}.`,
    );
  }

  // 2. Poređenje sa medijanom delatnosti
  const delatnost = delatnostUZagradi(ulaz);
  if (p.odstupanjePrihodaPoZaposlenom !== null && ulaz.medijanPrihodaPoZaposlenom) {
    // Zaokruženo na nulu znači "isto kao medijana" — tada nema smisla pisati
    // "0 odsto ispod" (dešava se i kad je firma jedina sa izveštajem u delatnosti).
    const razlika = zaokruzi(p.odstupanjePrihodaPoZaposlenom);
    const smer = p.odstupanjePrihodaPoZaposlenom >= 0 ? "iznad" : "ispod";
    recenice.push(
      razlika === 0
        ? `To je na nivou medijane delatnosti ${delatnost}, koja iznosi ${formatRSD(
            ulaz.medijanPrihodaPoZaposlenom,
          )} po zaposlenom.`
        : `To je ${formatBroj(razlika)} odsto ${smer} medijane delatnosti ${delatnost}, koja iznosi ${formatRSD(
            ulaz.medijanPrihodaPoZaposlenom,
          )} po zaposlenom.`,
    );
  } else if (p.odstupanjePrihoda !== null && ulaz.medijanPrihoda) {
    const smer = p.odstupanjePrihoda >= 0 ? "iznad" : "ispod";
    recenice.push(
      `Prihod firme ${ulaz.ime} je ${formatBroj(zaokruzi(p.odstupanjePrihoda), { nulaJePodatak: true })} odsto ${smer} medijane delatnosti ${delatnost}, koja iznosi ${formatRSD(
        ulaz.medijanPrihoda,
      )}.`,
    );
  }

  // 3. Neto rezultat i marža
  if (p.netoRezultat !== null && p.netoRezultat !== 0) {
    const dobitak = p.netoRezultat > 0;
    const marza =
      p.netoMarza !== null
        ? `, što je neto marža od ${formatBroj(Math.round(Math.abs(p.netoMarza)), { nulaJePodatak: true })} odsto`
        : "";
    recenice.push(
      `U istoj godini firma je prijavila ${dobitak ? "neto dobitak" : "neto gubitak"} od ${formatRSD(
        Math.abs(p.netoRezultat),
      )}${marza}.`,
    );
  }

  // 4. Rang u delatnosti i opštini
  const rangovi: string[] = [];
  if (ulaz.rangDelatnost) {
    rangovi.push(
      `${formatBroj(ulaz.rangDelatnost)}. u delatnosti ${ulaz.sifraDelatnosti ?? ""}`.trim() +
        (ulaz.ukupnoDelatnost
          ? ` (od ${formatBroj(ulaz.ukupnoDelatnost)} ${pluralSrpski(
              ulaz.ukupnoDelatnost,
              "firme",
              "firme",
              "firmi",
            )} sa izveštajem)`
          : ""),
    );
  }
  if (ulaz.rangOpstina && ulaz.opstina) {
    rangovi.push(
      `${formatBroj(ulaz.rangOpstina)}. u opštini ${ulaz.opstina}` +
        (ulaz.ukupnoOpstina ? ` (od ${formatBroj(ulaz.ukupnoOpstina)})` : ""),
    );
  }
  if (rangovi.length) {
    recenice.push(`Po ukupnom prihodu firma ${ulaz.ime} je ${rangovi.join(" i ")}.`);
  }

  return recenice;
}

/**
 * Šablon za 27 odsto seta bez upotrebljivih finansija (SEO.md §1.4).
 * Umesto praznih tabela ide jasna rečenica plus kontekst delatnosti i opštine,
 * pa stranica i dalje ima svrhu.
 */
function narativBezFinansija(ulaz: NarativUlaz): string[] {
  const recenice: string[] = [];
  const godina = ulaz.godina;

  recenice.push(
    godina
      ? `Firma ${ulaz.ime} nije predala finansijski izveštaj za ${godina}. godinu.`
      : `Za firmu ${ulaz.ime} ne postoji finansijski izveštaj u poslednjem APR preseku.`,
  );

  const delatnost = delatnostUZagradi(ulaz);
  if (delatnost && ulaz.brojFirmiUDelatnosti) {
    const medijan = ulaz.medijanPrihoda
      ? `, a medijan prihoda u toj delatnosti iznosi ${formatRSD(ulaz.medijanPrihoda)}`
      : "";
    recenice.push(
      `U delatnosti ${delatnost} registrovano je ${formatBroj(ulaz.brojFirmiUDelatnosti)} ${pluralSrpski(
        ulaz.brojFirmiUDelatnosti,
        "firma",
        "firme",
        "firmi",
      )}${medijan}.`,
    );
  }

  if (ulaz.opstina) {
    recenice.push(
      `Firma ${ulaz.ime} je registrovana u opštini ${ulaz.opstina} i vodi se u APR registru privrednih društava.`,
    );
  }

  return recenice;
}
