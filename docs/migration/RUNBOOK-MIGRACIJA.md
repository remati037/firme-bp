# Selidba sa Vercela na Hetzner + Coolify — kako je izvedena

Migracija je završena **27.08.2026.** Ovaj fajl je zapis o zatečenom stanju:
šta je konfigurisano, koje su zamke iskrsle i šta još treba uraditi.

Nalazi iz koda su u `PROJECT-AUDIT.md` (drži se lokalno, nije u gitu).
Uputstvo klik-po-klik: https://claude.ai/code/artifact/e1d35e38-d1c6-4fd0-a7ef-981d90fef3d1

---

## Zatečeno stanje

| sloj | šta |
|---|---|
| Server | Hetzner CX32, Nemačka, `46.225.21.29` |
| Orkestracija | Coolify Cloud, povezuje se **kao root** preko sopstvenog ključa |
| Image | `ghcr.io/remati037/firme-bp:latest`, **privatan** paket |
| Build | GitHub Actions, `build-image.yml`, na svaki push na `main` |
| CDN | Cloudflare, narandžasti oblak, SSL **Full (strict)** |
| Sertifikat na serveru | Let's Encrypt, Coolify ga vadi i obnavlja sam |
| Baza | Supabase, nedirnuta |

### Izmerene brojke posle selidbe

```
50 nasumičnih stranica firmi iz sitemapa  ->  50 × 200
medijana                                  ->  0,49 s
najsporija                                ->  0,75 s
ISR keš po stranici firme                 ->  ~239 KB
build                                     ->  41 s, peak RSS 1,11 GB, 795 stranica
```

---

## Zamke koje su nas koštale vremena

Ovo su greške koje su otkrivene tek u izvođenju. Zapisane su da se ne ponove
pri sledećem serveru ili sledećem projektu.

### 1. GitHub secrets nisu bili na nivou repoa

Ključevi su živeli u okruženju `Production` (napravila ga Vercel integracija),
a workflow ih nije video. Ispravka: `environment: Production` na job-u.

**Dug:** pre gašenja Vercela preseliti ključeve na nivo repoa i obrisati tu
liniju — inače CI zavisi od platforme koju napuštamo.

### 2. `PermitRootLogin no` blokira Coolify

Coolify se povezuje **kao root**. Ispravno je `prohibit-password`: root sme
ključem, nikad lozinkom.

### 3. `--disabled-password` + `sudo` grupa se poništavaju

Nalog bez lozinke ne može `sudo`, jer ga sudo traži. Bez
`/etc/sudoers.d/90-deploy` sa `NOPASSWD` nalog `deploy` je beskoristan.

### 4. Ubuntu 24.04 čita `sshd_config.d/` PRE glavnog fajla

`sed` nad `/etc/ssh/sshd_config` ne radi ništa ako isto podešavanje postoji u
`sshd_config.d/`. Piše se sopstvena datoteka koja po imenu dolazi prva:
`00-hardening.conf`.

### 5. Firewall pre sertifikata zaključava sve

Port 22 mora ostati otvoren **zbog Coolify-ja** (povezuje se sa svoje
infrastrukture, ne sa tvoje kućne adrese, koja je uz to i dinamička).
Portovi 80 i 443 moraju biti otvoreni dok se ne završi cutover, jer Let's
Encrypt proverom dolazi direktno na server, ne kroz Cloudflare.

Simptom kad je ovo pogrešno: Cloudflare vraća **522**, port 22 radi, a
`docker ps` pokazuje da je sve zdravo.

### 6. Domen mora u Coolify PRE nego što se DNS prebaci

Bez toga Traefik nema rutu za taj host: port 80 vraća 404, a 443 servira
`TRAEFIK DEFAULT CERT`. Posle dodavanja domena obavezan je **Redeploy** —
samo Save ne regeneriše Traefik oznake.

### 7. Cloudflare Origin sertifikat nije potreban

Let's Encrypt radi i iza Cloudflare-a: proxy namerno ne preusmerava
`/.well-known/acme-challenge/`, čak ni uz „Always Use HTTPS".

### 8. Cache Rules: POSLEDNJE pravilo pobeđuje

Najskuplja greška. Za razliku od starih Page Rules, primenjuju se sva pravila
koja se poklope i **poslednje gazi prethodna**. Prvobitni redosled (specifično
→ opšte) je značio da pravilo „html" gazi sve ostalo:

| adresa | ishod pre ispravke |
|---|---|
| OG slika | `EXPIRED` umesto 30-dnevnog keša |
| `/api/search` | uopšte nije keširan |
| RSC zahtev | **`HIT` umesto `BYPASS`** — tihi kvar bez traga u logovima |

