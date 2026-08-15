/**
 * Promena u odnosu na PRETHODNI MESEČNI PRESEK (D1).
 *
 * Ovo je jedina stvar koju konkurencija strukturno ne može da ponovi: svi
 * prikazuju poslednju godinu iz APR-a, a mi arhiviramo svaki mesečni presek u
 * `financials_history`, pa se vidi da li se broj pomerio između dva preuzimanja.
 *
 * Poređenje ide nad ISTOM godinom izveštaja u oba preseka — inače bi se
 * poredio izveštaj za 2025. sa izveštajem za 2024. i „rast" bi bio artefakt
 * smene godine, ne stvarna promena.
 *
 * Dok postoji samo jedan presek, funkcija vraća `null` i stranica ne prikazuje
 * ništa. Prvi delta prikaz stiže sa sledećim mesečnim ingestom.
 */

export type RedIstorije = {
  datum_preseka: string;
  godina: number;
  ukupni_prihodi: number | null;
  neto_dobitak: number | null;
  neto_gubitak: number | null;
  prosecan_broj_zaposlenih: number | null;
};

export type Promena = {
  /** Procentualna razlika; null kad se ne može izračunati. */
  procenat: number | null;
  /** Apsolutna razlika u istoj jedinici kao ulaz. */
  razlika: number | null;
  smer: "gore" | "dole" | "isto";
};

export type Promene = {
  /** Datum preseka sa kojim se poredi, za tekst „u odnosu na (30.06.)". */
  prethodniPresek: string;
  godina: number;
  prihodi: Promena | null;
  netoRezultat: Promena | null;
  zaposleni: Promena | null;
};

function razlika(sada: number | null, ranije: number | null): Promena | null {
  if (sada === null || ranije === null) return null;
  if (sada === ranije) return { procenat: 0, razlika: 0, smer: "isto" };

  const apsolutna = sada - ranije;
  // Deljenje nulom nema smisla: „rast sa nule" nije procenat nego pojava podatka.
  const procenat = ranije === 0 ? null : (apsolutna / Math.abs(ranije)) * 100;

  return { procenat, razlika: apsolutna, smer: apsolutna > 0 ? "gore" : "dole" };
}

const netoIz = (red: RedIstorije): number | null =>
  red.ukupni_prihodi === null && red.neto_dobitak === null && red.neto_gubitak === null
    ? null
    : (red.neto_dobitak ?? 0) - (red.neto_gubitak ?? 0);

/**
 * Ulaz su svi redovi istorije za jednu firmu, bilo kojim redosledom.
 * Uzimaju se dva najnovija preseka, pa unutar njih ista (najveća zajednička) godina.
 */
export function izracunajPromene(redovi: RedIstorije[]): Promene | null {
  if (redovi.length < 2) return null;

  const preseci = [...new Set(redovi.map((r) => r.datum_preseka))].sort().reverse();
  if (preseci.length < 2) return null;

  const [tekuci, prethodni] = preseci;
  const uTekucem = redovi.filter((r) => r.datum_preseka === tekuci);
  const uPrethodnom = redovi.filter((r) => r.datum_preseka === prethodni);

  // Ista godina u oba preseka; ako je nema, poređenje bi bilo besmisleno.
  const zajednicke = uTekucem
    .map((r) => r.godina)
    .filter((g) => uPrethodnom.some((r) => r.godina === g));
  if (!zajednicke.length) return null;

  const godina = Math.max(...zajednicke);
  const sada = uTekucem.find((r) => r.godina === godina);
  const ranije = uPrethodnom.find((r) => r.godina === godina);
  if (!sada || !ranije) return null;

  return {
    prethodniPresek: prethodni,
    godina,
    prihodi: razlika(sada.ukupni_prihodi, ranije.ukupni_prihodi),
    netoRezultat: razlika(netoIz(sada), netoIz(ranije)),
    zaposleni: razlika(sada.prosecan_broj_zaposlenih, ranije.prosecan_broj_zaposlenih),
  };
}
