# AUDIT TASK — recon pred migraciju sa Vercela

Ovo je zadatak za Claude Code. Kontekst je u `docs/migration/MIGRATION-BRIEF.md`.

## Pravila izvršenja

- **Read-only nad kodom.** Ne menjaj nijedan fajl projekta. Jedini fajl koji kreiraš
  je `docs/migration/PROJECT-AUDIT.md`.
- Ne commit-uj i ne push-uj ništa.
- **Nikada ne ispisuj vrednosti secrets-a.** Ako naiđeš na `.env*` fajl, izlistaj
  samo imena ključeva (`cut -d= -f1`), nikad vrednosti.
- Svaki nalaz vezuj za putanju fajla i broj linije.
- Gde ne možeš da utvrdiš iz koda, piši `NEPOZNATO — treba proveriti u <gde>`.

## Koraci

### 1. Osnovni inventar

```bash
cat package.json
ls -la | grep -E '\.nvmrc|\.node-version|Dockerfile|vercel.json|\.dockerignore'
cat next.config.* 2>/dev/null
cat vercel.json 2>/dev/null
ls -la .env* 2>/dev/null
git log --oneline -10
```

Utvrdi: package manager (lockfile), Node verziju (`engines`, `.nvmrc`), build/start
skripte, da li postoji `Dockerfile` i `output: 'standalone'`.

### 2. Sigurnosna provera (repo je public)

```bash
git ls-files | grep -E '^\.env' || echo "OK - nema .env u gitu"
git log --all --diff-filter=A --name-only --pretty=format: | grep -E '\.env' | sort -u
```

Ako je ikada bio commit-ovan `.env`, prijavi to kao **CRITICAL** — ključevi moraju da
se rotiraju pre migracije.

### 3. Rendering i cache strategija

```bash
rg -n "generateStaticParams" --glob '!node_modules'
rg -n "export const (revalidate|dynamic|dynamicParams|fetchCache|runtime)" --glob '!node_modules'
rg -n "revalidatePath|revalidateTag|unstable_cache|'use cache'|cacheLife|cacheTag" --glob '!node_modules'
rg -n "after\(" app/ --glob '!node_modules'
```

Za svaku dinamičku rutu (`app/**/[*]/page.tsx`) napiši u tabelu: ruta, način
renderovanja, `revalidate` vrednost, da li `generateStaticParams` vraća sve zapise
ili podskup (pogledaj da li ima `.limit()` ili slično u upitu).

### 4. Merenje build-a

Ovo je najbitniji broj u celom auditu. Pokreni čist production build i izmeri:

```bash
rm -rf .next
/usr/bin/time -v <pm> run build 2>&1 | tee /tmp/build.log | tail -40
du -sh .next
du -sh .next/server/app 2>/dev/null
du -sh .next/cache 2>/dev/null
find .next/server/app -name '*.html' | wc -l
```

Iz `/tmp/build.log` izvuci: ukupno trajanje, peak RSS (`Maximum resident set size`),
i Next-ov summary sa brojem static/dynamic ruta. Ako build ne prolazi bez env
varijabli, zabeleži koje su potrebne u build-time i **prekini** — javi to kao blocker,
nemoj da tražiš od korisnika da ti da vrednosti u chat.

### 5. next.config — sve što mora da se prenese

Izlistaj doslovno, kao code block: `redirects()`, `rewrites()`, `headers()`,
`images` (posebno `remotePatterns`, `formats`, `deviceSizes`), `output`,
`serverExternalPackages`, `experimental`, `poweredByHeader`, `trailingSlash`.

Za svaki `redirect` navedi `permanent: true/false` — trajni redirecti su SEO signal
i moraju da prežive migraciju identično.

### 6. Middleware

```bash
cat middleware.ts 2>/dev/null || cat src/middleware.ts 2>/dev/null
```

Napiši: `matcher` pattern, da li koristi `clerkMiddleware`, koje rute štiti, i da li
radi bilo kakav rad po requestu koji je na Vercelu išao na Edge runtime (geo, bot
detekcija, A/B). Sve to sada ide u Node runtime na jednom serveru — označi ako je
CPU-intenzivno.

### 7. Env varijable

```bash
rg -o "process\.env\.[A-Z0-9_]+" --no-filename --glob '!node_modules' | sort -u
rg -o "process\.env\[['\"][A-Z0-9_]+" --no-filename --glob '!node_modules' | sort -u
```

