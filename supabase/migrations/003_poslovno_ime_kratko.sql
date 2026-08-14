-- 003_poslovno_ime_kratko.sql
-- Dodaje izvedenu kolonu za skraćeno poslovno ime.
--
-- Zašto: prosečno poslovno ime u APR setu ima 48 znakova, a 28,7 odsto ih
-- (38.315 firmi) ima preko 60. Google seče title na oko 60 znakova, pa za
-- ta imena u title tagu ne ostaje mesta ni za šta drugo.
--
-- Kolona ulazi u title, H1, OG sliku i u slug. Pravila skraćivanja su u
-- lib/skrati-ime.ts, a odobrena su u SEO.md, sekcija 1.1.
--
-- Ovo je jedina kolona odobrena uz zaključanu šemu. Ne dodaje tabele,
-- indekse ni ograničenja nad postojećim podacima.

alter table public.companies
  add column if not exists poslovno_ime_kratko text;

comment on column public.companies.poslovno_ime_kratko is
  'Skraćeno ime za title, H1, OG sliku i slug. Najviše 45 znakova. Puno ime ostaje u poslovno_ime.';

-- Provera:
--   select count(*) filter (where poslovno_ime_kratko is null) as bez_kratkog,
--          max(length(poslovno_ime_kratko))                    as najduze
--   from public.companies;
--   -- posle regeneracije se očekuje: bez_kratkog = 0, najduze <= 45
--
--   select poslovno_ime_kratko, count(*)
--   from public.companies group by 1 having count(*) > 1 order by 2 desc;
--   -- kolizije skraćenog imena; slugovi ostaju jedinstveni jer nose matični broj
