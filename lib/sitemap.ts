import type { SupabaseClient } from "@supabase/supabase-js";

import { SITE_URL } from "@/lib/site";
import { slugOpstine } from "@/lib/prikaz";
import { MIN_ZA_UKRSTENU } from "@/lib/kategorije";

/**
 * Sitemap segmentiran po kvalitetu, ne po abecedi (SEO.md §5.1).
 *
 * Google daje statistiku indeksiranja PO SITEMAP FAJLU. Ako je sve u jednoj
 * gomili, dobije se jedan pomešan broj i ne zna se koji sloj Google odbija.
 * Ovako se tačno vidi da li pada vrh liste ili rep.
 *
 * Bez `priority` i `changefreq`: Google ih ignoriše (SEO.md §5.2).
 *
 * `lastmod` je `updated_at` te konkretne firme, ne globalni datum preseka.
 * Ingest diže `updated_at` samo redovima koji su se stvarno promenili, pa je
 * ovo jedina vrednost koja je "consistently and verifiably accurate". Da se
 * svakog meseca svih 133.634 stavi na datum preseka, Google bi prestao da
 * veruje lastmod-u u celini.
 */

/** Prag iznad kog se firma smatra da ima upotrebljive finansije. */
const IMA_FINANSIJE = 0;

/** Veličine slojeva iz SEO.md §5.3, redosled slanja Dan 0 / 14 / 30. */
const SLOJ = 45_000;

const STRANA = 1000;

export type Unos = { url: string; lastmod?: string };

export const SEGMENTI = [
  "staticne",
  "kategorije",
  "firme-1",
  "firme-2",
  "firme-3",
  "firme-bez-fi",
] as const;

export type Segment = (typeof SEGMENTI)[number];

/**
 * `firme-bez-fi` se generiše, ali se NE šalje u prvoj fazi (SEO.md §1.4):
 * 39.406 stranica bez finansija je tanak sadržaj i troši crawl budžet.
 * Fajl postoji da bi mogao da se pošalje kad prvi sloj pređe 60% indeksiranosti.
 *
 * Isto važi i za slojeve firmi dok `robots.txt` drži `Disallow: /firma/` —
 * slati Google-u sitemap sa adresama koje mu je crawl zabranjen je
 * kontradiktoran signal. Zato indeks nabraja samo ono što je stvarno spremno.
 */
export const U_INDEKSU: Segment[] = ["staticne", "kategorije"];

function apsolutno(putanja: string): string {
  return `${SITE_URL}${putanja}`;
}

/** Čita celu tabelu kroz stranice; PostgREST vraća najviše 1000 redova. */
async function sve<T>(
  db: SupabaseClient,
  tabela: string,
  kolone: string,
  poredakPo: string,
): Promise<T[]> {
  const skup: T[] = [];

  for (let od = 0; ; od += STRANA) {
    const { data, error } = await db
      .from(tabela)
      .select(kolone)
      .order(poredakPo, { ascending: true, nullsFirst: false })
      .range(od, od + STRANA - 1);
    if (error) throw new Error(`sitemap ${tabela}: ${error.message}`);
    if (!data?.length) break;

    skup.push(...(data as T[]));
    if (data.length < STRANA) break;
  }

  return skup;
}

async function staticne(): Promise<Unos[]> {
  // Samo rute koje stvarno postoje. `/o-podacima` još nije napravljen, pa se
  // ne upisuje — URL u sitemapu koji vraća 404 je gori od izostavljenog.
  return [
    "/",
    "/delatnost",
    "/grad",
    "/najvece",
    "/najvece/prihod",
    "/najvece/dobit",
    "/najvece/zaposleni",
  ].map((putanja) => ({ url: apsolutno(putanja) }));
}

async function kategorije(db: SupabaseClient): Promise<Unos[]> {
  const unosi: Unos[] = [];

  // Delatnosti i opštine: samo one koje su stvarno u upotrebi, jer su rute
  // prerenderovane baš za njih.
  const delatnosti = await sve<{ sifra_delatnosti: string | null }>(
    db,
    "mv_delatnost_stats",
    "sifra_delatnosti",
    "sifra_delatnosti",
  );
  for (const red of delatnosti) {
    if (red.sifra_delatnosti) unosi.push({ url: apsolutno(`/delatnost/${red.sifra_delatnosti}`) });
  }

  const opstine = await sve<{ opstina: string | null }>(
    db,
    "mv_opstina_stats",
    "opstina",
    "sifra_opstine",
  );
  for (const red of opstine) {
    const slug = slugOpstine(red.opstina);
    if (slug) unosi.push({ url: apsolutno(`/grad/${slug}`) });
  }

  // Ukrštene stranice postoje samo za kombinacije sa najmanje 5 firmi;
  // ispod toga ruta vraća 404, pa ne smeju u sitemap.
  const ukrstene = await sve<{ sifra_delatnosti: string; sifra_opstine: string; opstina: string | null }>(
    db,
    "mv_company_ranks",
    "sifra_delatnosti, sifra_opstine",
    "maticni_broj",
  );

  const brojac = new Map<string, number>();
  for (const red of ukrstene) {
    if (!red.sifra_delatnosti || !red.sifra_opstine) continue;
    const kljuc = `${red.sifra_delatnosti}|${red.sifra_opstine}`;
    brojac.set(kljuc, (brojac.get(kljuc) ?? 0) + 1);
  }

  const nazivOpstine = new Map<string, string>();
  const sviGradovi = await sve<{ sifra: string; naziv_lat: string | null }>(
    db,
    "municipalities",
    "sifra, naziv_lat",
    "sifra",
  );
  for (const red of sviGradovi) {
    const slug = slugOpstine(red.naziv_lat);
    if (slug) nazivOpstine.set(red.sifra, slug);
  }

  for (const [kljuc, broj] of brojac) {
    if (broj < MIN_ZA_UKRSTENU) continue;
    const [sifra, sifraOpstine] = kljuc.split("|");
    const slug = nazivOpstine.get(sifraOpstine);
    if (slug) unosi.push({ url: apsolutno(`/delatnost/${sifra}/${slug}`) });
  }

  return unosi;
}

