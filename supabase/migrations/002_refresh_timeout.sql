-- 002_refresh_timeout.sql
-- Podiže statement_timeout samo za refresh_all_stats().
--
-- Zašto: PostgREST se povezuje kao "authenticator", koji ima
-- statement_timeout = 8s, a service_role nema svoje podešavanje da to pregazi.
-- Osvežavanje mv_company_ranks nad 133.634 firme traje duže od 8 sekundi, pa je
-- svaki poziv refresh_all_stats() preko RPC-a padao sa
-- "canceling statement due to statement timeout".
--
-- Ograničenje se podiže samo za ovu funkciju, ne za celu rolu, da bi 8s zaštita
-- od zaglavljenog upita ostala na snazi za sve ostalo.
--
-- Ne dira tabele, kolone ni indekse. Šema iz CLAUDE.md ostaje nepromenjena.

alter function public.refresh_all_stats() set statement_timeout = '15min';

-- Provera:
--   select proconfig from pg_proc
--   where proname = 'refresh_all_stats' and pronamespace = 'public'::regnamespace;
--   -- očekuje se: {search_path=public,extensions,statement_timeout=15min}
