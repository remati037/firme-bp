# Supabase

Projekat: `ypovucckebvxbianbvam` (region eu-central-1).
Šema je zaključana u `CLAUDE.md`. Ne menjaj tabele i kolone bez dogovora.

## Migracije

```
supabase/migrations/001_initial_schema.sql       tabele, indeksi, MV-ovi, refresh_all_stats(), RLS
supabase/migrations/002_refresh_timeout.sql      statement_timeout 15 min samo za refresh_all_stats()
supabase/migrations/003_poslovno_ime_kratko.sql  kolona companies.poslovno_ime_kratko
```

## Kako se primenjuje

Ručno, kroz Supabase SQL editor:

1. Otvori projekat na supabase.com → **SQL Editor** → **New query**
2. Kopiraj ceo sadržaj `001_initial_schema.sql` i pokreni ga (Cmd+Enter)
3. Poruka mora biti "Success. No rows returned"

Alternativa, ako imaš Supabase CLI povezan sa projektom:

```bash
supabase db push
```

Migracija je pisana da može da se pusti više puta bez greške
(`if not exists` na objektima, `drop policy if exists` pre politika).

## Provera da je prošlo

U SQL editoru:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by 1;
-- očekuje se: ai_summaries, companies, financials, financials_history,
--             municipalities, nace_codes, snapshots

select matviewname from pg_matviews where schemaname = 'public';
-- očekuje se: mv_company_ranks, mv_delatnost_stats, mv_opstina_stats

select * from companies limit 1;   -- prazno, ali ne puca
select refresh_all_stats();        -- prolazi i nad praznom bazom
```

## Šta treba znati o šemi

- **Novčane vrednosti su u hiljadama dinara**, tako stižu iz APR-a i tako se čuvaju.
  Množenje sa 1000 radi se u UI sloju.
- `financials` drži poslednje stanje, `financials_history` je arhiva svakog preseka
  i nikad se ne briše (nema FK, da brisanje firme ne obriše istoriju).
- Materijalizovani view-ovi računaju medijane preko `percentile_cont(0.5)` nad
  poslednjom godinom po firmi. `medijan_marze` je u procentima, ostalo u hiljadama RSD.
- `mv_company_ranks` ima rang firme unutar delatnosti i unutar opštine po ukupnim
  prihodima. Firme bez izveštaja imaju rang `null`.
- `refresh_all_stats()` osvežava sva tri view-a. Poziva se na kraju ingesta.
  Pokušava `refresh ... concurrently`, pa ako to padne prelazi na običan refresh.
  Pravo izvršavanja ima samo `service_role`.

## RLS

- SELECT za `anon` je dozvoljen na svim tabelama **osim `snapshots`**.
- INSERT, UPDATE i DELETE ide isključivo preko `service_role` (ključ nikad ne ide u browser).
- Materijalizovani view-ovi nemaju RLS, pa se ne izlažu Data API-ju (Supabase linter 0016).
  Čita ih server preko `service_role` ključa, browser nikad ne ide direktno na njih.

## Stanje

Migracija 001 primenjena 14.08.2026. na projekat `ypovucckebvxbianbvam`.
Provereno: 7 tabela, 3 materijalizovana view-a, 20 indeksa, 13 politika,
`refresh_all_stats()` prolazi, `anon` ne vidi `snapshots` i ne može da piše,
Supabase security advisor bez ijedne primedbe.

Uz `001_initial_schema.sql` sada postoji i `002_refresh_timeout.sql`: podiže
`statement_timeout` na 15 minuta samo za funkciju `refresh_all_stats()`, jer se
PostgREST povezuje kao rola `authenticator`, koja ima ograničenje od 8 sekundi.
Dok je baza bila prazna RPC je prolazio, ali nad stvarnim podacima osvežavanje
`mv_company_ranks` traje duže od 8s pa je poziv preko RPC-a počeo da pada.
Migracija ne dira tabele, kolone ni indekse.

Ingest pipeline pokrenut 14.08.2026. nad presekom 2026-07-31.
companies 133.634, financials 116.847, financials_history 123.360,
nace_codes 615, municipalities 192. Sirovi preseci su u Storage bucketu
`snapshots` pod `2026-07-31/`. Bucket je privatan.

Integracioni testovi (`tests/ingest.test.ts`) potvrđuju nad živom bazom: 0
duplikata slugova na 133.634 reda, 0 šifri delatnosti u `companies` koje
nedostaju u `nace_codes`, 0 vrednosti `poslovno_ime_norm` sa velikim slovom ili
interpunkcijom. `financials` ima manje redova od `financials_history`
(116.847 prema 123.360) jer 6.513 finansijskih zapisa nema odgovarajuću firmu
u `companies` pa se upisuju samo u istoriju. `snapshots` ima tačno jedan red,
za presek 2026-07-31, sa `broj_firmi` 133.634 i `broj_fi` 123.360.

## Skraćeno poslovno ime i slug

Migracija 003 dodaje `companies.poslovno_ime_kratko`. Kolona ide u title, H1,
OG sliku i u slug. Pravila su u `lib/skrati-ime.ts`, ručni izuzeci u
`scripts/data/ime-override.json`.

Slugovi su jednokratno regenerisani 14.08.2026, pre nego što je ijedna stranica
objavljena, skriptom `scripts/regenerisi-slugove.ts`. Promenjeno je 103.036 od
133.634 sluga. Prosečna dužina sluga pala je sa 54 na 35 znakova.

Od tada ingest slug samo zamrzava i nikad ga ne menja. Svaka nova promena
traži tabelu starih slugova i 301 lanac, vidi SEO.md 1.2.

Stanje posle regeneracije:

```
poslovno_ime_kratko:  0 praznih, najduže 45, prosek 26 znakova
slug:                 0 duplikata, najduži 56, prosek 35 znakova
grupa sa istim skraćenim imenom: 709, ukupno 2.151 firma
```

Kolizija skraćenog imena pogađa samo title i H1, ne i URL-ove, jer slug nosi
matični broj. Popravlja se bez diranja adresa.
