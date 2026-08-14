/**
 * Podaci za kategorijske stranice: delatnost, opština, ukrštena ruta i /najvece.
 *
 * Ove stranice su prvi saobraćaj (SEO.md §9) i istovremeno jedini način da
 * nijedna firma ne ostane orphan (SEO.md §2.3): lista ide kroz SVE firme u
 * grupi, i one bez izveštaja, samo na kraju (`nulls last`).
 *
 * Sve agregacije dolaze iz materijalizovanih view-ova, nikad iz runtime upita.
 */

import { cache } from "react";

import { imeOpstine, slugOpstine } from "./prikaz";
import {
  upitFirmePoMaticnimBrojevima,
  upitNaceKod,
  upitRangoviUDelatnosti,
  upitRangoviUDelatnostiIOpstini,
  upitRangoviUOpstini,
  upitStatistikaDelatnosti,
  upitStatistikaOpstine,
  upitTopFirme,
  type Finansije,
  type KarticaFirme,
  type MetrikaFinansija,
  type Opstina,
  type RangFirme,
  type StatistikaDelatnosti,
  type StatistikaOpstine,
} from "./queries";
import { getSupabaseServerClient } from "./supabase";

export const PO_STRANI = 50;

type Db = ReturnType<typeof getSupabaseServerClient>;

/**
 * Slug opštine -> red iz `municipalities`.
 *
 * `municipalities` ima 192 reda i menja se jednom u nekoliko godina, pa se
 * cela mapa učita jednom po zahtevu. Provereno: nijedna dva naziva ne daju
 * isti slug.
 */
export const mapaOpstina = cache(async (): Promise<Map<string, Opstina>> => {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from("municipalities")
    .select("sifra,naziv_lat,naziv_cir,okrug")
    .returns<Opstina[]>();

  const mapa = new Map<string, Opstina>();
  for (const red of data ?? []) {
    const slug = slugOpstine(red.naziv_lat);
    if (slug) mapa.set(slug, red);
  }
  return mapa;
});

/** Sve NACE šifre koje bar jedna firma zaista koristi (571 od 615 u šifarniku). */
export const sifreUUpotrebi = cache(async (): Promise<string[]> => {
  const db = getSupabaseServerClient();
  const sifre = new Set<string>();

  for (let od = 0; ; od += 1000) {
    const { data } = await db
      .from("mv_delatnost_stats")
      .select("sifra_delatnosti")
      .range(od, od + 999)
      .returns<{ sifra_delatnosti: string }[]>();

    if (!data?.length) break;
    for (const red of data) sifre.add(red.sifra_delatnosti);
    if (data.length < 1000) break;
  }

  return [...sifre];
});

export type Stranicenje = { strana: number; ukupno: number; poStrani: number; brojStrana: number };

export type ListaFirmi = { firme: KarticaFirme[]; stranicenje: Stranicenje };

export type PodaciDelatnosti = {
  sifra: string;
  naziv: string | null;
  stat: StatistikaDelatnosti | null;
  lista: ListaFirmi;
};

export type PodaciOpstine = {
  opstina: Opstina;
  naziv: string;
  stat: StatistikaOpstine | null;
  lista: ListaFirmi;
};

export type PodaciUkrstene = {
  sifra: string;
  nazivDelatnosti: string | null;
  opstina: Opstina;
  nazivOpstine: string;
  lista: ListaFirmi;
};

/** `/delatnost/[sifra]` */
export async function ucitajDelatnost(
  sifra: string,
  strana = 1,
): Promise<PodaciDelatnosti | null> {
  const db = getSupabaseServerClient();

  const [stat, nace, rangovi] = await Promise.all([
    upitStatistikaDelatnosti(db, sifra),
    upitNaceKod(db, sifra),
    upitRangoviUDelatnosti(db, sifra, { strana, poStrani: PO_STRANI }),
  ]);

  // Šifra koju nijedna firma ne koristi nema svoju stranicu.
  if (!stat.data) return null;

  const lista = await sklopiListu(db, rangovi.data ?? [], rangovi.count ?? 0, strana, "delatnost");

  return { sifra, naziv: nace.data?.naziv ?? null, stat: stat.data, lista };
}

/** `/grad/[opstina]` */
export async function ucitajGrad(slug: string, strana = 1): Promise<PodaciOpstine | null> {
  const opstina = (await mapaOpstina()).get(slug);
  if (!opstina) return null;

  const db = getSupabaseServerClient();
  const [stat, rangovi] = await Promise.all([
    upitStatistikaOpstine(db, opstina.sifra),
    upitRangoviUOpstini(db, opstina.sifra, { strana, poStrani: PO_STRANI }),
  ]);

  const lista = await sklopiListu(db, rangovi.data ?? [], rangovi.count ?? 0, strana, "opstina");

  return {
    opstina,
    naziv: imeOpstine(opstina.naziv_lat),
    stat: stat.data ?? null,
    lista,
  };
}