Ispravan redosled je od najopštijeg ka najspecifičnijem, `bypass RSC`
poslednji. Vidi `cloudflare-podesi.sh`.

---

## Konfiguracija na serveru

```bash
# /etc/ssh/sshd_config.d/00-hardening.conf
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no

# /etc/sudoers.d/90-deploy
deploy ALL=(ALL) NOPASSWD:ALL
```

Hetzner Cloud Firewall, inbound:

| port | izvor | napomena |
|---|---|---|
| 22 | `0.0.0.0/0`, `::/0` | Coolify se povezuje sa svoje infrastrukture |
| 80 | `0.0.0.0/0`, `::/0` | suziti na Cloudflare opsege posle 48 h |
| 443 | `0.0.0.0/0`, `::/0` | isto |

Coolify, aplikacija:

| stavka | vrednost |
|---|---|
| Image | `ghcr.io/remati037/firme-bp:latest` |
| Port | `3000` |
| Domains | `https://novi.firme.biznisprice.com,https://firme.biznisprice.com` |
| Persistent storage | `/app/.next/server/app` (ISR keš, raste do ~31 GB) |
| Runtime env | `NODE_ENV`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` |

---

## Cloudflare

Podešava se skriptom `cloudflare-podesi.sh` — meniji su se promenili u avgustu
2026, API nije. Bez `--potvrdi` je suvi prolaz.

```bash
export CF_API_TOKEN=<Zone Settings:Edit + Cache Rules:Edit + Cache Purge:Purge>
export CF_ZONE_ID=<Zone ID>
./docs/migration/cloudflare-podesi.sh --potvrdi
```

Ostaje ručno, jer nije u istom API-ju:

| stavka | vrednost | zašto |
|---|---|---|
| Bot Fight Mode | **Off** | `app/robots.ts` namerno pušta GPTBot, ClaudeBot, PerplexityBot |
| Block AI Scrapers | **Off** | isto |
| Tiered Cache | On | manje origin miss-eva |
| Rate limit `/api/ujp-proba` | 5/min po IP | `maxDuration` je bio Vercel koncept i više ne važi |

Provereno posle primene:

```
html          HIT, max-age=300 u pregledaču, 30 dana na ivici
statika       HIT, immutable
api search    MISS -> HIT -> HIT
og slike      HIT, age raste
api ostalo    ne kešira se
RSC           ne kešira se (i po zaglavlju i po ?_rsc=)
apex          nedirnut
```

---

## Rad posle selidbe

| radnja | kako sada |
|---|---|
| Objava izmene koda | push na `main` → Actions gradi image → Coolify ga preuzme |
| Nov APR presek | ingest → Cloudflare purge hub stranica; **bez rebuild-a** |
| Logovi | Coolify → aplikacija → Logs |
| Izmena env varijable | Coolify → Environment Variables → **Restart** |

Mesečni presek namerno ne pravi rebuild: stranice imaju `revalidate` od 30 dana
i `stale-while-revalidate`, pa se osvežavaju same. Rebuild bi obrisao ceo ISR
keš i naterao 133.634 stranice da se regenerišu istovremeno.

---

## Šta još treba

1. **Posle 48 h bez problema u Search Console:** suziti portove 80 i 443 na
   Cloudflare opsege; obrisati `VERCEL_DEPLOY_HOOK`, `NBS_USERNAME`,
   `NBS_PASSWORD` iz GitHub secrets; ugasiti Vercel projekat.
2. **Pre gašenja Vercela:** preseliti pet ključeva iz okruženja `Production` na
   nivo repoa i obrisati `environment: Production` iz oba workflow-a.
3. **Pratiti nedelju dana:** Search Console → Indeksiranje stranica i Statistika
   obilaska. Pad indeksiranih ili skok 5xx je signal za povratak — a povratak je
   vraćanje jednog DNS zapisa na Vercel, bez ijednog build-a.
4. **5. septembra:** prvi mesečni ingest po novom režimu. Proveriti da purge
   hub stranica radi i koliko traje NBS korak (`timeout-minutes: 120` je
   postavljen naslepo, jer se korak do sada nikad nije izvršio).
5. **Ako deploy-evi postanu česti:** ISR keš se briše pri svakoj promeni
   `BUILD_ID`, namerno (RSC payload-i referišu chunk hash-eve svog build-a).
   Sledeći korak bi bio `cacheHandler` sa Redis-om, čime keš preživljava i
   promenu koda. Ne radi se unapred.
