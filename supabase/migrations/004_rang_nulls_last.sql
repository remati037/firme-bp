-- 004_rang_nulls_last.sql
-- Ispravlja rangiranje u mv_company_ranks.
--
-- PROBLEM: migracija 001 rangira sa
--   rank() over (partition by ... order by f.ukupni_prihodi desc)
-- a Postgres za `desc` podrazumeva NULLS FIRST. Firme bez finansijskog reda
-- imaju ukupni_prihodi = null i zauzimale su sve prve pozicije.
--
-- Posledica na produkcionim podacima (presek 31.07.2026): Elektroprivreda
-- Srbije, ubedljivo najveći prihod u delatnosti 3511, imala je rang 73
-- (72 firme bez izveštaja + 1). U opštini Stari Grad rang 1.256 (1.255 + 1).
-- Pogrešan je bio rang SVAKE firme, kao i "Top X%" na stranici firme.
--
-- REŠENJE: `desc nulls last` u obe window funkcije. Definicija view-a je
-- inače nepromenjena u odnosu na migraciju 001; firme bez prihoda i dalje
-- dobijaju rang null kroz postojeći `case`.
--
-- Odobrio vlasnik projekta 14.08.2026. Šema tabela se ne dira.

drop materialized view if exists public.mv_company_ranks;

create materialized view public.mv_company_ranks as
with poslednji_fi as (
  select distinct on (f.maticni_broj)
         f.maticni_broj,
         f.godina,
         f.ukupni_prihodi
  from public.financials f
  order by f.maticni_broj, f.godina desc
)
select
  c.maticni_broj,
  c.sifra_delatnosti,
  c.sifra_opstine,
  f.godina,
  f.ukupni_prihodi,
  case when c.sifra_delatnosti is null or f.ukupni_prihodi is null then null else
    rank() over (partition by c.sifra_delatnosti order by f.ukupni_prihodi desc nulls last)
  end::int                                                            as rang_delatnost,
  count(f.ukupni_prihodi) over (partition by c.sifra_delatnosti)::int as ukupno_delatnost,
  case when c.sifra_opstine is null or f.ukupni_prihodi is null then null else
    rank() over (partition by c.sifra_opstine order by f.ukupni_prihodi desc nulls last)
  end::int                                                            as rang_opstina,
  count(f.ukupni_prihodi) over (partition by c.sifra_opstine)::int    as ukupno_opstina
from public.companies c
left join poslednji_fi f on f.maticni_broj = c.maticni_broj;

comment on materialized view public.mv_company_ranks is
  'Rang po prihodu unutar delatnosti i opstine, nulls last (migracija 004). Firme bez izvestaja imaju rang null.';

-- Jedinstveni indeks je USLOV za refresh ... concurrently.
create unique index idx_mv_company_ranks_pk on public.mv_company_ranks (maticni_broj);

-- Pomocni indeksi za kategorijske stranice (Faza D).
create index idx_mv_company_ranks_delatnost on public.mv_company_ranks (sifra_delatnosti, ukupni_prihodi desc);
create index idx_mv_company_ranks_opstina   on public.mv_company_ranks (sifra_opstine, ukupni_prihodi desc);

-- Prava se posle drop-a moraju postaviti ponovo: view nema RLS, pa se ne
-- izlaze Data API-ju (Supabase linter 0016). Cita ga server preko service_role.
revoke all on public.mv_company_ranks from anon, authenticated;
grant select on public.mv_company_ranks to service_role;

-- Provera posle migracije:
--   select rang_delatnost, rang_opstina from public.mv_company_ranks
--   where maticni_broj = '20053658';   -- Elektroprivreda Srbije, ocekuje se 1 i 1
--
--   select count(*) from public.mv_company_ranks where rang_delatnost is null;
--   -- firme bez finansijskog izvestaja
