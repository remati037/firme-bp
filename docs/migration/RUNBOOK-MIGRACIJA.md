# RUNBOOK — migracija sa Vercela na Hetzner + Coolify

> **Ako ti treba verzija klik-po-klik**, sa objašnjenjima šta je Docker image,
> šta je GHCR i zašto koji korak postoji, ona je ovde:
> https://claude.ai/code/artifact/e1d35e38-d1c6-4fd0-a7ef-981d90fef3d1
>
> Ovaj fajl je sažeta tehnička referenca za isti posao.

Prati [`PROJECT-AUDIT.md`](PROJECT-AUDIT.md). Sve što je moglo da se uradi u kodu
je urađeno 27.08.2026. — ovaj fajl je spisak onoga što **mora ručno**, plus
Cloudflare pravila i redosled cutover-a.

Ništa nije commit-ovano ni push-ovano. Prvi push okida prvi image build.

---

## Šta je već urađeno u repou

| fajl | izmena |
|---|---|
| [`next.config.ts`](../../next.config.ts) | `output: 'standalone'`, `poweredByHeader: false` |
| [`Dockerfile`](../../Dockerfile) | 3-stepeni build, Node 24 Alpine, BuildKit `--secret` za tajni ključ, `content/` u runtime sloju |
| [`.dockerignore`](../../.dockerignore) | novo; `content/**/*.md` je izuzet iz isključivanja |
| [`docker-entrypoint.sh`](../../docker-entrypoint.sh) | zaseje ISR keš na volumenu, briše ga kad se `BUILD_ID` promeni, spušta privilegije |
| [`.github/workflows/build-image.yml`](../../.github/workflows/build-image.yml) | novo; build → privatan GHCR → Coolify webhook |
| [`.github/workflows/monthly-ingest.yml`](../../.github/workflows/monthly-ingest.yml) | Node 24; mrtav `enrich-pib.ts` korak zamenjen pravim skriptama i premešten na kraj; `NBS_USERNAME`/`NBS_PASSWORD` uklonjeni; Vercel deploy hook zamenjen Cloudflare purge-om; `timeout-minutes` 30 → 120 |
| [`package.json`](../../package.json) | `engines: { node: "24.x" }` |
| [`README.md`](../../README.md) | ispravljena netačna tvrdnja o build-u bez env varijabli; osvežena env tabela i Deploy sekcija |

`vercel.json` je **namerno ostavljen** — treba za rollback prozor.

---

## RUČNO — 1. GitHub

### 1.1 Secrets (Settings → Secrets and variables → Actions → Secrets)

