import { cache } from "react";

import { upitPoslednjiPresek } from "./queries";
import { DATUM_PRESEKA } from "./site";
import { getSupabaseServerClient } from "./supabase";

/**
 * Datum poslednjeg APR preseka, iz tabele `snapshots`.
 *
 * `cache()` je po zahtevu: futer i stranica firme traže isti podatak, a baza
 * se pita samo jednom. Tabela `snapshots` nije izložena `anon` ulozi
 * (migracija 001), pa upit ide service role ključem, sa servera.
 *
 * Ako baza nije dostupna (npr. build bez env varijabli), vraća se konstanta iz
 * `lib/site.ts` — futer sa izvorom mora da postoji na svakoj stranici.
 */
export const ucitajDatumPreseka = cache(async (): Promise<string> => {
  try {
    const { data } = await upitPoslednjiPresek(getSupabaseServerClient());
    return data?.datum_preseka ?? DATUM_PRESEKA;
  } catch {
    return DATUM_PRESEKA;
  }
});
