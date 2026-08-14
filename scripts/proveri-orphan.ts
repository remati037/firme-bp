import { getSupabaseServerClient } from "../lib/supabase";
import { slugOpstine } from "../lib/prikaz";

/**
 * Orphan provera, SEO.md §2.3: "nula orphan stranica — svaka firma mora biti
 * dostupna preko bar jedne kategorijske stranice".
 *
 * Zašto je ovo bitno: stranica do koje se ne stiže nijednim internim linkom
 * Google praktično ne otkriva. Sa 133.634 stranice interno linkovanje je
 * jedina poluga koja realno pomera indeksiranje, i to je najveća rupa kod
 * konkurencije (CompanyWall ima 612.000 stranica i nula linkova ka drugim
 * firmama).
 *
 * Šta se proverava:
 *   1. firma ima šifru delatnosti koja postoji u mv_delatnost_stats,
 *      dakle stranica /delatnost/[sifra] je stvarno generisana i lista je
 *   2. ILI ima šifru opštine koja se svodi na neprazan, jedinstven slug,
 *      dakle /grad/[opstina] postoji
 *   3. slugovi opština se ne sudaraju — dve opštine sa istim slugom znače
 *      da jedna od njih nije dostupna
 *
 * Šta se NE proverava: veza "slične firme". Ona se računa pri renderu iz iste
 * delatnosti i opštine, pa bi provera značila duplirati tu logiku ovde i
 * riskovati da se raziđu. Kategorijska dostupnost je nosivi uslov.
 *
 * Pokretanje:  npx tsx scripts/proveri-orphan.ts
 * Izlazi sa 1 ako ijedna firma nije dostupna, da može u CI.
 */

const STRANA = 1000;
const PRIMERA = 10;

type Firma = {
  maticni_broj: string;
  slug: string;
  poslovno_ime_kratko: string | null;
  sifra_delatnosti: string | null;
  sifra_opstine: string | null;
};

async function sve<T>(
  db: ReturnType<typeof getSupabaseServerClient>,
  tabela: string,
  kolone: string,
  poredak: string,
): Promise<T[]> {
  const skup: T[] = [];
  for (let od = 0; ; od += STRANA) {
    const { data, error } = await db
      .from(tabela)
      .select(kolone)
      .order(poredak, { ascending: true })
      .range(od, od + STRANA - 1);

    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data?.length) break;
    skup.push(...(data as T[]));
    if (data.length < STRANA) break;
  }
  return skup;
}

async function glavna(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // U CI-ju vrednosti stižu iz secrets.
  }

  const db = getSupabaseServerClient();

  const [firme, delatnosti, opstine] = await Promise.all([
    sve<Firma>(
      db,
      "companies",
      "maticni_broj, slug, poslovno_ime_kratko, sifra_delatnosti, sifra_opstine",
      "maticni_broj",
    ),
    sve<{ sifra_delatnosti: string | null }>(
      db,
      "mv_delatnost_stats",
      "sifra_delatnosti",
      "sifra_delatnosti",
    ),
    sve<{ sifra: string; naziv_lat: string | null }>(db, "municipalities", "sifra, naziv_lat", "sifra"),
  ]);

  const imaDelatnost = new Set(
    delatnosti.map((d) => d.sifra_delatnosti).filter((s): s is string => Boolean(s)),
  );

  // Slug opštine mora biti neprazan i jedinstven; dve opštine sa istim slugom
  // znače da je jedna od njih nedostupna.
  const slugPoSifri = new Map<string, string>();
  const sifrePoSlugu = new Map<string, string[]>();
  for (const o of opstine) {
    const slug = slugOpstine(o.naziv_lat);
    if (!slug) continue;
    slugPoSifri.set(o.sifra, slug);
    sifrePoSlugu.set(slug, [...(sifrePoSlugu.get(slug) ?? []), o.sifra]);
  }

  const sudari = [...sifrePoSlugu.entries()].filter(([, sifre]) => sifre.length > 1);

  const orphani = firme.filter((f) => {
    const prekoDelatnosti = f.sifra_delatnosti !== null && imaDelatnost.has(f.sifra_delatnosti);
    const prekoOpstine = f.sifra_opstine !== null && slugPoSifri.has(f.sifra_opstine);
    return !prekoDelatnosti && !prekoOpstine;
  });

  const bezDelatnosti = firme.filter(
    (f) => f.sifra_delatnosti === null || !imaDelatnost.has(f.sifra_delatnosti),
  );
  const bezOpstine = firme.filter(
    (f) => f.sifra_opstine === null || !slugPoSifri.has(f.sifra_opstine),
  );

  console.log(`Firmi:                       ${firme.length}`);
  console.log(`Delatnosti sa stranicom:     ${imaDelatnost.size}`);
  console.log(`Opština sa stranicom:        ${slugPoSifri.size}`);
  console.log(`Bez dostupne delatnosti:     ${bezDelatnosti.length}`);
  console.log(`Bez dostupne opštine:        ${bezOpstine.length}`);
  console.log(`Sudara slugova opština:      ${sudari.length}`);
  console.log(`ORPHAN (ni jedno ni drugo):  ${orphani.length}`);

  for (const [slug, sifre] of sudari.slice(0, PRIMERA)) {
    console.error(`  sudar sluga "${slug}": šifre ${sifre.join(", ")}`);
  }
  for (const f of orphani.slice(0, PRIMERA)) {
    console.error(`  orphan ${f.maticni_broj} ${f.poslovno_ime_kratko ?? f.slug}`);
  }

  if (orphani.length || sudari.length) {
    throw new Error(
      `Orphan provera pala: ${orphani.length} nedostupnih firmi, ${sudari.length} sudara slugova.`,
    );
  }

  console.log("\nSvaka firma je dostupna sa bar jedne kategorijske stranice.");
}

glavna().catch((greska) => {
  console.error("\n" + (greska instanceof Error ? greska.message : String(greska)));
  process.exit(1);
});