| ime | odakle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys (`anon` / `sb_publishable_...`) |
| `COOLIFY_DEPLOY_HOOK` | Coolify → aplikacija → Webhooks (posle koraka 3) |
| `CF_ZONE_ID` | Cloudflare → Overview → desna kolona, "Zone ID" |
| `CF_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token → Custom: **Zone → Cache Purge → Purge**, ograničeno na zonu `biznisprice.com` |
| `NBS_UA` | opciono; string tipa `BiznisPrice/1.0 (+https://firme.biznisprice.com)` |

Već postoje: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Mogu da se obrišu: `NBS_USERNAME`, `NBS_PASSWORD` (nijedna skripta ih ne čita),
i `VERCEL_DEPLOY_HOOK` — **ali tek posle isteka rollback prozora**.

### 1.2 Variables (isti ekran, tab "Variables")

`NEXT_PUBLIC_SITE_URL` = `https://firme.biznisprice.com`

Danas ne postoji nigde (potvrdio si), pa sajt radi na hardkodovanom fallback-u iz
[`lib/site.ts:12`](../../lib/site.ts). Radi na produkciji, ali bi svaki staging deploy
objavljivao produkcijske canonical-e. Workflow ima fallback na istu vrednost, pa
ovo nije blokada — samo higijena.

### 1.3 Posle PRVOG uspešnog build-a: GHCR paket na private

**Repo je public, pa paket nasleđuje public vidljivost.** Odmah posle prvog
`build-image` run-a:

GitHub → tvoj profil → **Packages** → `firme-bp` → **Package settings** →
**Danger Zone → Change visibility → Private**.

Zatim: **Manage Actions access** → dodaj repo `remati037/firme-bp` sa `Write`.

> Image ne sadrži nijedan secret (BuildKit `--secret` se ne upisuje u slojeve),
> ali sadrži ceo build sajta. Nema razloga da bude javan.

---

## RUČNO — 2. Hetzner

### 2.1 Pre svega: potvrdi Supabase region

Supabase → Project Settings → General → **Region**.

- `eu-central-1` (Frankfurt) → uzmi **FSN1** ili **NBG1**
- **HEL1 (Finska) se odbacuje** bez obzira na cenu

Razlog nije teorija: cache miss na stranici firme je izmeren na **~0,47 s TTFB**
uz 3 talasa PostgREST upita ([`lib/firma-podaci.ts:133,222,237`](../../lib/firma-podaci.ts)), a prag iz
SEO.md §6 je p95 < 500 ms. Već smo na ivici.

### 2.2 Instanca

**CX32 — 4 vCPU / 8 GB RAM / 80 GB NVMe.**

Zašto ne CX22 (40 GB):

| stavka | veličina |
|---|---|
| ISR keš, 133.634 firme × ~239 KB (izmereno) | **~31 GB** |
| ukrštene stranice, ~4.826 × ~500 KB | ~2,4 GB |
| Docker image + slojevi | ~1,5 GB |
| OS + Docker runtime | ~8 GB |

40 GB se popuni pre nego što Googlebot obiđe bazu. Alternativa je CX22 +
Hetzner Volume od 60 GB, ako više voliš da keš raste odvojeno.

4 jezgra nisu luksuz: OG slika košta **0,54 s CPU po pozivu** i ne kešira se na
origin-u (vidi Cloudflare pravilo 4 — ono je pravo rešenje).

### 2.3 Podešavanje servera

```bash
ssh root@<IP>
apt update && apt upgrade -y
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# SSH: bez lozinke, bez root prijave
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

**Firewall (Hetzner Cloud Firewall, u panelu — ne ufw):**

| pravilo | vrednost |
|---|---|
| SSH 22 | samo tvoja IP adresa |
| 80, 443 | **samo Cloudflare IP opsezi** — https://www.cloudflare.com/ips/ |

Bez drugog pravila neko može da pogodi origin IP i zaobiđe Cloudflare — čime
padaju i keš i WAF.

---

## RUČNO — 3. Coolify

1. Coolify Cloud → **Add Server** → unesi IP i SSH ključ korisnika `deploy`,
   pusti da instalira agenta.
2. **New Resource → Docker Image**
   - Image: `ghcr.io/remati037/firme-bp:latest`
   - Registry credentials: GitHub username + PAT sa `read:packages`
   - Port: `3000`
3. **Environment Variables** (runtime, **ne** build variables — build je gotov):
   ```
   NODE_ENV=production
   NEXT_PUBLIC_SUPABASE_URL=<iz Supabase>
   SUPABASE_SERVICE_ROLE_KEY=<iz Supabase>
   NEXT_PUBLIC_SITE_URL=https://firme.biznisprice.com
   ```
4. **Persistent Storage → Add volume**
   - Name: `isr-cache`
   - Mount path: `/app/.next/server/app`

   > `docker-entrypoint.sh` sam zaseje ovaj volumen iz `app-baked/` i obriše ga
   > kad se `BUILD_ID` promeni. Ne diraj ga ručno.
5. **Domains**: prvo `novi.firme.biznisprice.com` (za test), kasnije pravi domen.
6. **Health check path**: `/robots.txt`
7. Kopiraj **Deploy webhook URL** → u GitHub secret `COOLIFY_DEPLOY_HOOK`.

---

## RUČNO — 4. Cloudflare

### 4.1 SSL/TLS i osnovno

| gde | stavka | vrednost |
|---|---|---|
| SSL/TLS → Overview | encryption mode | **Full (strict)** |
| SSL/TLS → Origin Server | Origin Certificate | izdaj i instaliraj u Coolify (Let's Encrypt preko HTTP-01 ne prolazi iza proxy-ja) |
| SSL/TLS → Edge Certificates | Always Use HTTPS | **On** |
| SSL/TLS → Edge Certificates | Automatic HTTPS Rewrites | **On** |
| Speed → Optimization | Brotli | **On** |
| Caching → Tiered Cache | Argo Tiered Cache | **On** (besplatno) |
| Security → Bots | Bot Fight Mode | **OFF** |
| Security → Bots | Block AI Scrapers / AI Labyrinth | **OFF** |
| Rules | Redirect Rule za trailing slash | **ne praviti** |

> **Bot Fight Mode mora biti isključen.** [`app/robots.ts:17-31`](../../app/robots.ts) izričito pušta
> `GPTBot`, `ClaudeBot`, `PerplexityBot`, `OAI-SearchBot`, `Claude-SearchBot`.
> Cloudflare-ovi AI-bot filteri bi ih blokirali i poništili celu strategiju
> prisustva u AI pretrazi.

> **Trailing slash pravilo se ne pravi.** Next već šalje 308 (`/:path+/` → `/:path+`,
> vidi `.next/routes-manifest.json`). Duplo pravilo daje dupli hop, što je gubitak
> na 133k URL-ova.

### 4.2 Cache Rules (Rules → Cache Rules) — **redosled je bitan**

**Pravilo 1 — Bypass za RSC navigacije** *(mora biti prvo)*

```
Ime:        01 - bypass RSC
Expression: (len(http.request.headers["rsc"]) > 0)
            or (len(http.request.headers["next-router-prefetch"]) > 0)
Action:     Bypass cache
```

Najvažnije pravilo i najlakše se propusti. Next šalje
`Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding`,
a **Cloudflare na Free/Pro planu poštuje samo `Vary: Accept-Encoding`**. Bez ovoga
isti URL može da servira RSC flight payload umesto HTML-a i obrnuto — stranica se
raspadne, a u logu ne piše ništa.

**Pravilo 2 — `/api/search`, kratak keš**

```
Ime:        02 - api search
Expression: http.request.uri.path eq "/api/search"
Action:     Eligible for cache
  Edge TTL:    Respect origin   (ruta šalje s-maxage=60, SWR 300)
  Browser TTL: Respect origin
```

Izmereno **0,79 s** po pozivu, a autocomplete šalje zahtev po kucanju. Najveća
ušteda po requestu u celom setu.

**Pravilo 3 — ostatak `/api/` bez keša**

```
Ime:        03 - api bypass
Expression: starts_with(http.request.uri.path, "/api/")
Action:     Bypass cache
```

**Pravilo 4 — OG slike** *(najveći dobitak za CPU)*

```
Ime:        04 - og slike
Expression: ends_with(http.request.uri.path, "/opengraph-image")
Action:     Eligible for cache
  Edge TTL:    Override origin → 1 month  (2592000)
  Browser TTL: Override origin → 1 day
```

Origin šalje `max-age=0, must-revalidate` i troši **0,54 s CPU po pozivu** (2,26 s
prvi put). Slika je nepromenljiva unutar jednog APR preseka, pa je override
bezbedan. Bez ovoga svako deljenje linka u Viber grupi plaća pola sekunde CPU-a.

**Pravilo 5 — statika**

```
Ime:        05 - next static
Expression: starts_with(http.request.uri.path, "/_next/static/")
Action:     Eligible for cache
  Edge TTL: Respect origin   (immutable, 1 godina)
```

**Pravilo 6 — HTML stranice** *(poslednje)*

```
Ime:        06 - html
Expression: not starts_with(http.request.uri.path, "/api/")
Action:     Eligible for cache
  Edge TTL:    Respect origin    → 30 dana, origin šalje s-maxage=2592000
  Browser TTL: Override origin   → 5 minutes
```

Query string **ostavi u ključu** (default). Ne uključuj "Ignore query string":
[`app/blog/page.tsx:42-46`](../../app/blog/page.tsx) čita `?kategorija=` i `?strana=`, pa je `/blog` jedina
prava dinamička stranica i ignorisanje bi je pokvarilo.

Ovo pravilo je razlog zašto 31 GB ISR keša nije katastrofa: uz 30-dnevni edge TTL
origin vidi svaku stranicu firme otprilike jednom mesečno — 133.634 × 0,47 s
≈ 17 CPU-sati mesečno, tj. ~2,4% jednog jezgra u proseku.

### 4.3 Rate limit za `/api/ujp-proba`

Ruta ostaje (tvoja odluka), ali `maxDuration = 30` je Vercel koncept i posle
migracije **ne radi ništa**. Ruta pravi 4 odlazna `fetch`-a sa timeout-om od 12 s
([`app/api/ujp-proba/route.ts:39`](../../app/api/ujp-proba/route.ts)) — bez zaštite je besplatan alat za zauzimanje
tvojih konekcija.

```
Security → WAF → Rate limiting rules → Create
  Expression: http.request.uri.path eq "/api/ujp-proba"
  Rate:       5 requests / 1 minute, per IP
  Action:     Block, 10 minutes
```

---

## RUČNO — 5. Cutover

1. **Test na `novi.` poddomenu**, DNS-only (sivi oblak), dok se Coolify ne digne.
   Provere iz sekcije 6 dole.
2. Prebaci **Cache Rules i WAF na pravi hostname** (ili ih odmah piši za zonu).
3. Cloudflare → DNS → zapis `firme`:
   - promeni sa Vercel CNAME-a na **A → `<Hetzner IP>`**, proxy **On** (narandžasti)
   - promena je trenutna, jer Cloudflare drži javni zapis; nema TTL propagacije
4. **Vercel projekat i domen NE brisati.** Deployment ostaje živ, domen ostaje
   dodeljen (Vercel će prikazati "invalid configuration" — to je očekivano).
   Rollback = vrati DNS zapis na Vercel CNAME. Bez ponovnog build-a, u minutu.
5. Rollback prozor drži **najmanje 48 h**, po zahtevu iz [`MIGRATION-BRIEF.md`](MIGRATION-BRIEF.md).

### Šta ne dirati

- Eventualni `clerk` / `accounts` DNS zapis — Clerk se **ne koristi u ovom
  projektu** (potvrdio si), pa ako takav zapis postoji, pripada drugom projektu.
- Apex `biznisprice.com` — vodi na drugi hosting.

---

## 6. Provera posle cutover-a

```bash
SAJT=https://firme.biznisprice.com

# 1. HTML se kešira, a RSC ne krade njegov unos
curl -sI $SAJT/firma/nelt-co-doo-surcin-17304712 | grep -i 'cf-cache-status\|cache-control'
curl -sI $SAJT/firma/nelt-co-doo-surcin-17304712 | grep -i 'cf-cache-status'   # 2. put -> HIT
curl -sI -H 'RSC: 1' $SAJT/firma/nelt-co-doo-surcin-17304712 | grep -i 'cf-cache-status'  # -> BYPASS

# 2. OG slika se kešira uprkos max-age=0
curl -sI $SAJT/firma/nelt-co-doo-surcin-17304712/opengraph-image | grep -i 'cf-cache-status'

# 3. Redirecti su preživeli 1:1
curl -sI $SAJT/o-podacima/            | grep -i '^HTTP\|^location'   # 308 -> /o-podacima
curl -sI $SAJT/firma/pogresan-slug-17304712 | grep -i '^HTTP\|^location'  # 308 -> kanonski slug
curl -sI $SAJT/firma/ne-postoji-00000000    | grep -i '^HTTP'        # 404, nikad 200

# 4. SEO površina
curl -s $SAJT/robots.txt
curl -s $SAJT/sitemap.xml
curl -s $SAJT/sitemaps/firme-1.xml | grep -c '<url>'    # očekivano 45000
curl -s $SAJT/firma/nelt-co-doo-surcin-17304712 | grep -o '<link rel="canonical"[^>]*>'

# 5. Nijedan indeksiran URL ne sme da padne — presek celog sitemapa
curl -s $SAJT/sitemaps/firme-1.xml \
  | grep -o 'https://[^<]*' | shuf -n 200 \
  | xargs -P8 -I{} curl -s -o /dev/null -w '%{http_code} {}\n' {} \
  | grep -v '^200' || echo "svih 200 uzoraka vraća 200"
```

Uz to, u Google Search Console prati **Coverage** i **Crawl stats** sledećih 7 dana.
Skok 5xx-a ili pad "Indexed" broja je signal za rollback.

---

## 7. Ostaje otvoreno

1. **Supabase region** — jedina stvar koja blokira izbor Hetzner regiona (2.1).
2. **Vercel domeni i aliasi** — `vercel` CLI nije instaliran, pa se spisak mora
   prepisati ručno iz Vercel → Settings → Domains, pre cutover-a. Svaki
   `*.vercel.app` alias treba svesno ugasiti ili preneti.
3. **Trajanje NBS koraka** — `timeout-minutes` je podignut na 120 "na slepo", jer
   se korak do sada nikad nije izvršio. Posle prvog pravog prolaza podesi po meri.
4. **ISR keš i deploy koda** — keš se briše pri svakoj promeni `BUILD_ID`, namerno
   (RSC payload-i referišu chunk hash-eve svog build-a). Ako se ispostavi da su
   deploy-evi česti, sledeći korak je `cacheHandler` sa Redis-om, čime keš
   preživljava i promenu koda. Ne radi se unapred.
