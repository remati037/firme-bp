/**
 * Definicije upita nad Supabase šemom.
 *
 * Faza A postavlja samo definicije — nijedan upit se u ovoj fazi ne poziva.
 * Svaka funkcija vraća PostgREST builder; upit ide na mrežu tek kad se
 * `await`-uje, pa je bezbedno uvoziti ih bilo gde.
 *
 * Pravila (CLAUDE.md, SEO.md §6):
 *  - nikakva agregacija u runtime-u: medijane i rangovi isključivo iz
 *    materijalizovanih view-ova `mv_delatnost_stats`, `mv_opstina_stats`,
 *    `mv_company_ranks`
 *  - novčane vrednosti ostaju u hiljadama dinara sve do `lib/format.ts`
 *  - stranica firme se u Fazi B sklapa paralelnim upitima (`Promise.all`).
 *    Jedan RPC upit (SEO.md §6) se uvodi tek ako p95 TTFB na hladan ISR
 *    pređe 500 ms — i tek uz odobrenje vlasnika, jer je `CREATE FUNCTION`
 *    migracija (odluka 14.08.2026).
 *
 * Šema je zaključana: ne dodaji kolone ni tabele bez odobrenja vlasnika.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// Tipovi redova
// =============================================================================

export type Firma = {
  maticni_broj: string;
  slug: string;
  poslovno_ime: string;
  /** Skraćeno ime iz migracije 003; može biti null za redove pre regeneracije. */
  poslovno_ime_kratko?: string | null;
  sifra_opstine: string | null;
  opstina: string | null;
  status: string | null;
  status_aktivan: boolean | null;
  datum_osnivanja: string | null;
  pravna_forma: string | null;
  sifra_delatnosti: string | null;
  pib: string | null;
};

/** Sve novčane kolone su u hiljadama dinara. */
export type Finansije = {
  maticni_broj: string;
  godina: number;
  poslovna_imovina: number | null;
  kapital: number | null;
  gubitak: number | null;
  ukupni_prihodi: number | null;
  neto_dobitak: number | null;
  neto_gubitak: number | null;
  prosecan_broj_zaposlenih: number | null;
};

export type RangFirme = {
  maticni_broj: string;
  sifra_delatnosti: string | null;
  sifra_opstine: string | null;
  godina: number | null;
  ukupni_prihodi: number | null;
  rang_delatnost: number | null;
  ukupno_delatnost: number;
  rang_opstina: number | null;
  ukupno_opstina: number;
};

/** `medijan_marze` je u procentima, ostale medijane u hiljadama dinara. */
export type StatistikaDelatnosti = {
  sifra_delatnosti: string;
  godina: number | null;
  broj_firmi: number;
  broj_aktivnih: number;
  broj_sa_izvestajem: number;
  medijan_prihoda: number | null;
  medijan_marze: number | null;
  medijan_prihoda_po_zaposlenom: number | null;
};

export type StatistikaOpstine = Omit<StatistikaDelatnosti, "sifra_delatnosti"> & {
  sifra_opstine: string;
  opstina: string | null;
};

export type NaceKod = { sifra: string; naziv: string | null; sektor: string | null };

export type Opstina = {
  sifra: string;
  naziv_lat: string | null;
  naziv_cir: string | null;
  okrug: string | null;
};

export type AiSazetak = {
  maticni_broj: string;
  datum_preseka: string | null;
  summary: string | null;
  model: string | null;
  generated_at: string;
};

export type Presek = {
  datum_preseka: string;
  broj_firmi: number | null;
  broj_fi: number | null;
};

/** Firma sa ugnežđenim poslednjim finansijskim izveštajem (PostgREST embed). */
export type FinansijeSaFirmom = Finansije & { companies: Firma | null };

// =============================================================================
// Spiskovi kolona
// =============================================================================

export const KOLONE_FIRMA =
  "maticni_broj,slug,poslovno_ime,sifra_opstine,opstina,status,status_aktivan,datum_osnivanja,pravna_forma,sifra_delatnosti,pib";

export const KOLONE_FINANSIJE =
  "maticni_broj,godina,poslovna_imovina,kapital,gubitak,ukupni_prihodi,neto_dobitak,neto_gubitak,prosecan_broj_zaposlenih";

