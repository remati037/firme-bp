-- 001_initial_schema.sql
-- firme.biznisprice.com, inicijalna sema baze.
-- Sema je zakljucana u CLAUDE.md. Ne dodaji kolone bez eksplicitnog odobrenja.
--
-- Napomena o jedinicama: sve novcane vrednosti dolaze iz APR-a u HILJADAMA dinara
-- i tako se i cuvaju. Mnozenje sa 1000 radi se u UI sloju, ne ovde.

-- =============================================================================
-- 1. Ekstenzije
-- =============================================================================

-- pg_trgm ide u semu "extensions" (Supabase preporuka, public ostaje cist).
create extension if not exists pg_trgm with schema extensions;

-- =============================================================================
-- 2. Tabele
-- =============================================================================

-- Firme, jedan red po maticnom broju.
create table if not exists public.companies (
  maticni_broj      text primary key,
  slug              text        not null unique,
  poslovno_ime      text        not null,
  poslovno_ime_norm text        not null,  -- za pretragu: lowercase, bez interpunkcije
  sifra_opstine     text,
  opstina           text,                  -- normalizovano na latinicu
  status            text,
  status_aktivan    boolean,
  datum_osnivanja   date,
  pravna_forma      text,
  sifra_delatnosti  text,
  pib               text,                  -- popunjava se iz NBS, moze biti null
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.companies is
  'Privredna drustva iz APR open data seta. Kljuc je maticni broj.';
comment on column public.companies.poslovno_ime_norm is
  'Normalizovano ime za pg_trgm pretragu: lowercase, srpska slova u ASCII, bez interpunkcije.';

-- Poslednje stanje finansijskih izvestaja.
create table if not exists public.financials (
  maticni_broj             text   not null references public.companies (maticni_broj) on delete cascade,
  godina                   int    not null,
  poslovna_imovina         bigint,
  kapital                  bigint,
  gubitak                  bigint,
  ukupni_prihodi           bigint,
  neto_dobitak             bigint,
  neto_gubitak             bigint,
  prosecan_broj_zaposlenih int,
  primary key (maticni_broj, godina)
);

comment on table public.financials is
  'Poslednje poznato stanje finansijskih izvestaja. Novcane vrednosti su u hiljadama dinara.';

-- Arhiva svakog mesecnog preseka. Nikad se ne brise.
create table if not exists public.financials_history (
  id                       bigserial primary key,
  maticni_broj             text   not null,
  datum_preseka            date   not null,
  godina                   int    not null,
  poslovna_imovina         bigint,
  kapital                  bigint,
  gubitak                  bigint,
  ukupni_prihodi           bigint,
  neto_dobitak             bigint,
  neto_gubitak             bigint,
  prosecan_broj_zaposlenih int
);

comment on table public.financials_history is
  'Istorija po presecima. Append only, nikad delete. Nema FK da brisanje firme ne obrise istoriju.';

-- Sifarnik delatnosti (Uredba o klasifikaciji delatnosti).
create table if not exists public.nace_codes (
  sifra  text primary key,
  naziv  text,
  sektor text
);

-- Sifarnik opstina.
create table if not exists public.municipalities (
  sifra     text primary key,
  naziv_lat text,
  naziv_cir text,
  okrug     text
);

-- Kesirani AI sazeci, jedan po firmi po preseku.
create table if not exists public.ai_summaries (
  maticni_broj  text primary key references public.companies (maticni_broj) on delete cascade,
  datum_preseka date,
  summary       text,
  model         text,
  generated_at  timestamptz not null default now()
);

comment on table public.ai_summaries is
  'Kes AI sazetaka. Ako se datum_preseka promeni, sazetak se regenerise.';

-- Evidencija obradjenih preseka i arhiviranih sirovih fajlova.
create table if not exists public.snapshots (
  datum_preseka date primary key,
  storage_path  text,
  broj_firmi    int,
  broj_fi       int,
  created_at    timestamptz not null default now()
);

comment on table public.snapshots is
  'Interna evidencija ingesta. Nije javno citljiva.';

-- =============================================================================
-- 3. Indeksi
-- =============================================================================

-- Pretraga po imenu, mora da vrati odgovor ispod 100ms.
create index if not exists idx_companies_ime_norm_trgm
  on public.companies using gin (poslovno_ime_norm extensions.gin_trgm_ops);

create index if not exists idx_companies_sifra_delatnosti on public.companies (sifra_delatnosti);
create index if not exists idx_companies_sifra_opstine    on public.companies (sifra_opstine);
create index if not exists idx_companies_status_aktivan   on public.companies (status_aktivan);
create index if not exists idx_companies_pib              on public.companies (pib);

create index if not exists idx_financials_godina on public.financials (godina);

create index if not exists idx_financials_history_mb_presek
  on public.financials_history (maticni_broj, datum_preseka);

-- =============================================================================
-- 4. Materijalizovani view-ovi
-- =============================================================================
-- Svi rade nad POSLEDNJOM godinom po firmi (distinct on). Medijane racuna baza,
-- nikad runtime. Novcane vrednosti ostaju u hiljadama dinara.

-- Statistika po sifri delatnosti.
create materialized view if not exists public.mv_delatnost_stats as
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
  'Medijane po delatnosti. medijan_marze je u procentima, ostalo u hiljadama RSD.';

-- Statistika po opstini.
create materialized view if not exists public.mv_opstina_stats as
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
  'Medijane po opstini. medijan_marze je u procentima, ostalo u hiljadama RSD.';

-- Rang firme unutar delatnosti i unutar opstine, po ukupnim prihodima.
create materialized view if not exists public.mv_company_ranks as
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
    rank() over (partition by c.sifra_delatnosti order by f.ukupni_prihodi desc)
  end::int                                                            as rang_delatnost,
  count(f.ukupni_prihodi) over (partition by c.sifra_delatnosti)::int as ukupno_delatnost,
  case when c.sifra_opstine is null or f.ukupni_prihodi is null then null else
    rank() over (partition by c.sifra_opstine order by f.ukupni_prihodi desc)
  end::int                                                            as rang_opstina,
  count(f.ukupni_prihodi) over (partition by c.sifra_opstine)::int    as ukupno_opstina
from public.companies c
left join poslednji_fi f on f.maticni_broj = c.maticni_broj;

comment on materialized view public.mv_company_ranks is
  'Rang po prihodu unutar delatnosti i opstine. Firme bez izvestaja imaju rang null.';

-- Jedinstveni indeksi su USLOV za refresh ... concurrently.
create unique index if not exists idx_mv_delatnost_stats_pk on public.mv_delatnost_stats (sifra_delatnosti);
create unique index if not exists idx_mv_opstina_stats_pk   on public.mv_opstina_stats (sifra_opstine);
create unique index if not exists idx_mv_company_ranks_pk   on public.mv_company_ranks (maticni_broj);

-- Pomocni indeksi za kategorijske stranice.
create index if not exists idx_mv_company_ranks_delatnost on public.mv_company_ranks (sifra_delatnosti, ukupni_prihodi desc);
create index if not exists idx_mv_company_ranks_opstina   on public.mv_company_ranks (sifra_opstine, ukupni_prihodi desc);

-- =============================================================================
-- 5. Osvezavanje statistike
-- =============================================================================
-- Poziva se na kraju svakog ingesta. security definer jer view-ove poseduje
-- postgres, a skripta se prijavljuje kao service_role.

create or replace function public.refresh_all_stats()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    refresh materialized view concurrently public.mv_delatnost_stats;
    refresh materialized view concurrently public.mv_opstina_stats;
    refresh materialized view concurrently public.mv_company_ranks;
  exception when others then
    -- concurrently pada ako view jos nije popunjen; tada obican refresh
    raise notice 'Concurrent refresh nije uspeo (%), prelazim na obican refresh.', sqlerrm;
    refresh materialized view public.mv_delatnost_stats;
    refresh materialized view public.mv_opstina_stats;
    refresh materialized view public.mv_company_ranks;
  end;
end;
$$;

revoke all on function public.refresh_all_stats() from public, anon, authenticated;
grant execute on function public.refresh_all_stats() to service_role;

-- =============================================================================
-- 6. RLS i prava
-- =============================================================================
-- Pravilo: anon sme SELECT na sve tabele osim snapshots.
-- Upis ide iskljucivo preko service_role, koji zaobilazi RLS.

alter table public.companies          enable row level security;
alter table public.financials         enable row level security;
alter table public.financials_history enable row level security;
alter table public.nace_codes         enable row level security;
alter table public.municipalities     enable row level security;
alter table public.ai_summaries       enable row level security;
alter table public.snapshots          enable row level security;

-- Politike se prvo brisu da bi migracija mogla da se pusti vise puta.
drop policy if exists "javno citanje" on public.companies;
drop policy if exists "javno citanje" on public.financials;
drop policy if exists "javno citanje" on public.financials_history;
drop policy if exists "javno citanje" on public.nace_codes;
drop policy if exists "javno citanje" on public.municipalities;
drop policy if exists "javno citanje" on public.ai_summaries;
drop policy if exists "servis pun pristup" on public.companies;
drop policy if exists "servis pun pristup" on public.financials;
drop policy if exists "servis pun pristup" on public.financials_history;
drop policy if exists "servis pun pristup" on public.nace_codes;
drop policy if exists "servis pun pristup" on public.municipalities;
drop policy if exists "servis pun pristup" on public.ai_summaries;
drop policy if exists "servis pun pristup" on public.snapshots;

-- Javno citljivo
create policy "javno citanje" on public.companies
  for select to anon, authenticated using (true);
create policy "javno citanje" on public.financials
  for select to anon, authenticated using (true);
create policy "javno citanje" on public.financials_history
  for select to anon, authenticated using (true);
create policy "javno citanje" on public.nace_codes
  for select to anon, authenticated using (true);
create policy "javno citanje" on public.municipalities
  for select to anon, authenticated using (true);
create policy "javno citanje" on public.ai_summaries
  for select to anon, authenticated using (true);

-- snapshots nema select politiku za anon, dakle nije javno citljiv.

-- Eksplicitne politike za service_role. Service role ionako zaobilazi RLS,
-- ovo stoji radi jasne namere pri auditu.
create policy "servis pun pristup" on public.companies
  for all to service_role using (true) with check (true);
create policy "servis pun pristup" on public.financials
  for all to service_role using (true) with check (true);
create policy "servis pun pristup" on public.financials_history
  for all to service_role using (true) with check (true);
create policy "servis pun pristup" on public.nace_codes
  for all to service_role using (true) with check (true);
create policy "servis pun pristup" on public.municipalities
  for all to service_role using (true) with check (true);
create policy "servis pun pristup" on public.ai_summaries
  for all to service_role using (true) with check (true);
create policy "servis pun pristup" on public.snapshots
  for all to service_role using (true) with check (true);

-- Prava na nivou tabela (RLS filtrira redove, grant otvara operaciju).
grant usage on schema public to anon, authenticated;

grant select on public.companies          to anon, authenticated;
grant select on public.financials         to anon, authenticated;
grant select on public.financials_history to anon, authenticated;
grant select on public.nace_codes         to anon, authenticated;
grant select on public.municipalities     to anon, authenticated;
grant select on public.ai_summaries       to anon, authenticated;

revoke all on public.snapshots from anon, authenticated;

grant all on public.companies          to service_role;
grant all on public.financials         to service_role;
grant all on public.financials_history to service_role;
grant all on public.nace_codes         to service_role;
grant all on public.municipalities     to service_role;
grant all on public.ai_summaries       to service_role;
grant all on public.snapshots          to service_role;
grant usage, select on sequence public.financials_history_id_seq to service_role;

-- Materijalizovani view-ovi nemaju RLS. Sadrze samo agregate javnih podataka,
-- pa se citanje dozvoljava, ali upis nikome osim vlasniku.
grant select on public.mv_delatnost_stats to anon, authenticated, service_role;
grant select on public.mv_opstina_stats   to anon, authenticated, service_role;
grant select on public.mv_company_ranks   to anon, authenticated, service_role;
