import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Nedostaje env varijabla ${name}. Proveri .env.local ili podešavanja na Vercelu.`,
    );
  }
  return value;
}

let browserClient: SupabaseClient | null = null;

/**
 * Klijent za pregledač i za javne server komponente.
 * Koristi anon ključ, poštuje RLS pravila, sme samo da čita.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return browserClient;
}

/**
 * Klijent sa service role ključem, zaobilazi RLS.
 * Isključivo za server: ingest skripte, cron poslovi, keširanje AI sažetaka.
 * Nikad ga ne uvozi u klijentsku komponentu.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getSupabaseServerClient je pozvan u pregledaču. Service role ključ sme samo na serveru.",
    );
  }
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
