-- 006_blokade.sql
-- Podaci o blokadama računa iz NBS registra dužnika u prinudnoj naplati.
--
-- ZAŠTO: APR open data nema blokade (CLAUDE.md, poznata ograničenja). NBS javna
-- pretraga dužnika (webappcenter.nbs.rs/PnWebApp/EnforcedCollectionDebtor) daje
-- po matičnom broju: PIB, ukupan iznos blokade (bez kamate), periode blokade u
-- poslednjih 5 godina i datum zabrane prenosa.
--
-- Red postoji SAMO za firme koje imaju (ili su imale u poslednjih 5 godina)
-- blokadu. Firma bez reda nema blokadu — isto pravilo kao i kod "Signala" u
-- CLAUDE.md: prikazujemo samo ono što postoji.
--
-- Napomena o jedinicama: iznos je u DINARIMA (NBS ga daje u dinarima, za razliku
-- od APR finansijskih izveštaja koji su u hiljadama dinara).
--
-- Odobrio vlasnik projekta 16.08.2026 (zajedno sa popunjavanjem companies.pib).

create table if not exists public.blokade (
  maticni_broj    text primary key references public.companies (maticni_broj) on delete cascade,
  iznos           numeric,      -- ukupan iznos blokade u RSD (bez kamate), NULL ako nije poznat
  ukupno_dana     int,          -- dana blokade u poslednjih 5 godina
  zabrana_prenosa date,         -- datum zabrane prenosa (tekuća blokada), NULL ako nema
  periodi         jsonb,        -- istorija blokada 5 godina: [{od, do, dana}]
  provereno_at    timestamptz not null default now()
);

comment on table public.blokade is
  'Blokade računa iz NBS registra dužnika u prinudnoj naplati. Red samo za firme sa blokadom.';
comment on column public.blokade.iznos is 'Ukupan iznos blokade u RSD, bez kamate.';
comment on column public.blokade.ukupno_dana is 'Ukupno dana blokade u poslednjih 5 godina.';
comment on column public.blokade.zabrana_prenosa is 'Datum zabrane prenosa (tekuća blokada).';
comment on column public.blokade.periodi is 'Periodi blokade u poslednjih 5 godina: [{od, do, dana}].';

alter table public.blokade enable row level security;

drop policy if exists "javno citanje" on public.blokade;
drop policy if exists "servis pun pristup" on public.blokade;

create policy "javno citanje" on public.blokade
  for select to anon, authenticated using (true);

create policy "servis pun pristup" on public.blokade
  for all to service_role using (true) with check (true);

-- Prava na nivou tabela (RLS filtrira redove, grant otvara operaciju).
grant select on public.blokade to anon, authenticated;
grant all on public.blokade to service_role;
