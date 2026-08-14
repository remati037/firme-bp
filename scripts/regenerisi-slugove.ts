import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getSupabaseServerClient } from "../lib/supabase";
import { slugify } from "../lib/normalize";
import { primeniOverride, skratiIme } from "../lib/skrati-ime";
import { upsertUBatchevima } from "./lib/upsert";

/**
 * JEDNOKRATNA skripta: popunjava poslovno_ime_kratko i regeneriše sve slugove
 * iz njega.
 *
 * Ovo je jedini trenutak kada je promena sluga besplatna. Posle indeksiranja
 * svaka izmena traži tabelu starih slugova i 301 lanac na 133k URL-ova, pa
 * ingest od tada slug samo zamrzava i nikad ga ne menja.
 *
 * Pokretanje:
 *   npx tsx scripts/regenerisi-slugove.ts            suvi prolaz, ništa ne upisuje
 *   npx tsx scripts/regenerisi-slugove.ts --potvrdi  stvarno upisuje
 */

type Red = {
  maticni_broj: string;
  poslovno_ime: string;
  poslovno_ime_norm: string;
  opstina: string | null;
  slug: string;
  poslovno_ime_kratko: string | null;
};

const POTVRDA = process.argv.includes("--potvrdi");
const STRANA = 1000;

async function ucitajSve(supabase: ReturnType<typeof getSupabaseServerClient>): Promise<Red[]> {
  const sve: Red[] = [];
  for (let od = 0; ; od += STRANA) {
    const { data, error } = await supabase
      .from("companies")
      .select("maticni_broj, poslovno_ime, poslovno_ime_norm, opstina, slug, poslovno_ime_kratko")
      .order("maticni_broj", { ascending: true })
      .range(od, od + STRANA - 1);

    if (error) throw new Error(`Čitanje companies: ${error.message}`);
    if (!data || data.length === 0) break;

    sve.push(...(data as Red[]));
    if (data.length < STRANA) break;
  }
  return sve;
}

async function glavna(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // U CI-ju vrednosti stižu iz secrets.
  }

  const supabase = getSupabaseServerClient();

  const putOverride = path.join(process.cwd(), "scripts/data/ime-override.json");
  const overrides: Record<string, string> = existsSync(putOverride)
    ? JSON.parse(readFileSync(putOverride, "utf8"))
    : {};

  const firme = await ucitajSve(supabase);
  console.log(`Firmi: ${firme.length}, ručnih imena: ${Object.keys(overrides).length}`);

  // Upsert kroz PostgREST gradi i INSERT granu, pa svaka not null kolona mora
  // da bude u payloadu, iako se red sigurno već nalazi u tabeli.
  const zaUpis: {
    maticni_broj: string;
    poslovno_ime: string;
    poslovno_ime_norm: string;
    poslovno_ime_kratko: string;
    slug: string;
    updated_at: string;
  }[] = [];
  const sada = new Date().toISOString();
  const slugovi = new Map<string, string>();
  const kolizije: string[] = [];
  let promenjenSlug = 0;

  for (const red of firme) {
    const kratko = primeniOverride(
      red.maticni_broj,
      skratiIme(red.poslovno_ime, red.opstina ?? "").kratko,
      overrides,
    );

    // Prazno skraćeno ime nikad ne sme da uđe u slug.
    const slug = slugify(kratko || red.poslovno_ime, red.maticni_broj);

    const vecUzeo = slugovi.get(slug);
    if (vecUzeo) kolizije.push(`${slug}: ${vecUzeo} i ${red.maticni_broj}`);
    slugovi.set(slug, red.maticni_broj);

    if (slug !== red.slug) promenjenSlug++;
    if (slug !== red.slug || kratko !== red.poslovno_ime_kratko) {
      zaUpis.push({
        maticni_broj: red.maticni_broj,
        poslovno_ime: red.poslovno_ime,
        poslovno_ime_norm: red.poslovno_ime_norm,
        poslovno_ime_kratko: kratko,
        slug,
        updated_at: sada,
      });
    }
  }

  console.log(`Slugova koji se menjaju: ${promenjenSlug}`);
  console.log(`Redova za upis: ${zaUpis.length}`);

  // Jedinstvenost sluga je uslov, ne želja: dupli slug znači da dve firme dele URL.
  if (kolizije.length) {
    throw new Error(
      `Kolizija slugova, ${kolizije.length} slučajeva. Ništa nije upisano.\n` +
        kolizije.slice(0, 10).join("\n"),
    );
  }
  console.log("Kolizija slugova: nema.");

  if (!POTVRDA) {
    console.log("\nSuvi prolaz. Za stvarni upis dodaj --potvrdi.");
    return;
  }

  await upsertUBatchevima(supabase, "companies", zaUpis, "maticni_broj");
  console.log(`\nUpisano ${zaUpis.length} redova.`);

  const { error } = await supabase.rpc("refresh_all_stats");
  if (error) throw new Error(`refresh_all_stats: ${error.message}`);
  console.log("Statistika osvežena.");
}

glavna().catch((greska) => {
  console.error("\nRegeneracija nije uspela:", greska instanceof Error ? greska.message : greska);
  process.exit(1);
});
