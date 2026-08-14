/**
 * Pokazatelji firme — sve se računa u kodu, ništa u bazi u runtime-u.
 *
 * Ulaz su sirovi redovi iz `financials` i medijane iz `mv_delatnost_stats`.
 * Novčane vrednosti ostaju u HILJADAMA dinara (kako ih APR daje) sve do
 * `lib/format.ts`; procenti su procenti.
 *
 * Nula se tretira kao "nema podatka" (CLAUDE.md, pravilo 5), pa se pokazatelj
 * koji bi delio nulom vraća kao null umesto da izmisli broj.
 */

import type { Finansije, StatistikaDelatnosti } from "./queries";

export type Pokazatelji = {
  godina: number | null;
  prihodi: number | null;
  /** Neto dobitak umanjen za neto gubitak. Može biti negativan. */
  netoRezultat: number | null;
  zaposleni: number | null;
  kapital: number | null;
  imovina: number | null;
  /** Prihod po zaposlenom, u hiljadama dinara. */
  prihodPoZaposlenom: number | null;
  /** Neto marža u procentima. */
  netoMarza: number | null;
  /** Učešće kapitala u poslovnoj imovini, u procentima. */
  kapitalPremaImovini: number | null;
  /** Odstupanje prihoda po zaposlenom od medijane delatnosti, u procentima. */
  odstupanjePrihodaPoZaposlenom: number | null;
  /** Odstupanje ukupnog prihoda od medijane delatnosti, u procentima. */
  odstupanjePrihoda: number | null;
  /** Razlika marže i medijane marže, u procentnim poenima. */
  odstupanjeMarze: number | null;
};

function broj(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v) || v === 0) return null;
  return v;
}

/** Procentualno odstupanje vrednosti od osnovice. */
function odstupanje(vrednost: number | null, osnovica: number | null): number | null {
  if (vrednost === null || osnovica === null || osnovica === 0) return null;
  return ((vrednost - osnovica) / Math.abs(osnovica)) * 100;
}

export function izracunajPokazatelje(
  fi: Finansije | null | undefined,
  stat?: StatistikaDelatnosti | null,
): Pokazatelji {
  const prihodi = broj(fi?.ukupni_prihodi);
  const zaposleni = broj(fi?.prosecan_broj_zaposlenih);
  const kapital = fi?.kapital ?? null; // kapital sme da bude negativan, nula je i dalje podatak
  const imovina = broj(fi?.poslovna_imovina);

  const dobitak = fi?.neto_dobitak ?? 0;
  const gubitak = fi?.neto_gubitak ?? 0;
  const netoRezultat = fi ? dobitak - gubitak : null;

  const prihodPoZaposlenom = prihodi !== null && zaposleni !== null ? prihodi / zaposleni : null;
  const netoMarza = prihodi !== null && netoRezultat !== null ? (netoRezultat / prihodi) * 100 : null;
  const kapitalPremaImovini =
    kapital !== null && imovina !== null ? (kapital / imovina) * 100 : null;

  return {
    godina: fi?.godina ?? null,
    prihodi,
    netoRezultat,
    zaposleni,
    kapital,
    imovina,
    prihodPoZaposlenom,
    netoMarza,
    kapitalPremaImovini,
    odstupanjePrihodaPoZaposlenom: odstupanje(
      prihodPoZaposlenom,
      broj(stat?.medijan_prihoda_po_zaposlenom),
    ),
    odstupanjePrihoda: odstupanje(prihodi, broj(stat?.medijan_prihoda)),
    odstupanjeMarze:
      netoMarza !== null && stat?.medijan_marze !== null && stat?.medijan_marze !== undefined
        ? netoMarza - stat.medijan_marze
        : null,
  };
}

/**
 * Pozicija oznake na MetricBar-u, u procentima širine (0–100).
 * Sredina trake (50) je medijana delatnosti.
 *
 * Skala je logaritamska: dvostruko iznad medijane je na 75, dvostruko ispod
 * na 25. Linearna skala bi svaku veliku firmu zalepila za desnu ivicu.
 */
export function pozicijaNaTraci(odstupanjeUProcentima: number | null): number | null {
  if (odstupanjeUProcentima === null) return null;

  const odnos = 1 + odstupanjeUProcentima / 100;
  if (odnos <= 0) return 2;

  const pozicija = 50 + 25 * Math.log2(odnos);
  return Math.min(97, Math.max(3, pozicija));
}

/** Pozicija za razliku izraženu u procentnim poenima (marža). */
export function pozicijaZaPoene(razlikaUPoenima: number | null): number | null {
  if (razlikaUPoenima === null) return null;
  const pozicija = 50 + 50 * Math.tanh(razlikaUPoenima / 10);
  return Math.min(97, Math.max(3, pozicija));
}
