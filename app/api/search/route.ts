import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeIme } from "@/lib/normalize";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * Autocomplete pretraga firmi.
 *
 *   GET /api/search?q=hemofarm&limit=10
 *   -> { rezultati: [{ maticni_broj, slug, ime, opstina, status, status_aktivan,
 *                      sifra_delatnosti, delatnost_naziv }] }
 *
 * Upit se normalizuje istim `normalizeIme` koji je punio `poslovno_ime_norm`,
 * pa "ČAČAK", "cacak" i ćirilično "ЧАЧАК" daju isti rezultat. Zato ne treba
 * zasebna kolona za ćirilicu (SEO.md §1.8).
 *
 * PORE­DAK je ovde ceo posao. Naivna verzija je vraćala prvih N redova koje
 * baza nađe, pa je "nis" davao Pelzer i Pawpass umesto NIS-a, a "telekom"
 * uopšte nije nalazio Telekom Srbija: traženo se krilo među 166 pogodaka.
 *
 * Uz to, `poslovno_ime_norm` sada sadrži i skraćeno ime, ne samo puno.
 * Registrovano ime NIS-a je opisno i nigde ne sadrži "NIS", pa upit "nis"
 * ranije nije nalazio najpoznatiju firmu u zemlji. Isto je važilo za svih 99
 * ručnih imena. Zato je dovoljna jedna indeksirana kolona.
 *
 * Poredak MORA da se pravi u bazi. Sa `limit` bez `order by` Postgres vraća
 * proizvoljnih N pogodaka, pa se traženo krije među hiljadama ostalih.
 *
 * Vodeći upit ide preko `financials`, jer ta tabela ima pravi strani ključ ka
 * `companies`, pa PostgREST ume da filtrira po imenu i sortira po prihodu.
 * (`mv_company_ranks` nema strani ključ, PostgREST ga odbija.)
 *
 * Firme bez finansijskog reda (16.787 od 133.634) tim upitom ne mogu da se
 * nađu, pa ide i rezervni upit pravo nad `companies`.
 *
 * Šifarnik delatnosti se drži u memoriji: 615 redova koji se menjaju jednom
 * godišnje ne zaslužuju round trip po svakom kucanju.
 */

const PODRAZUMEVANO = 10;
const MAKSIMUM = 25;
const MIN_ZNAKOVA = 2;
const KANDIDATA = 100;

type RedFirme = {
  maticni_broj: string;
  slug: string;
  poslovno_ime_kratko: string | null;
  poslovno_ime: string;
  poslovno_ime_norm: string;
  opstina: string | null;
  status: string | null;
  status_aktivan: boolean | null;
  sifra_delatnosti: string | null;
};

let delatnosti: Map<string, string> | null = null;

/** Šifarnik se učita jednom po instanci, pa živi do gašenja. */
async function nazivDelatnosti(db: SupabaseClient): Promise<Map<string, string>> {
  if (delatnosti) return delatnosti;

  const mapa = new Map<string, string>();
  for (let od = 0; ; od += 1000) {
    const { data, error } = await db
      .from("nace_codes")
      .select("sifra, naziv")
      .order("sifra")
      .range(od, od + 999);

    if (error || !data?.length) break;
    for (const red of data as { sifra: string; naziv: string | null }[]) {
      if (red.naziv) mapa.set(red.sifra, red.naziv);
    }
    if (data.length < 1000) break;
  }

  // Prazna mapa se ne kešira, da se posle prolazne greške pokuša ponovo.
  if (mapa.size) delatnosti = mapa;
  return mapa;
}

export async function GET(request: Request): Promise<NextResponse> {
  const parametri = new URL(request.url).searchParams;
  const upit = normalizeIme(parametri.get("q") ?? "");

  const trazeno = Number(parametri.get("limit"));
  const limit = Number.isFinite(trazeno)
    ? Math.min(Math.max(Math.trunc(trazeno), 1), MAKSIMUM)
    : PODRAZUMEVANO;

  // Jedno slovo pogađa previše redova da bi rezultat značio išta.
  if (upit.length < MIN_ZNAKOVA) {
    return NextResponse.json({ rezultati: [] });
  }

  const db = getSupabaseServerClient();

  // Procenat i donja crta su LIKE džokeri, obrnuta kosa crta je beg znak.
  const uzorak = `%${upit.replace(/[\\%_]/g, (znak) => `\\${znak}`)}%`;
  const KOLONE =
    "maticni_broj, slug, poslovno_ime_kratko, poslovno_ime, poslovno_ime_norm, opstina, status, status_aktivan, sifra_delatnosti";

  // 1. Firme sa izveštajem, sortirane po prihodu u bazi.
  const { data: saPrihodom, error } = await db
    .from("financials")
    .select(`ukupni_prihodi, companies!inner(${KOLONE})`)
    .ilike("companies.poslovno_ime_norm", uzorak)
    .order("ukupni_prihodi", { ascending: false })
    .limit(KANDIDATA);

  if (error) {
    console.error("Pretraga:", error.message);
    // Pretraga nikad ne ruši stranicu; prazan rezultat je bolji od 500.
    return NextResponse.json({ rezultati: [] });
  }

  const prihod = new Map<string, number>();
  const nadjene = new Map<string, RedFirme>();

  for (const red of (saPrihodom ?? []) as unknown as {
    ukupni_prihodi: number | null;
    companies: RedFirme;
  }[]) {
    const firma = red.companies;
    prihod.set(firma.maticni_broj, Math.max(prihod.get(firma.maticni_broj) ?? 0, red.ukupni_prihodi ?? 0));
    nadjene.set(firma.maticni_broj, firma);
  }

  // 2. Rezerva za firme bez ijednog finansijskog reda; one nemaju prihod pa
  //    ionako idu na kraj liste.
  if (nadjene.size < limit) {
    const { data: bezPrihoda } = await db
      .from("companies")
      .select(KOLONE)
      .ilike("poslovno_ime_norm", uzorak)
      .limit(KANDIDATA);

    for (const firma of (bezPrihoda ?? []) as RedFirme[]) {
      if (!nadjene.has(firma.maticni_broj)) nadjene.set(firma.maticni_broj, firma);
    }
  }

  if (!nadjene.size) {
    return NextResponse.json({ rezultati: [] });
  }

  const izabrani = [...nadjene.values()]
    .map((red) => ({
      red,
      // Ko kuca "hemo" očekuje Hemofarm pre firme koja "hemo" ima u sredini.
      pocinje: red.poslovno_ime_norm.startsWith(upit) ? 0 : 1,
      prihod: prihod.get(red.maticni_broj) ?? 0,
    }))
    .sort((a, b) => a.pocinje - b.pocinje || b.prihod - a.prihod)
    .slice(0, limit);

  const sifarnik = await nazivDelatnosti(db);

  const rezultati = izabrani.map(({ red }) => ({
    maticni_broj: red.maticni_broj,
    slug: red.slug,
    // Isto ime koje stoji u H1, ne puno poslovno ime.
    ime: red.poslovno_ime_kratko || red.poslovno_ime,
    opstina: red.opstina,
    status: red.status,
    status_aktivan: red.status_aktivan,
    sifra_delatnosti: red.sifra_delatnosti,
    delatnost_naziv: red.sifra_delatnosti ? (sifarnik.get(red.sifra_delatnosti) ?? null) : null,
  }));

  return NextResponse.json(
    { rezultati },
    {
      headers: {
        // Isti upit se ponavlja dok korisnik kuca, pa kratak keš na ivici
        // skida najveći deo saobraćaja sa baze.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
