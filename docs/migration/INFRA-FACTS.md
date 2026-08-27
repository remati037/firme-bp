# INFRA FACTS — popunjava vlasnik ručno

Ovo Claude Code ne može da vidi iz koda. Popuni pre nego što se generiše
`MIGRATION.md`. Ostavi `?` gde ne znaš — bolje prazno nego pogrešno.

## A. Saobraćaj

Izvor: Cloudflare → Analytics & Logs → Traffic (30 dana), ili Vercel → Analytics.

| metrika | vrednost |
|---|---|
| pageviews / 30 dana | |
| unique visitors / 30 dana | |
| peak requests / min (najgori sat) | |
| bandwidth / 30 dana | |
| % saobraćaja iz Srbije | |
| botovi (Googlebot) kao % requestova | |

## B. Vercel — trenutna potrošnja

Izvor: Vercel → Settings → Usage (billing cycle).

| metrika | vrednost |
|---|---|
| Function invocations / mes | |
| Function duration (GB-hrs) | |
| ISR reads / writes | |
| Edge requests | |
| Build minutes / mes | |
| trajanje poslednjeg production build-a | |
| Node verzija u Build & Development Settings | |
| Install / Build / Output override komande | |
| Root directory | |
| Deployment Protection uključen? | da/ne |

## C. Vercel — cron jobs

Izvor: Vercel → Project → Settings → Cron Jobs.

| putanja | raspored | poslednje izvršenje | trajanje |
|---|---|---|---|

## D. Vercel — domeni

Izvor: Vercel → Project → Settings → Domains. Prepiši sve, uključujući
`*.vercel.app` i sve aliase.
firme.biznisprice.com
firme-bp.vercel.app


## E. Cloudflare

Izvor: Cloudflare dashboard.

| stavka | vrednost |
|---|---|
| domen `biznisprice.com` na CF nameserverima? | da |
| SSL/TLS encryption mode | Full |
| Always Use HTTPS | on/off |
| Automatic HTTPS Rewrites | on |
| aktivni Page Rules / Redirect Rules | |
| Bot Fight Mode | off |
| Cache rules koje postoje | |
| WAF custom rules | |

### DNS zapisi (prepiši sve za zonu)

| name | type | content | proxy | TTL |
|---|---|---|---|---|
| firme | | | | |
| @ (apex) | | | | |
| clerk / accounts | | | | |

Posebno označi: **da li apex `biznisprice.com` pokazuje na nešto drugo** (WordPress,
drugi hosting) — to se ne dira.

## F. Supabase

Izvor: Supabase → Project Settings → General / Database.

| stavka | vrednost |
|---|---|
| region | npr. `eu-central-1` |
| plan | Free / Pro / Team |
| veličina baze | |
| broj redova u glavnoj tabeli firmi | |
| connection mode koji app koristi | pooler `:6543` / direct `:5432` |
| max connections / pool size | |
| RLS uključen na tabelama koje app čita | da/ne |

## H. Operativno

| stavka | vrednost |
|---|---|
| lokalni OS | macOS |
| postojeći SSH ključ (`ls ~/.ssh/*.pub`) | |
| Hetzner nalog otvoren? | da |
| Coolify Cloud nalog otvoren? | ne |
| ko još ima pristup deploy-u osim tebe | vladimirst95@gmail.com |
| prihvatljiv prozor za cutover (dan/sat) | 1 sat |
| mesečni budžet za server | |