type RedFirme = {
  ukupni_prihodi: number | null;
  companies: { slug: string; updated_at: string } | null;
};

/** Firme sa prihodom, sortirane opadajuće, pa isečene na sloj. */
async function firmeSaPrihodom(db: SupabaseClient, sloj: 1 | 2 | 3): Promise<Unos[]> {
  const od = (sloj - 1) * SLOJ;
  const najvise = sloj === 3 ? Number.POSITIVE_INFINITY : sloj * SLOJ;
  const unosi: Unos[] = [];

  for (let pomeraj = od; pomeraj < najvise; pomeraj += STRANA) {
    const { data, error } = await db
      .from("financials")
      .select("ukupni_prihodi, companies!inner(slug, updated_at)")
      .gt("ukupni_prihodi", IMA_FINANSIJE)
      .order("ukupni_prihodi", { ascending: false })
      .range(pomeraj, pomeraj + STRANA - 1);

    if (error) throw new Error(`sitemap firme-${sloj}: ${error.message}`);
    if (!data?.length) break;

    for (const red of data as unknown as RedFirme[]) {
      if (!red.companies) continue;
      unosi.push({
        url: apsolutno(`/firma/${red.companies.slug}`),
        lastmod: red.companies.updated_at.slice(0, 10),
      });
    }

    if (data.length < STRANA) break;
  }

  return unosi;
}

/**
 * Firme bez upotrebljivih finansija: bez ijednog zapisa ili sa nulom prihoda.
 * Izmereno nad bazom: 39.406, a ne 36.170 kako stoji u SEO.md §1.4 — ta brojka
 * je računala nule preko svih 123.360 finansijskih redova, uključujući 6.513
 * siročića koja nemaju firmu.
 */
async function firmeBezFinansija(db: SupabaseClient): Promise<Unos[]> {
  const saPrihodom = new Set<string>();
  for (let od = 0; ; od += STRANA) {
    const { data, error } = await db
      .from("financials")
      .select("maticni_broj")
      .gt("ukupni_prihodi", IMA_FINANSIJE)
      .order("maticni_broj", { ascending: true })
      .range(od, od + STRANA - 1);

    if (error) throw new Error(`sitemap bez-fi: ${error.message}`);
    if (!data?.length) break;
    for (const red of data as { maticni_broj: string }[]) saPrihodom.add(red.maticni_broj);
    if (data.length < STRANA) break;
  }

  const firme = await sve<{ maticni_broj: string; slug: string; updated_at: string }>(
    db,
    "companies",
    "maticni_broj, slug, updated_at",
    "maticni_broj",
  );

  return firme
    .filter((red) => !saPrihodom.has(red.maticni_broj))
    .map((red) => ({ url: apsolutno(`/firma/${red.slug}`), lastmod: red.updated_at.slice(0, 10) }));
}

export async function unosiZaSegment(db: SupabaseClient, segment: Segment): Promise<Unos[]> {
  switch (segment) {
    case "staticne":
      return staticne();
    case "kategorije":
      return kategorije(db);
    case "firme-1":
      return firmeSaPrihodom(db, 1);
    case "firme-2":
      return firmeSaPrihodom(db, 2);
    case "firme-3":
      return firmeSaPrihodom(db, 3);
    case "firme-bez-fi":
      return firmeBezFinansija(db);
  }
}

const escape = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function xmlSitemap(unosi: Unos[]): string {
  const redovi = unosi
    .map(
      (u) =>
        `  <url><loc>${escape(u.url)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${redovi}\n</urlset>\n`;
}

export function xmlIndeks(segmenti: Segment[]): string {
  const redovi = segmenti
    .map((s) => `  <sitemap><loc>${escape(apsolutno(`/sitemaps/${s}.xml`))}</loc></sitemap>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${redovi}\n</sitemapindex>\n`;
}
