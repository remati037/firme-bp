-- 005_zbirovi_u_statistici.sql
-- Dodaje ukupan prihod i ukupan broj zaposlenih u statistiku delatnosti i opština.
--
-- ZAŠTO: SEO.md §3 propisuje opis stranice /grad kao
--   "{brojFirmi} firmi registrovanih u opštini {Opstina}. Ukupan prihod {x} RSD,
--    {y} zaposlenih."
-- View-ovi iz migracije 001 imaju samo medijane, pa se taj šablon nije mogao
-- ispuniti. Zbir se NE sme računati u runtime-u (CLAUDE.md: nikad agregacija u
-- runtime-u), pa ide u view.
--
-- Kao i 004: ne dira nijednu tabelu, samo re-kreira dva materijalizovana
-- view-a. Posle drop-a se gube indeksi i prava, pa se postavljaju ponovo.
--
-- Definicije su nepromenjene u odnosu na 001, osim dve nove kolone.
-- Odobrio vlasnik projekta 15.08.2026.

-- =============================================================================
-- mv_delatnost_stats
-- =============================================================================

drop materialized view if exists public.mv_delatnost_stats;

create materialized view public.mv_delatnost_stats as
with poslednji_fi as (
  select distinct on (f.maticni_broj)
         f.maticni_broj,
         f.godina,
         f.ukupni_prihodi,
         f.neto_dobitak,
         f.neto_gubitak,
         f.prosecan_broj_zaposlenih
  from public.financials f
  order by f.maticni_broj, f.godina desc
)
select
  c.sifra_delatnosti,
  max(f.godina)                                        as godina,
  count(*)::int                                        as broj_firmi,
  count(*) filter (where c.status_aktivan)::int        as broj_aktivnih,
  count(f.maticni_broj)::int                           as broj_sa_izvestajem,
  sum(f.ukupni_prihodi)::bigint                        as ukupan_prihod,
  sum(f.prosecan_broj_zaposlenih)::bigint              as ukupno_zaposlenih,
  percentile_cont(0.5) within group (order by f.ukupni_prihodi)
    filter (where f.ukupni_prihodi > 0)                as medijan_prihoda,
  percentile_cont(0.5) within group (
    order by (f.neto_dobitak - f.neto_gubitak)::numeric / nullif(f.ukupni_prihodi, 0) * 100
  ) filter (where f.ukupni_prihodi > 0)                as medijan_marze,
  percentile_cont(0.5) within group (
    order by f.ukupni_prihodi::numeric / nullif(f.prosecan_broj_zaposlenih, 0)
  ) filter (where f.prosecan_broj_zaposlenih > 0
              and f.ukupni_prihodi > 0)                as medijan_prihoda_po_zaposlenom
from public.companies c
left join poslednji_fi f on f.maticni_broj = c.maticni_broj
where c.sifra_delatnosti is not null
group by c.sifra_delatnosti;

comment on materialized view public.mv_delatnost_stats is
  'Medijane i zbirovi po delatnosti (migracija 005). medijan_marze je u procentima, novac u hiljadama RSD.';

create unique index idx_mv_delatnost_stats_pk on public.mv_delatnost_stats (sifra_delatnosti);

revoke all on public.mv_delatnost_stats from anon, authenticated;
grant select on public.mv_delatnost_stats to service_role;

-- =============================================================================
-- mv_opstina_stats
-- =============================================================================

drop materialized view if exists public.mv_opstina_stats;

create materialized view public.mv_opstina_stats as
with poslednji_fi as (
  select distinct on (f.maticni_broj)
         f.maticni_broj,
         f.godina,
         f.ukupni_prihodi,
         f.neto_dobitak,
         f.neto_gubitak,
         f.prosecan_broj_zaposlenih
  from public.financials f
  order by f.maticni_broj, f.godina desc
)
select
  c.sifra_opstine,
  max(c.opstina)                                       as opstina,
  max(f.godina)                                        as godina,
  count(*)::int                                        as broj_firmi,
  count(*) filter (where c.status_aktivan)::int        as broj_aktivnih,
  count(f.maticni_broj)::int                           as broj_sa_izvestajem,
  sum(f.ukupni_prihodi)::bigint                        as ukupan_prihod,
  sum(f.prosecan_broj_zaposlenih)::bigint              as ukupno_zaposlenih,
  percentile_cont(0.5) within group (order by f.ukupni_prihodi)
    filter (where f.ukupni_prihodi > 0)                as medijan_prihoda,
  percentile_cont(0.5) within group (
    order by (f.neto_dobitak - f.neto_gubitak)::numeric / nullif(f.ukupni_prihodi, 0) * 100
  ) filter (where f.ukupni_prihodi > 0)                as medijan_marze,
  percentile_cont(0.5) within group (
    order by f.ukupni_prihodi::numeric / nullif(f.prosecan_broj_zaposlenih, 0)
  ) filter (where f.prosecan_broj_zaposlenih > 0
              and f.ukupni_prihodi > 0)                as medijan_prihoda_po_zaposlenom
from public.companies c
left join poslednji_fi f on f.maticni_broj = c.maticni_broj
where c.sifra_opstine is not null
group by c.sifra_opstine;

comment on materialized view public.mv_opstina_stats is
  'Medijane i zbirovi po opstini (migracija 005). medijan_marze je u procentima, novac u hiljadama RSD.';

create unique index idx_mv_opstina_stats_pk on public.mv_opstina_stats (sifra_opstine);

revoke all on public.mv_opstina_stats from anon, authenticated;
grant select on public.mv_opstina_stats to service_role;

-- Provera posle migracije:
--   select sifra_opstine, broj_firmi, ukupan_prihod, ukupno_zaposlenih
--   from public.mv_opstina_stats order by ukupan_prihod desc limit 3;
--   -- zbir delatnosti ne sme da bude manji od prihoda najvece firme u njoj
