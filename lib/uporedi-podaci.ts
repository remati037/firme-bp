/**
 * Učitavanje podataka za rutu `/uporedi`.
 *
 * Namerno NE koristi `ucitajFirmu`: ona povlači AI sažetak, istoriju preseka,
 * račune, zabrane i šest sličnih firmi — oko dvadeset upita po firmi, a
 * poređenje od toga koristi manje od polovine. Ovde ide uzak set, dvaput
 * paralelno, pa je poređenje jeftinije od jedne stranice firme.
 */

import { maticniBrojIzSluga } from "./firma-podaci";
import { izracunajPokazatelje } from "./pokazatelji";
import { ucitajDatumPreseka } from "./presek";
import { kratkoIme } from "./prikaz";
import {
  upitBlokada,
  upitFirmePoMaticnimBrojevima,
  upitNaceKod,
  upitOpstina,
  upitPoslednjeFinansije,
  upitRangFirme,
  upitSlicneFirmePoPrihodu,
  upitStatistikaDelatnosti,
  type Finansije,
  type KarticaFirme,
  type NaceKod,
  type Opstina,
  type RangFirme,
} from "./queries";
import { getSupabaseServerClient } from "./supabase";
import type { StranaPoredjenja } from "./uporedi";

type Db = ReturnType<typeof getSupabaseServerClient>;

const KOLONE_FIRMA =
  "maticni_broj,slug,poslovno_ime,poslovno_ime_kratko,sifra_opstine,opstina,status,status_aktivan,datum_osnivanja,pravna_forma,sifra_delatnosti,pib,adresa";

export type StranaSaKontekstom = {
  strana: StranaPoredjenja;
  nace: NaceKod | null;
  opstinaRed: Opstina | null;
};

/**
 * Jedna strana poređenja. Vraća null kad slug nije ispravan ili firme nema —
 * pozivalac tada šalje 404, nikad 200 (SEO.md §1.3).
 */
export async function ucitajStranu(db: Db, slug: string): Promise<StranaSaKontekstom | null> {
  const maticniBroj = maticniBrojIzSluga(slug);
  if (!maticniBroj) return null;

  const { data: firma } = await db
    .from("companies")
    .select(KOLONE_FIRMA)
    .eq("maticni_broj", maticniBroj)
    .returns<StranaPoredjenja["firma"][]>()
    .maybeSingle();

  if (!firma) return null;

  const [fi, rang, blokada, nace, opstinaRed, statD] = await Promise.all([
    upitPoslednjeFinansije(db, maticniBroj),
    upitRangFirme(db, maticniBroj),
    upitBlokada(db, maticniBroj),
    firma.sifra_delatnosti ? upitNaceKod(db, firma.sifra_delatnosti) : Promise.resolve(null),
    firma.sifra_opstine ? upitOpstina(db, firma.sifra_opstine) : Promise.resolve(null),
    firma.sifra_delatnosti
      ? upitStatistikaDelatnosti(db, firma.sifra_delatnosti)
      : Promise.resolve(null),
  ]);

  return {
    strana: {
      firma,
      ime: kratkoIme(firma),
      fi: fi.data ?? null,
      pokazatelji: izracunajPokazatelje(fi.data, statD?.data ?? null),
      blokada: blokada.data ?? null,
      rangDelatnost: rang.data?.rang_delatnost ?? null,
      ukupnoDelatnost: rang.data?.ukupno_delatnost ?? null,
    },
    nace: nace?.data ?? null,
    opstinaRed: opstinaRed?.data ?? null,
  };
}

export type Poredjenje = {
  strane: StranaSaKontekstom[];
  datumPreseka: string;
};

/** Sve strane paralelno. Null ako ijedna firma ne postoji. */
export async function ucitajPoredjenje(slugovi: string[]): Promise<Poredjenje | null> {
  const db = getSupabaseServerClient();

  const [strane, datumPreseka] = await Promise.all([
    Promise.all(slugovi.map((slug) => ucitajStranu(db, slug))),
    ucitajDatumPreseka(),
  ]);

  if (strane.some((s) => s === null)) return null;
  return { strane: strane as StranaSaKontekstom[], datumPreseka };
}