/** Kraći skup za kartice i liste — manje bajtova po redu na 133k stranica. */
export const KOLONE_FIRMA_KARTICA =
  "maticni_broj,slug,poslovno_ime,poslovno_ime_kratko,opstina,sifra_delatnosti,status,status_aktivan";

// =============================================================================
// Firma
// =============================================================================

/** Stranica firme: `/firma/[slug]`. */
export function upitFirmaPoSlugu(db: SupabaseClient, slug: string) {
  return db
    .from("companies")
    .select(KOLONE_FIRMA)
    .eq("slug", slug)
    .returns<Firma[]>()
    .maybeSingle();
}

/**
 * Provera sluga (SEO.md §1.3): matični broj iz sluga postoji, ali se slug ne
 * poklapa sa kanonskim → 301 na kanonski, ne 200.
 */
export function upitFirmaPoMaticnomBroju(db: SupabaseClient, maticniBroj: string) {
  return db
    .from("companies")
    .select(KOLONE_FIRMA)
    .eq("maticni_broj", maticniBroj)
    .returns<Firma[]>()
    .maybeSingle();
}

/** Sve godine izveštaja za firmu, najnovija prva. */
export function upitFinansije(db: SupabaseClient, maticniBroj: string) {
  return db
    .from("financials")
    .select(KOLONE_FINANSIJE)
    .eq("maticni_broj", maticniBroj)
    .order("godina", { ascending: false })
    .returns<Finansije[]>();
}

export function upitPoslednjeFinansije(db: SupabaseClient, maticniBroj: string) {
  return db
    .from("financials")
    .select(KOLONE_FINANSIJE)
    .eq("maticni_broj", maticniBroj)
    .order("godina", { ascending: false })
    .limit(1)
    .returns<Finansije[]>()
    .maybeSingle();
}

/** Rang u delatnosti i opštini. Firme bez izveštaja imaju rang null. */
export function upitRangFirme(db: SupabaseClient, maticniBroj: string) {
  return db
    .from("mv_company_ranks")
    .select(
      "maticni_broj,sifra_delatnosti,sifra_opstine,godina,ukupni_prihodi,rang_delatnost,ukupno_delatnost,rang_opstina,ukupno_opstina",
    )
    .eq("maticni_broj", maticniBroj)
    .returns<RangFirme[]>()
    .maybeSingle();
}

/** AI pasus za sekciju "Analiza". Čita se serverski, nikad klijentski (SEO.md §1.6). */
export function upitAiSazetak(db: SupabaseClient, maticniBroj: string) {
  return db
    .from("ai_summaries")
    .select("maticni_broj,datum_preseka,summary,model,generated_at")
    .eq("maticni_broj", maticniBroj)
    .returns<AiSazetak[]>()
    .maybeSingle();
}

// =============================================================================
// Statistika kategorija (materijalizovani view-ovi)
// =============================================================================

const KOLONE_STAT =
  "godina,broj_firmi,broj_aktivnih,broj_sa_izvestajem,medijan_prihoda,medijan_marze,medijan_prihoda_po_zaposlenom";

export function upitStatistikaDelatnosti(db: SupabaseClient, sifraDelatnosti: string) {
  return db
    .from("mv_delatnost_stats")
    .select(`sifra_delatnosti,${KOLONE_STAT}`)
    .eq("sifra_delatnosti", sifraDelatnosti)
    .returns<StatistikaDelatnosti[]>()
    .maybeSingle();
}

export function upitStatistikaOpstine(db: SupabaseClient, sifraOpstine: string) {
  return db
    .from("mv_opstina_stats")
    .select(`sifra_opstine,opstina,${KOLONE_STAT}`)
    .eq("sifra_opstine", sifraOpstine)
    .returns<StatistikaOpstine[]>()
    .maybeSingle();
}

/** Najveće delatnosti po broju firmi — blok "Delatnosti" na početnoj. */
export function upitNajveceDelatnosti(db: SupabaseClient, limit = 8) {
  return db
    .from("mv_delatnost_stats")
    .select(`sifra_delatnosti,${KOLONE_STAT}`)
    .order("broj_firmi", { ascending: false })
    .limit(limit)
    .returns<StatistikaDelatnosti[]>();
}

