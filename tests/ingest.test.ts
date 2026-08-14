import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "../lib/supabase";

let supabase: SupabaseClient;

beforeAll(() => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // u CI-ju vrednosti stižu iz secrets
  }
  supabase = getSupabaseServerClient();
});

/** Čita jednu kolonu iz cele tabele kroz stranice. */
async function svaKolona<T>(tabela: string, kolona: string, poredak: string): Promise<T[]> {
  const sve: T[] = [];

  for (let od = 0; ; od += 1000) {
    const { data, error } = await supabase
      .from(tabela)
      .select(kolona)
      .order(poredak, { ascending: true })
      .range(od, od + 999);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    sve.push(...data.map((red) => (red as unknown as Record<string, T>)[kolona]));
    if (data.length < 1000) break;
  }

  return sve;
}

describe("ingest, stanje baze", () => {
  it("ima više od 100.000 firmi", async () => {
    const { count, error } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true });

    expect(error).toBeNull();
    expect(count ?? 0).toBeGreaterThan(100_000);
  });

  it("nema duplikata slugova", async () => {
    const slugovi = await svaKolona<string>("companies", "slug", "maticni_broj");
    expect(slugovi.length).toBeGreaterThan(100_000);
    expect(new Set(slugovi).size).toBe(slugovi.length);
  });

  it("nema reda bez maticnog broja", async () => {
    const { count, error } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .or("maticni_broj.is.null,maticni_broj.eq.");

    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("poslovno_ime_norm nema velika slova ni interpunkciju", async () => {
    const imena = await svaKolona<string>("companies", "poslovno_ime_norm", "maticni_broj");
    const losa = imena.filter((ime) => !/^[a-z0-9 ]*$/.test(ime ?? ""));

    expect(losa.slice(0, 10)).toEqual([]);
  });

  it("svaka sifra delatnosti iz companies postoji u nace_codes", async () => {
    const izFirmi = new Set(
      (await svaKolona<string | null>("companies", "sifra_delatnosti", "maticni_broj")).filter(
        (s): s is string => Boolean(s),
      ),
    );
    const izSifarnika = new Set(await svaKolona<string>("nace_codes", "sifra", "sifra"));
    const nedostaju = [...izFirmi].filter((s) => !izSifarnika.has(s));

    expect(izSifarnika.size).toBeGreaterThan(600);
    expect(nedostaju).toEqual([]);
  });

  it("financials ima manje redova od financials_history, zbog sirocica", async () => {
    const { count: fin } = await supabase
      .from("financials")
      .select("*", { count: "exact", head: true });
    const { count: ist } = await supabase
      .from("financials_history")
      .select("*", { count: "exact", head: true });

    expect(fin ?? 0).toBeGreaterThan(100_000);
    expect(ist ?? 0).toBeGreaterThan(fin ?? 0);
  });

  it("snapshots ima red za obradjen presek", async () => {
    const { data, error } = await supabase
      .from("snapshots")
      .select("datum_preseka, broj_firmi, broj_fi, storage_path")
      .order("datum_preseka", { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(data?.[0]?.broj_firmi ?? 0).toBeGreaterThan(100_000);
    expect(data?.[0]?.storage_path).toBeTruthy();
  });
});
