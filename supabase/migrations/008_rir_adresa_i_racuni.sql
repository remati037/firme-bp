-- 008_rir_adresa_i_racuni.sql
-- Adresa sedišta i bankovni računi iz NBS Jedinstvenog registra računa (JRR).
--
-- ZAŠTO: APR open data nema adresu ni račune (CLAUDE.md, poznata ograničenja).
-- NBS RIR (webappcenter.nbs.rs/PnWebApp/CompanyAccount) po matičnom broju vraća
-- tabelu sa kolonama: naziv, MB, PIB, ADRESA, mesto, opština, delatnost, BANKA,
-- BROJ RAČUNA, status, podleže/ne podleže blokadi, datum otvaranja.
-- Isti izvor koji koristi i kompanije.co.rs za svoja polja "Adresa" i "Računi".
--
-- companies.adresa: jedna vrednost po firmi (najčešća među redovima RIR-a).
-- Tabela racuni: red po računu, upsert po (maticni_broj, broj_racuna).
--
-- Odobrio vlasnik projekta 17.08.2026 (uz analizu kompanije.co.rs).

alter table public.companies
  add column if not exists adresa text;

comment on column public.companies.adresa is
  'Adresa sedišta iz NBS Jedinstvenog registra računa (kolona "Адреса"). NULL dok se ne popuni.';

create table if not exists public.racuni (
  id              bigserial primary key,
  maticni_broj    text   not null references public.companies (maticni_broj) on delete cascade,
  banka           text,            -- npr. "Banca Intesa A.D.- Beograd"
  broj_racuna     text,            -- npr. "160-0000000390197-81"
  status          text,            -- "Укључен" / "Искључен"
  podleze_blokadi boolean,         -- "Подлеже блокади" / "Не подлеже блокади"
  datum_otvaranja date,
  provereno_at    timestamptz not null default now(),
  unique (maticni_broj, broj_racuna)
);

comment on table public.racuni is
  'Bankovni računi iz NBS Jedinstvenog registra računa. Red po računu, upsert po (maticni_broj, broj_racuna).';
comment on column public.racuni.podleze_blokadi is
  'Da li račun podleže blokadi (iz RIR kolone "Подлеже/не подлеже блокади").';

create index if not exists idx_racuni_maticni_broj on public.racuni (maticni_broj);

alter table public.racuni enable row level security;

drop policy if exists "javno citanje" on public.racuni;
drop policy if exists "servis pun pristup" on public.racuni;

create policy "javno citanje" on public.racuni
  for select to anon, authenticated using (true);

create policy "servis pun pristup" on public.racuni
  for all to service_role using (true) with check (true);

grant select on public.racuni to anon, authenticated;
grant all on public.racuni to service_role;
grant usage, select on sequence public.racuni_id_seq to service_role;
