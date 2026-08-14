import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { getSupabaseServerClient } from "../lib/supabase";

/**
 * Provera migracije 004 (rang, `nulls last`).
 *
 * Pre migracije je rang bio pomeren za broj firmi bez finansijskog izveštaja,
 * jer Postgres za `order by ... desc` podrazumeva NULLS FIRST. Elektroprivreda
 * Srbije, sa najvećim prihodom u setu, imala je rang 73 u delatnosti i 1.256
 * u opštini.
 *
 * Test ide na pravu bazu, kao i ostali integracioni testovi u ovom folderu.
 */

const EPS = "20053658"; // Elektroprivreda Srbije, najveći prihod u presek 31.07.2026
const BEZ_IZVESTAJA = "21869856"; // Asya Gradnja DOO Beograd, nema finansijski red

let supabase: SupabaseClient;

beforeAll(() => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // u CI-ju vrednosti stižu iz secrets
  }
  supabase = getSupabaseServerClient();
});

describe("mv_company_ranks", () => {
  it("firma sa najvecim prihodom je prva u svojoj delatnosti i opstini", async () => {
    const { data, error } = await supabase
      .from("mv_company_ranks")
      .select("rang_delatnost,rang_opstina,sifra_delatnosti,sifra_opstine")
      .eq("maticni_broj", EPS)
      .single();

    expect(error).toBeNull();
    expect(data?.sifra_delatnosti).toBe("3511");
    expect(data?.rang_delatnost).toBe(1);
    expect(data?.rang_opstina).toBe(1); // opstina Stari Grad
  });

  it("firma bez finansijskog izvestaja nema rang", async () => {
    const { data, error } = await supabase
      .from("mv_company_ranks")
      .select("rang_delatnost,rang_opstina,ukupni_prihodi")
      .eq("maticni_broj", BEZ_IZVESTAJA)
      .single();

    expect(error).toBeNull();
    expect(data?.ukupni_prihodi).toBeNull();
    expect(data?.rang_delatnost).toBeNull();
    expect(data?.rang_opstina).toBeNull();
  });

  it("rang 1 ide firmi sa najvecim prihodom u delatnosti, ne firmi bez izvestaja", async () => {
    // Kontrolna provera nad jednom velikom delatnošću: prva po rangu mora da
    // bude i prva po prihodu.
    const { data: poRangu } = await supabase
      .from("mv_company_ranks")
      .select("maticni_broj,ukupni_prihodi")
      .eq("sifra_delatnosti", "4690")
      .eq("rang_delatnost", 1)
      .single();

    const { data: poPrihodu } = await supabase
      .from("mv_company_ranks")
      .select("maticni_broj,ukupni_prihodi")
      .eq("sifra_delatnosti", "4690")
      .not("ukupni_prihodi", "is", null)
      .order("ukupni_prihodi", { ascending: false })
      .limit(1)
      .single();

    expect(poRangu?.maticni_broj).toBe(poPrihodu?.maticni_broj);
    expect(poRangu?.ukupni_prihodi).toBe(poPrihodu?.ukupni_prihodi);
  });

  it("nijedan rang ne prelazi broj firmi sa izvestajem u toj grupi", async () => {
    const { data } = await supabase
      .from("mv_company_ranks")
      .select("rang_delatnost,ukupno_delatnost,rang_opstina,ukupno_opstina")
      .not("rang_delatnost", "is", null)
      .order("rang_delatnost", { ascending: false })
      .limit(50);

    for (const red of data ?? []) {
      expect(red.rang_delatnost).toBeLessThanOrEqual(red.ukupno_delatnost);
      if (red.rang_opstina) expect(red.rang_opstina).toBeLessThanOrEqual(red.ukupno_opstina);
    }
  });
});
