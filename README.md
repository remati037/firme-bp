# firme.biznisprice.com

Besplatna provera srpskih firmi iz APR open data seta. Next.js 16 (App Router),
Supabase (Postgres), Vercel.

Kontekst i pravila su u [`CLAUDE.md`](CLAUDE.md), tehnička SEO specifikacija u
[`SEO.md`](SEO.md). SEO.md ima prednost gde se dokumenti razilaze.

## Lokalno pokretanje

```bash
npm install
npm run dev
```

Vrednosti env varijabli idu u `.env.local` (nije u gitu). Spisak je ispod.

```bash
npm run build       # produkcijski build
npm run lint        # eslint
npm test            # vitest, uključuje testove nad pravom bazom
```

## Env varijable

| Varijabla | Gde treba | Čemu služi |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + lokalno + CI | adresa Supabase projekta |
| `SUPABASE_SECRET_KEY` | Vercel + lokalno + CI | serverski upiti; fallback je `SUPABASE_SERVICE_ROLE_KEY` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + lokalno | javni ključ; fallback je `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_SITE_URL` | Vercel | canonical i `og:url`, bez završne kose crte |
| `NEXT_PUBLIC_DATUM_PRESEKA` | opciono | fallback ako baza ne odgovori; presek se inače čita iz `snapshots` |
| `ANTHROPIC_API_KEY` | samo skripte | generisanje AI sažetaka |
| `NBS_USERNAME`, `NBS_PASSWORD` | samo skripte | mapiranje matičnog broja na PIB |

Zašto serverski ključ uopšte treba: materijalizovani view-ovi i tabela
`snapshots` nisu izloženi `anon` ulozi (migracija 001), a stranica firme čita
baš njih. Taj ključ zaobilazi RLS i sme da piše — **nikad ne sme dobiti
`NEXT_PUBLIC_` prefiks** i ne sme se uvoziti u klijentsku komponentu.

Preporuka je novi Supabase tajni ključ (`sb_secret_...`, Project Settings →
API Keys), a ne legacy `service_role`: povlači se i rotira pojedinačno, pa se
pristup može oduzeti bez diranja ingest pipeline-a.

## Deploy

Vercel prati granu iz gita. Posle svake izmene env varijabli treba novi deploy —
postojeći build ne pokupi promenu.

Region funkcija je zakucan u [`vercel.json`](vercel.json) na `fra1` (Frankfurt),
isto gde je i Supabase projekat (eu-central-1). Bez toga funkcije idu u podrazumevani
region, a stranica firme radi više upita po renderu, pa p95 TTFB probije prag od
500 ms iz SEO.md §6.

Build prolazi i bez ijedne env varijable (futer padne na konstantu, stranice firmi
se prave na zahtev), pa zelen build ne znači da baza radi — proveri jednu stranicu
firme.

## Podaci

```bash
npm run ingest                                   # mesečni APR presek
npm run seed                                     # šifarnici delatnosti i opština
npx tsx scripts/primeni-override-imena.ts        # ručni izuzeci za skraćeno ime
```

Migracije su u `supabase/migrations/`. Šema je zaključana — nove kolone i tabele
samo uz odobrenje vlasnika projekta.
