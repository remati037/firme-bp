-- 007_zabrane.sql
-- Privremena ograničenja prava (APR Centralna evidencija, crp.apr.gov.rs).
--
-- ZAŠTO: NBS blokade (tabela blokade, migracija 006) pokrivaju prinudnu
-- naplatu, ali APR vodi posebnu evidenciju mera: zabrane obavljanja
-- delatnosti, zabrane raspolaganja novčanim sredstvima (sud/izvršitelj),
-- zabrane vršenja dužnosti, zabrane raspolaganja udelima i poreske mere.
--
-- Jedna firma može imati više mera → red po meri (izvor_id je submission id
-- iz portala, jedinstven za dedup). Redovi postoje samo za mere koje su
-- pronađene u javnoj pretrazi.
--
-- Odobrio vlasnik projekta 16.08.2026.

create table if not exists public.zabrane (
  id              bigserial primary key,
  maticni_broj    text   not null references public.companies (maticni_broj) on delete cascade,
  izvor_id        text   unique,   -- submission id iz portala, za idempotentan upsert
  referenca       text,            -- npr. "CEPOP-APR-6697-TRINTD-2/2026"
  vrsta           text,            -- npr. "[5] Мера изречена на основу прописа..."
  sifra           text,            -- npr. "5UPA1"
  pocetak_vazenja date,
  izbrisana       boolean,         -- "Мера је избрисана" (Да/Не) — prikaz samo aktivnih
  opis            text,
  provereno_at    timestamptz not null default now()
);

comment on table public.zabrane is
  'Privremena ograničenja prava iz APR Centralne evidencije (crp.apr.gov.rs). Red po meri.';
comment on column public.zabrane.izbrisana is
  'Mera označena kao izbrisana u evidenciji; pri prikazu se filtrira.';

create index if not exists idx_zabrane_maticni_broj on public.zabrane (maticni_broj);

alter table public.zabrane enable row level security;

drop policy if exists "javno citanje" on public.zabrane;
drop policy if exists "servis pun pristup" on public.zabrane;

create policy "javno citanje" on public.zabrane
  for select to anon, authenticated using (true);

create policy "servis pun pristup" on public.zabrane
  for all to service_role using (true) with check (true);

grant select on public.zabrane to anon, authenticated;
grant all on public.zabrane to service_role;
grant usage, select on sequence public.zabrane_id_seq to service_role;
