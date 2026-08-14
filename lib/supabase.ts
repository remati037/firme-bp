import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase klijenti.
 *
 * Ključevi se čitaju po redosledu: prvo novi Supabase ključevi
 * (`sb_publishable_...` / `sb_secret_...`), pa stari (`anon` / `service_role`).
 *
 * Zašto: novi tajni ključ se povlači i rotira pojedinačno, bez diranja
 * `service_role` ključa i bez prekida ingest skripti. To je bitno jer deploy
 * živi na tuđem Vercel nalogu — ako pristup treba oduzeti, povuče se samo taj
 * jedan ključ (odluka vlasnika 14.08.2026).
 */

/** Prva env varijabla koja ima vrednost; greška navodi sve prihvaćene nazive. */
function prviPostojeci(...imena: string[]): string {
  for (const ime of imena) {
    const vrednost = process.env[ime];
    if (vrednost) return vrednost;
  }
  throw new Error(
    `Nedostaje env varijabla: ${imena.join(" ili ")}. Proveri .env.local ili podešavanja na Vercelu.`,
  );
}

let browserClient: SupabaseClient | null = null;

/**
 * Klijent za pregledač i za javne server komponente.
 * Koristi javni ključ, poštuje RLS pravila, sme samo da čita.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      prviPostojeci("NEXT_PUBLIC_SUPABASE_URL"),
      prviPostojeci("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return browserClient;
}

/**
 * Klijent sa tajnim ključem, zaobilazi RLS.
 *
 * Koristi ga stranica firme (materijalizovani view-ovi i `snapshots` nisu
 * izloženi `anon` ulozi, migracija 001), ingest skripte i cron poslovi.
 * Nikad ga ne uvozi u klijentsku komponentu.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getSupabaseServerClient je pozvan u pregledaču. Tajni ključ sme samo na serveru.",
    );
  }
  return createClient(
    prviPostojeci("NEXT_PUBLIC_SUPABASE_URL"),
    prviPostojeci("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
