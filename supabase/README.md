# Supabase

Projekat: `ypovucckebvxbianbvam` (region eu-central-1).
Šema je zaključana u `CLAUDE.md`. Ne menjaj tabele i kolone bez dogovora.

## Migracije

```
supabase/migrations/001_initial_schema.sql   tabele, indeksi, MV-ovi, refresh_all_stats(), RLS
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