/**
 * `/delatnost/[sifra]/[opstina]` — ukrštena hub stranica (SEO.md §2.2).
 * Postoji samo za kombinacije sa najmanje 5 firmi, inače je to tanka stranica.
 */
export const MIN_ZA_UKRSTENU = 5;

export async function ucitajUkrsteno(
  sifra: string,
  slug: string,
  strana = 1,
): Promise<PodaciUkrstene | null> {
  const opstina = (await mapaOpstina()).get(slug);
  if (!opstina) return null;

  const db = getSupabaseServerClient();
  const [nace, rangovi] = await Promise.all([
    upitNaceKod(db, sifra),
    upitRangoviUDelatnostiIOpstini(db, sifra, opstina.sifra, { strana, poStrani: PO_STRANI }),
  ]);

  if ((rangovi.count ?? 0) < MIN_ZA_UKRSTENU) return null;

  const lista = await sklopiListu(db, rangovi.data ?? [], rangovi.count ?? 0, strana, "delatnost");

  return {
    sifra,
    nazivDelatnosti: nace.data?.naziv ?? null,
    opstina,
    nazivOpstine: imeOpstine(opstina.naziv_lat),
    lista,
  };
}

/** `/najvece/[metrika]` — top lista, bez paginacije. */
export async function ucitajNajvece(
  metrika: MetrikaFinansija,
  koliko = 100,
): Promise<KarticaFirme[]> {
  const db = getSupabaseServerClient();
  const { data } = await upitTopFirme(db, metrika, { limit: koliko });

  return (data ?? [])
    .map((red, i): KarticaFirme | null => {
      const firma = red.companies;
      if (!firma) return null;
      return {
        slug: firma.slug,
        maticni_broj: firma.maticni_broj,
        ime: firma.poslovno_ime,
        imeKratko: firma.poslovno_ime_kratko ?? null,
        opstina: firma.opstina,
        status: firma.status,
        status_aktivan: firma.status_aktivan,
        ukupni_prihodi: red.ukupni_prihodi,
        zaposleni: red.prosecan_broj_zaposlenih,
        godina: red.godina,
        rang: i + 1,
      };
    })
    .filter((r): r is KarticaFirme => r !== null);
}

/**
 * Rangovi iz view-a nose samo matične brojeve, pa se imena i broj zaposlenih
 * dovlače u dva paralelna upita nad tom stranom liste (najviše 50 redova).
 */
async function sklopiListu(
  db: Db,
  rangovi: RangFirme[],
  ukupno: number,
  strana: number,
  grupa: "delatnost" | "opstina",
): Promise<ListaFirmi> {
  const stranicenje: Stranicenje = {
    strana,
    ukupno,
    poStrani: PO_STRANI,
    brojStrana: Math.max(1, Math.ceil(ukupno / PO_STRANI)),
  };

  if (!rangovi.length) return { firme: [], stranicenje };

  const maticniBrojevi = rangovi.map((r) => r.maticni_broj);
  const [firme, finansije] = await Promise.all([
    upitFirmePoMaticnimBrojevima(db, maticniBrojevi),
    db
      .from("financials")
      .select("maticni_broj,godina,ukupni_prihodi,prosecan_broj_zaposlenih")
      .in("maticni_broj", maticniBrojevi)
      .returns<Finansije[]>(),
  ]);

  const poMb = new Map((firme.data ?? []).map((f) => [f.maticni_broj, f]));
  const fiPoMb = new Map((finansije.data ?? []).map((f) => [f.maticni_broj, f]));

  // Redosled je onaj iz view-a (prihod opadajuće, firme bez izveštaja na kraju).
  const redovi = rangovi
    .map((rang): KarticaFirme | null => {
      const firma = poMb.get(rang.maticni_broj);
      if (!firma) return null;
      const fi = fiPoMb.get(rang.maticni_broj);
      return {
        slug: firma.slug,
        maticni_broj: firma.maticni_broj,
        ime: firma.poslovno_ime,
        imeKratko: firma.poslovno_ime_kratko ?? null,
        opstina: firma.opstina,
        status: firma.status,
        status_aktivan: firma.status_aktivan,
        ukupni_prihodi: rang.ukupni_prihodi ?? fi?.ukupni_prihodi ?? null,
        zaposleni: fi?.prosecan_broj_zaposlenih ?? null,
        godina: rang.godina ?? fi?.godina ?? null,
        rang: grupa === "delatnost" ? rang.rang_delatnost : rang.rang_opstina,
      };
    })
    .filter((r): r is KarticaFirme => r !== null);

  return { firme: redovi, stranicenje };
}

/** Broj strane iz ?strana=N; sve neispravno je strana 1. */
export function brojStrane(vrednost: string | string[] | undefined): number {
  const sirovo = Array.isArray(vrednost) ? vrednost[0] : vrednost;
  const broj = Number(sirovo);
  return Number.isInteger(broj) && broj > 1 ? broj : 1;
}
