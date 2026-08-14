import { readFileSync } from "node:fs";
import path from "node:path";

import { getSupabaseServerClient } from "../lib/supabase";
import { slugify } from "../lib/normalize";

/**
 * JEDNOKRATNA skripta: regeneriše slug SAMO za firme iz ime-override.json
 * kojima slug više ne odgovara ručno ispravljenom imenu.
 *
 * Zašto uopšte postoji: slugovi su nastali 14.08.2026 iz tadašnjeg
 * poslovno_ime_kratko, a deo tih imena je bio pokvaren izlaz algoritma
 * ("Srbije AD Novi Sad"). Override je ispravio ime, ali slug po pravilu iz
 * SEO.md §1.2 nije diran, pa NIS i dalje živi na srbije-ad-novi-sad-20084693.
 *
 * Zašto je ovo bezbedno SADA i neće biti kasnije: produkcija servira staru
 * placeholder stranicu, /firma/* vraća 404, dakle nijedan od ovih URL-ova
 * nikada nije bio serviran ni indeksiran. Nema šta da se preusmerava i ne
 * treba slug_history. Posle prvog obilaska Google-a ista izmena košta 301
 * lanac i dodatnu tabelu.
 *
 * Razlika u odnosu na scripts/regenerisi-slugove.ts: ta skripta dira SVE
 * firme; ova dira isključivo matične brojeve iz override spiska.
 *
 * Pokretanje:
 *   npx tsx scripts/regenerisi-slugove-izuzetaka.ts            suvi prolaz
 *   npx tsx scripts/regenerisi-slugove-izuzetaka.ts --potvrdi  upisuje
 */

const POTVRDA = process.argv.includes("--potvrdi");

type Red = { maticni_broj: string; slug: string; poslovno_ime_kratko: string | null };

async function main() {
  const put = path.join(process.cwd(), "scripts/data/ime-override.json");
  const overrides: Record<string, string> = JSON.parse(readFileSync(put, "utf8"));

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("maticni_broj,slug,poslovno_ime_kratko")
    .in("maticni_broj", Object.keys(overrides))
    .returns<Red[]>();

  if (error) throw new Error(error.message);

  const izmene = (data ?? [])
    .map((red) => ({
      maticniBroj: red.maticni_broj,
      ime: red.poslovno_ime_kratko ?? "",
      stari: red.slug,
      novi: slugify(red.poslovno_ime_kratko ?? "", red.maticni_broj),
    }))
    .filter((r) => r.stari !== r.novi);

  // Zaštita 1: ime u bazi mora da bude ono iz override spiska. Ako nije,
  // znači da poslovno_ime_kratko nije primenjeno i slug bi se izveo iz starog.
  const neuskladjeni = izmene.filter((r) => r.ime !== overrides[r.maticniBroj]);
  if (neuskladjeni.length) {
    throw new Error(
      `Ime u bazi se razlikuje od override spiska za: ${neuskladjeni
        .map((r) => r.maticniBroj)
        .join(", ")}. Prvo pokreni primeni-override-imena.ts.`,
    );
  }

  // Zaštita 2: matični broj mora da ostane poslednji segment sluga,
  // jer stranica firme iz njega izvlači firmu (SEO.md §1.3).
  const bezMb = izmene.filter((r) => !r.novi.endsWith(`-${r.maticniBroj}`));
  if (bezMb.length) {
    throw new Error(`Slug bez matičnog broja na kraju: ${bezMb.map((r) => r.novi).join(", ")}`);
  }

  // Zaštita 3: novi slug ne sme da se sudari sa postojećim slugom druge firme.
  const { data: sudari } = await supabase
    .from("companies")
    .select("maticni_broj,slug")
    .in(
      "slug",
      izmene.map((r) => r.novi),
    );
  const pravi = (sudari ?? []).filter(
    (s) => !izmene.some((r) => r.maticniBroj === s.maticni_broj),
  );
  if (pravi.length) {
    throw new Error(`Sudar sluga sa drugom firmom: ${JSON.stringify(pravi)}`);
  }

  console.log(`Izuzetaka u spisku: ${Object.keys(overrides).length}`);
  console.log(`Slugova za promenu: ${izmene.length}\n`);
  for (const r of izmene) {
    console.log(`${r.ime}\n  ${r.stari}\n  -> ${r.novi}\n`);
  }

  if (!POTVRDA) {
    console.log("Suvi prolaz, ništa nije upisano. Za upis dodaj --potvrdi.");
    return;
  }

  let upisano = 0;
  for (const r of izmene) {
    const { error: greska } = await supabase
      .from("companies")
      .update({ slug: r.novi, updated_at: new Date().toISOString() })
      .eq("maticni_broj", r.maticniBroj);

    if (greska) throw new Error(`${r.maticniBroj}: ${greska.message}`);
    upisano++;
  }

  console.log(`Upisano slugova: ${upisano}.`);
}

main().catch((greska) => {
  console.error(greska instanceof Error ? greska.message : greska);
  process.exitCode = 1;
});
