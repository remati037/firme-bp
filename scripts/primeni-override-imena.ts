import { readFileSync } from "node:fs";
import path from "node:path";

import { getSupabaseServerClient } from "../lib/supabase";

/**
 * Upisuje ručne izuzetke iz scripts/data/ime-override.json u
 * companies.poslovno_ime_kratko.
 *
 * Zašto postoji: ingest primenjuje override tek pri sledećem preseku
 * (scripts/lib/map-apr.ts), a ime u H1, title-u i OG slici treba da bude
 * ispravno odmah kad se izuzetak doda.
 *
 * SLUG SE NE DIRA. Slug je zamrznut posle jednokratne regeneracije
 * 14.08.2026; svaka promena bi bila 301 lanac (SEO.md §1.2).
 *
 * Pokretanje:
 *   npx tsx scripts/primeni-override-imena.ts            suvi prolaz
 *   npx tsx scripts/primeni-override-imena.ts --potvrdi  stvarno upisuje
 */

const POTVRDA = process.argv.includes("--potvrdi");

async function main() {
  const put = path.join(process.cwd(), "scripts/data/ime-override.json");
  const overrides: Record<string, string> = JSON.parse(readFileSync(put, "utf8"));
  const maticniBrojevi = Object.keys(overrides);

  const predugi = Object.entries(overrides).filter(([, ime]) => ime.length > 45);
  if (predugi.length) {
    throw new Error(`Preko 45 znakova (SEO.md §1.1): ${predugi.map(([mb]) => mb).join(", ")}`);
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("maticni_broj,poslovno_ime_kratko")
    .in("maticni_broj", maticniBrojevi);

  if (error) throw new Error(error.message);

  const postojece = new Map((data ?? []).map((r) => [r.maticni_broj, r.poslovno_ime_kratko]));
  const nepostojeci = maticniBrojevi.filter((mb) => !postojece.has(mb));
  const zaIzmenu = maticniBrojevi.filter(
    (mb) => postojece.has(mb) && postojece.get(mb) !== overrides[mb],
  );

  console.log(`Izuzetaka u fajlu: ${maticniBrojevi.length}`);
  console.log(`Nema ih u bazi:    ${nepostojeci.length}${nepostojeci.length ? ` (${nepostojeci.join(", ")})` : ""}`);
  console.log(`Za izmenu:         ${zaIzmenu.length}`);

  for (const mb of zaIzmenu) {
    console.log(`  ${mb}: ${postojece.get(mb) ?? "—"}  ->  ${overrides[mb]}`);
  }

  if (!POTVRDA) {
    console.log("\nSuvi prolaz. Za upis dodaj --potvrdi.");
    return;
  }

  let upisano = 0;
  for (const mb of zaIzmenu) {
    const { error: greska } = await supabase
      .from("companies")
      .update({ poslovno_ime_kratko: overrides[mb], updated_at: new Date().toISOString() })
      .eq("maticni_broj", mb);

    if (greska) throw new Error(`${mb}: ${greska.message}`);
    upisano++;
  }

  console.log(`\nUpisano redova: ${upisano}. Slugovi nisu dirani.`);
}

main().catch((greska) => {
  console.error(greska);
  process.exitCode = 1;
});