export type JednaStrana = {
  a: StranaSaKontekstom;
  predlozi: KarticaFirme[];
  datumPreseka: string;
};

/** Prva strana plus predlozi za drugu, za `/uporedi/[slug]` bez para. */
export async function ucitajJednuStranu(slug: string): Promise<JednaStrana | null> {
  const db = getSupabaseServerClient();

  const [a, datumPreseka] = await Promise.all([ucitajStranu(db, slug), ucitajDatumPreseka()]);
  if (!a) return null;

  return { a, predlozi: await ucitajPredloge(db, a.strana), datumPreseka };
}

/**
 * Šest firmi koje ima smisla ponuditi kao drugu stranu: tri iz iste delatnosti
 * i tri iz iste opštine, po najbližem prihodu — ista logika kao "slične firme"
 * na stranici firme (SEO.md §2.1). Ovde nisu SEO linkovi nego prečica u
 * biranju, pa je dovoljno po jedna strana (firme ispod datog prihoda).
 */
async function ucitajPredloge(db: Db, strana: StranaPoredjenja): Promise<KarticaFirme[]> {
  const { firma } = strana;
  const prihod = strana.pokazatelji.prihodi ?? 0;

  const trazi = (grupa: "delatnost" | "opstina") =>
    upitSlicneFirmePoPrihodu(db, {
      sifraDelatnosti: grupa === "delatnost" ? (firma.sifra_delatnosti ?? undefined) : undefined,
      sifraOpstine: grupa === "opstina" ? (firma.sifra_opstine ?? undefined) : undefined,
      prihod,
      izuzmiMaticniBroj: firma.maticni_broj,
      // Firma bez prihoda nema nikog "ispod" sebe, pa se za nju gleda naviše.
      iznad: prihod === 0,
      limit: 3,
    });

  const [izDelatnosti, izOpstine] = await Promise.all([
    firma.sifra_delatnosti ? trazi("delatnost") : Promise.resolve(null),
    firma.sifra_opstine ? trazi("opstina") : Promise.resolve(null),
  ]);

  const redovi: RangFirme[] = [...(izDelatnosti?.data ?? [])];
  for (const red of izOpstine?.data ?? []) {
    if (!redovi.some((r) => r.maticni_broj === red.maticni_broj)) redovi.push(red);
  }
  if (!redovi.length) return [];

  const mb = redovi.map((r) => r.maticni_broj);
  const [firme, finansije] = await Promise.all([
    upitFirmePoMaticnimBrojevima(db, mb),
    db
      .from("financials")
      .select("maticni_broj,godina,ukupni_prihodi,prosecan_broj_zaposlenih")
      .in("maticni_broj", mb)
      .returns<Finansije[]>(),
  ]);

  const poMb = new Map((firme.data ?? []).map((f) => [f.maticni_broj, f]));
  const fiPoMb = new Map((finansije.data ?? []).map((f) => [f.maticni_broj, f]));

  return redovi
    .map((r) => {
      const f = poMb.get(r.maticni_broj);
      if (!f) return null;
      const fi = fiPoMb.get(r.maticni_broj);
      return {
        slug: f.slug,
        maticni_broj: f.maticni_broj,
        ime: f.poslovno_ime,
        imeKratko: f.poslovno_ime_kratko ?? null,
        opstina: f.opstina,
        status: f.status,
        status_aktivan: f.status_aktivan,
        ukupni_prihodi: r.ukupni_prihodi ?? fi?.ukupni_prihodi ?? null,
        zaposleni: fi?.prosecan_broj_zaposlenih ?? null,
        godina: r.godina ?? fi?.godina ?? null,
      } satisfies KarticaFirme;
    })
    .filter((r): r is KarticaFirme => r !== null);
}
