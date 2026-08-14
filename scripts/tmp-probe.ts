import { getSupabaseServerClient } from "../lib/supabase";

async function main() {
  const db = getSupabaseServerClient();

  const kratko = await db
    .from("companies")
    .select("maticni_broj", { count: "exact", head: true })
    .not("poslovno_ime_kratko", "is", null);
  console.log("popunjeno poslovno_ime_kratko:", kratko.count, kratko.error?.message ?? "");

  const pib = await db
    .from("companies")
    .select("maticni_broj", { count: "exact", head: true })
    .not("pib", "is", null);
  console.log("popunjen pib:", pib.count, pib.error?.message ?? "");

  const uzorak = await db
    .from("companies")
    .select("maticni_broj,slug,poslovno_ime,poslovno_ime_kratko,opstina,sifra_opstine,sifra_delatnosti,status,status_aktivan,datum_osnivanja,pravna_forma,pib")
    .in("maticni_broj", ["20443180", "07031206"])
    .limit(2);
  console.log("uzorak:", JSON.stringify(uzorak.data, null, 1), uzorak.error?.message ?? "");

  for (const view of ["mv_delatnost_stats", "mv_opstina_stats", "mv_company_ranks"]) {
    const r = await db.from(view).select("*", { count: "exact", head: true });
    console.log(view, r.count, r.error?.message ?? "");
  }

  const nace = await db.from("nace_codes").select("*", { count: "exact" }).limit(1);
  console.log("nace_codes:", nace.count, JSON.stringify(nace.data?.[0]), nace.error?.message ?? "");

  const opst = await db.from("municipalities").select("*", { count: "exact" }).limit(1);
  console.log("municipalities:", opst.count, JSON.stringify(opst.data?.[0]), opst.error?.message ?? "");

  const ai = await db.from("ai_summaries").select("*", { count: "exact", head: true });
  console.log("ai_summaries:", ai.count, ai.error?.message ?? "");
}

main();
