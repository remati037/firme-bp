# firme.biznisprice.com

Besplatna provera srpskih firmi iz APR open data seta. Next.js 16 (App Router),
Supabase (Postgres). Hosting je u migraciji sa Vercela na Hetzner + Coolify —
plan i koraci su u [`docs/migration/`](docs/migration/).

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
| `NEXT_PUBLIC_SUPABASE_URL` | build + runtime + CI | adresa Supabase projekta |
| `SUPABASE_SECRET_KEY` | build + runtime + CI | serverski upiti; fallback je `SUPABASE_SERVICE_ROLE_KEY` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build | javni ključ; fallback je `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_SITE_URL` | build + runtime | canonical, `og:url`, `robots.txt` i sitemap; bez završne kose crte |
| `NEXT_PUBLIC_DATUM_PRESEKA` | opciono | fallback ako baza ne odgovori; presek se inače čita iz `snapshots` |
| `NEXT_PUBLIC_BROJ_FIRMI`, `NEXT_PUBLIC_KURS_EUR_RSD` | opciono | fallback konstante, vidi `lib/site.ts` |
| `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` | samo skripte | generisanje AI sažetaka |
| `AI_PROVAJDER`, `AI_MODEL` | samo skripte | izbor provajdera pri pokretanju |
| `NBS_UA` | samo skripte, opciono | User-Agent za NBS; pretraga dužnika nema prijavu ni captchu |

Sve sa `NEXT_PUBLIC_` prefiksom se **inline-uje u klijentski bundle u vreme
build-a** i mora postojati kao build argument u Dockeru, ne samo u runtime-u.

Nekadašnji `NBS_USERNAME` i `NBS_PASSWORD` ne postoje nigde u kodu i uklonjeni su
iz CI-ja 27.08.2026.

Zašto serverski ključ uopšte treba: materijalizovani view-ovi i tabela
`snapshots` nisu izloženi `anon` ulozi (migracija 001), a stranica firme čita
baš njih. Taj ključ zaobilazi RLS i sme da piše — **nikad ne sme dobiti
`NEXT_PUBLIC_` prefiks** i ne sme se uvoziti u klijentsku komponentu.

Preporuka je novi Supabase tajni ključ (`sb_secret_...`, Project Settings →
API Keys), a ne legacy `service_role`: povlači se i rotira pojedinačno, pa se
pristup može oduzeti bez diranja ingest pipeline-a.

## Deploy

**U migraciji.** Ciljna infrastruktura je Hetzner VPS + Coolify + Cloudflare;
Supabase ostaje gde jeste. Koraci, podela na "automatski" i "ručno", i Cloudflare
pravila su u [`docs/migration/RUNBOOK-MIGRACIJA.md`](docs/migration/RUNBOOK-MIGRACIJA.md).
(Detaljan audit koda, `PROJECT-AUDIT.md`, drži se lokalno i nije u gitu.)

Novi tok: `push` na `main` → [`.github/workflows/build-image.yml`](.github/workflows/build-image.yml)
gradi image (`Dockerfile`, `output: 'standalone'`), gura ga u privatan GHCR i
okida Coolify webhook. Tajni ključ ulazi kroz BuildKit `--secret`, pa ga nema u
`docker history` — bitno, jer je repo public.

Mesečni presek **ne pravi rebuild**: stranice imaju `revalidate` od 30 dana i
`stale-while-revalidate`, pa se osvežavaju same. Posle ingesta se purge-uju samo
hub stranice i sitemapi (vidi [`monthly-ingest.yml`](.github/workflows/monthly-ingest.yml)).

Latencija do Supabase-a je merljiva SEO stavka: cache miss na stranici firme je
~0,47 s TTFB uz 3 talasa PostgREST upita, a prag iz SEO.md §6 je p95 < 500 ms.
Zato server ide u nemački region (FSN1/NBG1), najbliži `eu-central-1`.
[`vercel.json`](vercel.json) (`regions: ["fra1"]`) ostaje u repou dok traje
prozor za rollback na Vercel.

**Build NE prolazi bez env varijabli.** Ranija tvrdnja da prolazi važila je dok
`/mapa/[metrika]` nije postojala: ta ruta ima `dynamicParams = false`, pa je njen
prerender obavezan i zove bazu bez fallback-a. Isto važi za `/delatnost` i `/grad`.
Bez `NEXT_PUBLIC_SUPABASE_URL` i tajnog ključa build puca u koraku
"Generating static pages".

Izmereno 27.08.2026. (Node 24, Turbopack): **41 s, peak RSS 1,11 GB, 795
prerenderovanih stranica, `.next` 506 MB**. Stranice firmi se i dalje NE
prerenderuju — prave se na zahtev i žive u ISR kešu 30 dana.

## Podaci

```bash
npm run ingest                                   # mesečni APR presek
npm run seed                                     # šifarnici delatnosti i opština
npx tsx scripts/primeni-override-imena.ts        # ručni izuzeci za skraćeno ime
npm run enrich-nbs                               # PIB + blokade iz NBS (top 5000 po prihodu)
npm run enrich-nbs -- --limit=0                  # sve firme (133.634)
npm run enrich-nbs-rir                           # drugi prolaz: PIB za firme bez njega (JRR)
```

NBS obogaćivanje (migracija 006, tabela `blokade`): puni `companies.pib` i upisuje
blokade računa iz NBS javne pretrage dužnika u prinudnoj naplati. Skripte su
nastavljive (progress u `scripts/data/nbs-zavrseno.json`, `nbs-rir-zavrseno.json`).
`enrich-nbs-rir` se pokreće posle `enrich-nbs` i popunjava PIB i za firme koje
prinudna naplata ne pokriva (Jedinstveni registar računa).

Migracije su u `supabase/migrations/`. Šema je zaključana — nove kolone i tabele
samo uz odobrenje vlasnika projekta.