/** Najveće opštine po broju firmi — blok "Opštine" na početnoj. */
export function upitNajveceOpstine(db: SupabaseClient, limit = 8) {
  return db
    .from("mv_opstina_stats")
    .select(`sifra_opstine,opstina,${KOLONE_STAT}`)
    .order("broj_firmi", { ascending: false })
    .limit(limit)
    .returns<StatistikaOpstine[]>();
}

// =============================================================================
// Šifarnici
// =============================================================================

export function upitNaceKod(db: SupabaseClient, sifra: string) {
  return db
    .from("nace_codes")
    .select("sifra,naziv,sektor")
    .eq("sifra", sifra)
    .returns<NaceKod[]>()
    .maybeSingle();
}

/** Nazivi delatnosti za spisak šifara (view-ovi nemaju naziv, samo šifru). */
export function upitNaceKodovi(db: SupabaseClient, sifre: string[]) {
  return db.from("nace_codes").select("sifra,naziv,sektor").in("sifra", sifre).returns<NaceKod[]>();
}

export function upitOpstina(db: SupabaseClient, sifra: string) {
  return db
    .from("municipalities")
    .select("sifra,naziv_lat,naziv_cir,okrug")
    .eq("sifra", sifra)
    .returns<Opstina[]>()
    .maybeSingle();
}

/** Ćirilični oblik opštine za liniju "Ćirilica: ..." i `alternateName` (SEO.md §1.8). */
export function upitOpstine(db: SupabaseClient, sifre: string[]) {
  return db
    .from("municipalities")
    .select("sifra,naziv_lat,naziv_cir,okrug")
    .in("sifra", sifre)
    .returns<Opstina[]>();
}

// =============================================================================
// Top liste i kategorijske liste
// =============================================================================

/**
 * Metrike za `/najvece/[metrika]` u v1: prihod, dobit, zaposleni.
 * "Prihod po zaposlenom" nije kolona, pa se ne može sortirati u bazi bez
 * novog view-a — odloženo za v2 (odluka 14.08.2026).
 */
export const METRIKE_FINANSIJA = {
  prihod: "ukupni_prihodi",
  dobit: "neto_dobitak",
  zaposleni: "prosecan_broj_zaposlenih",
} as const;

export type MetrikaFinansija = keyof typeof METRIKE_FINANSIJA;

/**
 * Top firme po jednoj metrici, sa ugnežđenim podacima firme.
 * Embed radi jer `financials` ima strani ključ ka `companies`.
 *
 */
export function upitTopFirme(
  db: SupabaseClient,
  metrika: MetrikaFinansija,
  { limit = 5, godina }: { limit?: number; godina?: number } = {},
) {
  let upit = db
    .from("financials")
    .select(`${KOLONE_FINANSIJE},companies!inner(${KOLONE_FIRMA_KARTICA})`);

  if (godina !== undefined) upit = upit.eq("godina", godina);

  return upit
    .gt(METRIKE_FINANSIJA[metrika], 0)
    .order(METRIKE_FINANSIJA[metrika], { ascending: false })
    .limit(limit)
    .returns<FinansijeSaFirmom[]>();
}

/**
 * Rangovi firmi u delatnosti, sortirano po prihodu — osnova za `/delatnost/[sifra]`.
 * `mv_company_ranks` nema strani ključ, pa nema embed-a: imena firmi se dovlače
 * drugim upitom (`upitFirmePoMaticnimBrojevima`).
 */
export function upitRangoviUDelatnosti(
  db: SupabaseClient,
  sifraDelatnosti: string,
  { strana = 1, poStrani = 50 }: { strana?: number; poStrani?: number } = {},
) {
  const od = (strana - 1) * poStrani;
  return db
    .from("mv_company_ranks")
    .select("maticni_broj,ukupni_prihodi,godina,rang_delatnost,ukupno_delatnost", {
      count: "exact",
    })
    .eq("sifra_delatnosti", sifraDelatnosti)
    .order("ukupni_prihodi", { ascending: false, nullsFirst: false })
    .range(od, od + poStrani - 1)
    .returns<RangFirme[]>();
}

export function upitRangoviUOpstini(
  db: SupabaseClient,
  sifraOpstine: string,
  { strana = 1, poStrani = 50 }: { strana?: number; poStrani?: number } = {},
) {
  const od = (strana - 1) * poStrani;
  return db
    .from("mv_company_ranks")
    .select("maticni_broj,ukupni_prihodi,godina,rang_opstina,ukupno_opstina", { count: "exact" })
    .eq("sifra_opstine", sifraOpstine)
    .order("ukupni_prihodi", { ascending: false, nullsFirst: false })
    .range(od, od + poStrani - 1)
    .returns<RangFirme[]>();
}

