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
 * zasebna kolona za ćirilicu (SEO.md §1.8). Normalizacija ne dira cifre, pa
 * isti upit služi i za traženje po broju.
 *
 * Traži se po imenu, matičnom broju i PIB-u. Čist broj se prvo gleda kao tačan
 * pogodak i takav rezultat ide na vrh liste, ispred svega što je našao imenski
 * upit.
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

/**
 * Matični broj ima 8 cifara, PIB 9. Oblik upita odlučuje koja se kolona gleda,
 * pa se nikad ne pretražuju obe.
 */
const MATICNI_BROJ = /^\d{8}$/;
const PIB = /^\d{9}$/;

/**
 * Tačan pogodak po matičnom broju ili PIB-u.
 *
 * Placeholder u polju za pretragu godinama je obećavao "naziv firme, matični
 * broj ili PIB", a ruta je gledala samo `poslovno_ime_norm`, pa je upit sa
 * matičnim brojem vraćao prazno.
 *
 * Matični broj je primarni ključ, dakle O(log n). PIB je zasad null za sve
 * firme (NBS, faza 2), ali kod mora da radi kad podaci stignu; do tada je to
 * jeftin promašaj. Indeks nad `pib` bi tražio migraciju i ne uvodi se sada.
 */
async function tacanPogodak(
  db: SupabaseClient,
  upit: string,
  kolone: string,
): Promise<RedFirme[]> {
  const kolona = MATICNI_BROJ.test(upit) ? "maticni_broj" : PIB.test(upit) ? "pib" : null;
  if (!kolona) return [];

  const { data, error } = await db.from("companies").select(kolone).eq(kolona, upit).limit(5);

  if (error) {
    console.error("Pretraga po broju:", error.message);
    return [];
  }

  return (data ?? []) as unknown as RedFirme[];
}

/** Oblik odgovora je ugovor prema UI-ju i ne menja se. */
function uObliku(redovi: RedFirme[], sifarnik: Map<string, string>) {
  return redovi.map((red) => ({
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
}

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

  // `Number(null)` je 0, a nula je konačan broj — bez provere da je parametar
  // uopšte poslat, izostanak `limit`-a je davao 1 rezultat umesto 10, pa je
  // autocomplete prikazivao jedan jedini predlog. Prazan string pada isto.
  const trazenLimit = parametri.get("limit");
  const trazeno = Number(trazenLimit);
  const limit =
    trazenLimit && Number.isFinite(trazeno)
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

  // 0. Tačan pogodak po broju ide uporedo sa imenskim upitom — ne čeka ga.
  // 1. Firme sa izveštajem, sortirane po prihodu u bazi.
  const [tacni, { data: saPrihodom, error }] = await Promise.all([
    tacanPogodak(db, upit, KOLONE),
    db
      .from("financials")
      .select(`ukupni_prihodi, companies!inner(${KOLONE})`)
      .ilike("companies.poslovno_ime_norm", uzorak)
      .order("ukupni_prihodi", { ascending: false })
      .limit(KANDIDATA),
  ]);

  if (error) {
    console.error("Pretraga:", error.message);
    // Imenski upit je pao, ali tačan pogodak po broju je nezavisan od njega i
    // vraća se svejedno. Pretraga nikad ne ruši stranicu.
    return NextResponse.json({ rezultati: uObliku(tacni, await nazivDelatnosti(db)) });
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

  // Tačan pogodak ne ulazi u imenski poredak — ide na vrh, bez duplikata.
  // Ko ukuca matični broj, taj zna koju firmu traži; poredak po prihodu tu
  // nema šta da odlučuje.
  for (const firma of tacni) nadjene.delete(firma.maticni_broj);

  const poImenu = [...nadjene.values()]
    .map((red) => ({
      red,
      // Ko kuca "hemo" očekuje Hemofarm pre firme koja "hemo" ima u sredini.
      pocinje: red.poslovno_ime_norm.startsWith(upit) ? 0 : 1,
      prihod: prihod.get(red.maticni_broj) ?? 0,
    }))
    .sort((a, b) => a.pocinje - b.pocinje || b.prihod - a.prihod)
    .map(({ red }) => red);

  const izabrani = [...tacni, ...poImenu].slice(0, limit);

  if (!izabrani.length) {
    return NextResponse.json({ rezultati: [] });
  }

  const rezultati = uObliku(izabrani, await nazivDelatnosti(db));

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
