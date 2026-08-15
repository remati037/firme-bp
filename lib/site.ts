/**
 * Konstante sajta.
 *
 * `DATUM_PRESEKA` i `BROJ_FIRMI` su u Fazi A placeholderi iz env varijabli.
 * Od Faze C se čitaju iz tabele `snapshots` (vidi lib/queries.ts,
 * `upitPoslednjiPresek`), pa se ove konstante koriste samo kao fallback dok
 * upit ne postoji ili padne.
 */

/** Apsolutni URL sajta. Bez završne kose crte, bez duplog protokola (SEO.md §3). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://firme.biznisprice.com"
).replace(/\/+$/, "");

export const BREND = "Biznis priče";

/** ISO datum poslednjeg APR preseka. */
export const DATUM_PRESEKA = process.env.NEXT_PUBLIC_DATUM_PRESEKA ?? "2026-07-31";

/** Broj firmi u setu, za trust liniju na početnoj. */
export const BROJ_FIRMI = Number(process.env.NEXT_PUBLIC_BROJ_FIRMI ?? 133634);

/**
 * Kurs za prikaz u evrima (NBS srednji kurs).
 *
 * Statična vrednost, menja se jednom mesečno uz APR presek — isti trenutak kad
 * i ingest (odluka 15.08.2026). Namerno nije živi kurs: stranice su keširane
 * 30 dana, pa bi živi kurs značio da dve posete istog dana pokažu dva broja.
 */
export const KURS_EUR_RSD = Number(process.env.NEXT_PUBLIC_KURS_EUR_RSD ?? 117.0);

/**
 * Disclaimer uz izvor podataka. Obavezan u futeru svake stranice
 * (CLAUDE.md, "Obavezno na svakoj stranici").
 */
export const DISCLAIMER =
  "Podaci na ovom sajtu nisu bonitetna ocena i ne predstavljaju savet. Prikazani podaci su isključivo informativnog karaktera.";

/** Apsolutni URL za canonical i og:url. */
export function apsolutniUrl(putanja: string): string {
  return `${SITE_URL}${putanja.startsWith("/") ? putanja : `/${putanja}`}`;
}