/** Ukrštena ruta `/delatnost/[sifra]/[opstina]` — samo kombinacije sa 5+ firmi (SEO.md §2.2). */
export function upitRangoviUDelatnostiIOpstini(
  db: SupabaseClient,
  sifraDelatnosti: string,
  sifraOpstine: string,
  { strana = 1, poStrani = 50 }: { strana?: number; poStrani?: number } = {},
) {
  const od = (strana - 1) * poStrani;
  return db
    .from("mv_company_ranks")
    .select("maticni_broj,ukupni_prihodi,godina,rang_delatnost,rang_opstina", { count: "exact" })
    .eq("sifra_delatnosti", sifraDelatnosti)
    .eq("sifra_opstine", sifraOpstine)
    .order("ukupni_prihodi", { ascending: false, nullsFirst: false })
    .range(od, od + poStrani - 1)
    .returns<RangFirme[]>();
}

export function upitFirmePoMaticnimBrojevima(db: SupabaseClient, maticniBrojevi: string[]) {
  return db
    .from("companies")
    .select(KOLONE_FIRMA_KARTICA)
    .in("maticni_broj", maticniBrojevi)
    .returns<Firma[]>();
}

/**
 * Slične firme: 3 iz iste delatnosti + 3 iz iste opštine, najbliži prihod
 * (SEO.md §2.1). Ovde je jedna strana poređenja — pozvati dvaput, sa
 * `ascending: false` za firme ispod i `true` za firme iznad datog prihoda.
 */
export function upitSlicneFirmePoPrihodu(
  db: SupabaseClient,
  {
    sifraDelatnosti,
    sifraOpstine,
    prihod,
    izuzmiMaticniBroj,
    iznad,
    limit = 3,
  }: {
    sifraDelatnosti?: string;
    sifraOpstine?: string;
    prihod: number;
    izuzmiMaticniBroj: string;
    iznad: boolean;
    limit?: number;
  },
) {
  let upit = db
    .from("mv_company_ranks")
    .select("maticni_broj,sifra_delatnosti,sifra_opstine,ukupni_prihodi,godina");

  if (sifraDelatnosti) upit = upit.eq("sifra_delatnosti", sifraDelatnosti);
  if (sifraOpstine) upit = upit.eq("sifra_opstine", sifraOpstine);

  return upit
    .neq("maticni_broj", izuzmiMaticniBroj)
    .filter("ukupni_prihodi", iznad ? "gt" : "lt", prihod)
    .order("ukupni_prihodi", { ascending: iznad })
    .limit(limit)
    .returns<RangFirme[]>();
}

// =============================================================================
// Pretraga (Faza C)
// =============================================================================

/**
 * Autocomplete nad `poslovno_ime_norm` (GIN indeks, `gin_trgm_ops`).
 *
 * Rešenje za v1 (odluka 14.08.2026): `ilike` nad trigram indeksom, redosled
 * po prihodu. Sortiranje po `similarity()` traži `CREATE FUNCTION` i uvodi se
 * samo ako merenja u Fazi C pokažu da je redosled loš.
 *
 * Upit se pre poziva normalizuje (`lib/normalize.ts`) i transliteriše
 * (`lib/transliterate.ts`), da ćirilični upiti rade bez druge kolone.
 */
export function upitPretraga(db: SupabaseClient, upitNormalizovan: string, limit = 10) {
  return db
    .from("companies")
    .select(KOLONE_FIRMA_KARTICA)
    .ilike("poslovno_ime_norm", `%${upitNormalizovan}%`)
    .limit(limit)
    .returns<Firma[]>();
}

// =============================================================================
// Presek podataka
// =============================================================================

/** Datum poslednjeg APR preseka i broj firmi — trust linija, futer, `lastmod`. */
export function upitPoslednjiPresek(db: SupabaseClient) {
  return db
    .from("snapshots")
    .select("datum_preseka,broj_firmi,broj_fi")
    .order("datum_preseka", { ascending: false })
    .limit(1)
    .returns<Presek[]>()
    .maybeSingle();
}
