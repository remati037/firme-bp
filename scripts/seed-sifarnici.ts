import { readFileSync } from "node:fs";
import path from "node:path";
import { getSupabaseServerClient } from "../lib/supabase";

type NaceRed = { sifra: string; naziv: string; sektor: string | null };
type OpstinaRed = { sifra: string; naziv_lat: string; naziv_cir: string; okrug: string | null };

function ucitaj<T>(imeFajla: string): T[] {
  return JSON.parse(readFileSync(path.join(process.cwd(), "scripts/data", imeFajla), "utf8"));
}

async function glavna(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // U GitHub Actions fajla nema, vrednosti stižu iz secrets.
  }

  const supabase = getSupabaseServerClient();

  const nace = ucitaj<NaceRed>("nace-2010.json");
  const { error: greskaNace } = await supabase.from("nace_codes").upsert(nace, { onConflict: "sifra" });
  if (greskaNace) throw new Error(`nace_codes: ${greskaNace.message}`);
  console.log(`nace_codes: ${nace.length} šifara`);

  const opstine = ucitaj<OpstinaRed>("opstine.json");
  const { error: greskaOpstina } = await supabase
    .from("municipalities")
    .upsert(opstine, { onConflict: "sifra" });
  if (greskaOpstina) throw new Error(`municipalities: ${greskaOpstina.message}`);
  console.log(`municipalities: ${opstine.length} opština`);
}

glavna().catch((greska) => {
  console.error("Seed nije uspeo:", greska instanceof Error ? greska.message : greska);
  process.exit(1);
});