Napravi tabelu: ime | server ili `NEXT_PUBLIC_` | gde se koristi | potrebna u
build-time ili samo runtime. Kolona build-time je kritična — `NEXT_PUBLIC_*` se
inline-uje u bundle i mora da postoji kao build arg u Dockeru.

### 8. Vercel coupling

```bash
rg -n "@vercel/" package.json
rg -n "runtime\s*=\s*['\"]edge['\"]" --glob '!node_modules'
rg -n "VERCEL_|vercel\.app" --glob '!node_modules' --glob '!*.lock'
rg -n "SpeedInsights|@vercel/analytics" --glob '!node_modules'
```

Za svaki nalaz predloži konkretnu zamenu (npr. `VERCEL_URL` → sopstvena
`NEXT_PUBLIC_SITE_URL`), ali **ne menjaj kod** — samo popiši.

### 9. Cron i scheduled poslovi

```bash
cat vercel.json 2>/dev/null | rg -A20 "crons"
ls -la .github/workflows/ 2>/dev/null && cat .github/workflows/*.yml
rg -n "CRON_SECRET|x-vercel-cron|authorization" app/api --glob '!node_modules'
find app/api -type d | sort
```

Za svaki cron: putanja route handler-a, raspored, šta radi (pročitaj fajl), procena
trajanja i memorije, i da li na kraju invalidira cache. Ako import APR podataka
postoji u repou, opiši ceo pipeline: odakle uzima fajl, kako upisuje u Supabase,
koliko redova.

### 10. Slike

```bash
rg -n "from ['\"]next/image['\"]" --glob '!node_modules' -l | wc -l
rg -n "next/image" --glob '!node_modules' -l | head -20
rg -n "sharp" package.json
rg -A15 "images:" next.config.*
```

Utvrdi da li uopšte ima remote slika ili je sajt praktično bez slika (u tom slučaju
image optimization nije tema migracije).

### 11. Supabase i Clerk integracija

```bash
rg -n "createClient|createServerClient|createBrowserClient" --glob '!node_modules' -l
rg -n "SERVICE_ROLE" --glob '!node_modules' -l
rg -n "pooler|6543|5432|pgbouncer" --glob '!node_modules'
rg -n "@clerk/" package.json
rg -n "clerk" app/api --glob '!node_modules' -l
```

Napiši: koji Supabase klijent, da li se koristi service role i gde, connection mode
(pooler vs direct), postoji li Clerk webhook endpoint i koji secret koristi.

### 12. Sitemap i robots

```bash
find app -name 'sitemap*' -o -name 'robots*' | head
rg -n "generateSitemaps|MetadataRoute" --glob '!node_modules'
```

Koliko URL-ova ukupno, da li je split na više fajlova, i koliko sitemap generacija
traje (ako je route handler, oceni po upitu koji izvršava).

### 13. Vercel CLI (samo ako je već ulogovan)

```bash
vercel whoami 2>/dev/null && {
  vercel project ls
  vercel domains ls
  vercel env ls production
}
```

`vercel env ls` prikazuje **samo imena** — to je ono što nam treba. Ne pokreći
`vercel env pull` u ovom koraku i ne ispisuj vrednosti. Ako CLI nije ulogovan,
preskoči i zabeleži da ovo mora ručno.

## Izlaz

Kreiraj `docs/migration/PROJECT-AUDIT.md` sa ovom strukturom:

```markdown
# PROJECT AUDIT — <datum>, commit <sha>

## 0. Executive summary
5–10 linija: najveći rizik migracije, najveći nepoznat faktor, i da li build
uopšte prolazi lokalno.

## 1. Build profil
| metrika | vrednost |
|---|---|
| trajanje build-a | |
| peak RSS | |
| veličina `.next` | |
| broj prerenderovanih stranica | |
| package manager / Node | |
| `output: 'standalone'` | da/ne |

## 2. Rute i rendering
| ruta | tip | revalidate | generateStaticParams | napomena |

## 3. next.config — redirects / rewrites / headers
(doslovno, code block)

## 4. Middleware

## 5. Env varijable
| ime | scope | build-time | gde se koristi |

## 6. Vercel coupling i predložene zamene

## 7. Cron / scheduled poslovi

## 8. Slike

## 9. Supabase / Clerk

## 10. Sitemap / robots

## 11. Sigurnosni nalazi (public repo)

## 12. Blockeri i otvorena pitanja
Numerisano, sa tačnim mestom gde se odgovor nalazi (Vercel dashboard, Cloudflare,
Supabase settings).
```

Kada završiš, ispiši u chat samo sekciju **0** i sekciju **12**. Ostalo ostaje u fajlu.
