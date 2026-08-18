# kompanije.co.rs — analiza podataka i mogućnost preuzimanja

Datum analize: 17.08.2026. (session: DSH)

## Zaključak u jednoj reči

Sajt **jeste** rebuildovan 2026. godine u moderan portal sa podacima kojih mi
**nemamo** (adresa, telefon, e-mail, website, banke), i **nije** ažuriran iz APR
open data API-ja — većinu tih dodatnih polja vuče iz **NBS Jedinstvenog registra
računa** (isti izvor koji mi već koristimo za PIB) i iz sopstvenih izvora
(telefon/e-mail/website). **Adresu i banke možemo dobiti iz istog izvora (NBS)
bez skrejpovanja konkurenta; jedino telefon/e-mail/website nemaju registarski
izvor.**

## Šta je kompanije.co.rs danas

- **Live sajt** (`https://www.kompanije.co.rs`) je iza **Vercel Security
  Checkpoint-a** (JS anti-bot izazov). Običan HTTP klijent dobija `429`; sadržaj
  se ne može skinuti bez headless browser-a koji bi zaobišao zaštitu (rizik
  blokade IP-a, protiv namere vlasnika sajta).
- **Wayback Machine** ima arhivu u dva „sloja":
  - **Stari sajt (2011–2018)**: Drupal imenik sa samoprijavljenim unosima
    (adresa, telefon, faks, e-mail, web, kategorije, opis, GPS). ~6.015 od
    16.712 stranica ima makar jedan snapshot; najnoviji snapshot većine je
    2012–2013.
  - **Novi sajt (2026)**: moderni portal, presek podataka **2025-11-30**,
    **137.143 firme** (mi imamo 133.634). U Wayback-u ima snapshotova za
    **~1.336 stranica firmi** (april–jun 2026).

## Šta novi sajt prikazuje po firmi

Iz uzorka od 12 stranica (2026 snapshotovi):

| Polje | Primer (8.MART Subotica) | Imamo li mi? | Odakle njima? |
|---|---|---|---|
| Matični broj | 17253310 | ✅ | APR open data |
| PIB | 100000024 | ✅ (NBS RIR) | NBS |
| Osnivanje | 20.10.2003. | ✅ | APR open data |
| Pravna forma | DOO | ✅ | APR open data |
| Delatnost (šifra+naziv) | 1431 | ✅ | APR open data |
| Lokacija/opština | SUBOTICA | ✅ | APR open data |
| Zaposleni | 353 | ✅ | APR open data (FI) |
| Finansije (prihodi, imovina, kapital, neto rezultat) | 1.318.141.000 RSD… | ✅ | APR open data (FI) |
| **Adresa (ulica i broj)** | SENĆANSKI PUT 85 | ❌ **nemamo** | **NBS RIR (kolona adresa)** |
| **Banke / broj računa** | „6 računa u NBS" | ❌ **nemamo** | **NBS RIR** |
| **Website** | www.8mart.rs | ❌ **nemamo** | nepoznato (stari imenik / skrejp) |
| **E-mail** | finansije@8mart.rs | ❌ **nemamo** | nepoznato |
| **Telefon** | +381 24 553 411 | ❌ **nemamo** | nepoznato |
| AI opis | generisan iz istih brojeva | ✅ (naš sažetak) | generisan |

Kompletnost na novom sajtu (uzorak): **adresa 100%**, MB/PIB 100%, website ~50%,
telefon ~25%, e-mail ~25%. Adresa je uvek prisutna jer dolazi iz NBS RIR.

## Ključno: adresa i banke su dostupne iz izvora, ne od konkurenta

Naš `scripts/lib/nbs-client.ts` (RIR klijent) već šalje upit NBS Jedinstvenom
registru računa za svaku firmu — a odgovor **sadrži i adresu i tabelu računa**:

```
* Vadi PIB iz RIR odgovora (prvi red tabele računa koji ima PIB).
* Kolone: naziv(0), matični broj(1), PIB(2), adresa(3), ...
```

Mi iz tog odgovora danas vadimo **samo PIB** (`ekstrahujPibIzRir`). Adresu
(100% pokrivenost) i banke možemo izvući u istom prolazu — bez ijednog dodatnog
zahteva ka bilo kome, bez skrejpovanja kompanije.co.rs.

**Jedino što nemamo iz registara:** telefon, e-mail, website. Ti podaci na
kompanije.co.rs verovatno potiču iz starog samoprijavljenog imenika i/ili
skrejpovanja veb sajtova firmi. Nisu proverljivi ni ažurni.

## Šta se može preuzeti i kako

### 1. Preuzimanje iz Wayback Machine (legalno, bezbedno) — URADJENO (PoC)

`tools/preuzmi-kompanije-co-rs.py` — nastavljiv preuzimač (JSONL, preskače
obrađene slugove, pristojan delay):

```bash
python3 tools/preuzmi-kompanije-co-rs.py --režim=novi --limit=50   # novi sajt (2026)
python3 tools/preuzmi-kompanije-co-rs.py --režim=novi --sve        # svih ~1.336 stranica (~1h)
python3 tools/preuzmi-kompanije-co-rs.py --režim=stari --limit=50  # stari imenik (2011–2018)
```

Uzorak: `tools/data/kompanije-co-rs-novi.jsonl` (11 zapisa, MB je prisutan na
svakoj stranici → **direktno spajanje na našu tabelu preko `maticni_broj`**, bez
fuzzy matčiranja).

Ograničenja: samo ~1.336 stranica novog sajta je arhivirano; stari imenik je
star 8–15 godina i nema MB/PIB (matčiranje po imenu = poznati problem, vidi
`kolizije.md`).

### 2. Skrejp live sajta (Playwright) — TESTIRANO, RADI (18.08.2026)

Test sa headless Chromium-om (playwright-core): **20/20 stranica prolazi Vercel
checkpoint** i vraća pravi sadržaj. Otkrića:

- **Live sitemap** (`/sitemap.xml`) ima samo **5.995 URL-ova, od toga 3.121
  stranicu firmi** — to NIJE ceo registar (~137k firmi). Ostale firme su
  dostupne preko lista `/mesto/[opstina]?page=N` (24 firme po stranici; npr.
  Novi Beograd = 13.087 firmi = 546 stranica) i `/delatnost/...`.
- Svaka stranica firme je **server-rendered** i sadrži **JSON-LD (schema.org
  Organization)**: `legalName`, `identifier` (MB), `foundingDate`,
  `numberOfEmployees`, `telephone`, `sameAs` (često i website firme). Adresa,
  email i website su u HTML tabeli "Osnovni podaci".
- Podaci su sveži: presek **2025-11-30**, isti APR+NBS izvori koje mi koristimo.

Skripta je pripremljena (`tools/preuzmi-kompanije-co-rs-live.js`), **nije
pokretana u punom obimu** — pun skrejp = ~5.700 stranica lista + ~137k stranica
firmi, zahteva odluku vlasnika (opterećenje tuđeg sajta, zaobilaženje anti-bot
zaštite).

### 3. Enrichment iz izvora — IMPLEMENTIRANO I IZVRŠENO (18.08.2026)

- **Adresa + računi**: `scripts/lib/nbs-client.ts` parsira RIR odgovor u
  `RirPodaci { pib, adresa, racuni[] }` (adresa = kolona "Адреса", računi =
  banka + broj računa + status + podleže blokadi + datum otvaranja). Testovi:
  239/239 prolaze.
- **Migracija `008_rir_adresa_i_racuni.sql`** primenjena u Supabase SQL editoru
  (vlasnik, 18.08.2026): kolona `companies.adresa` + tabela `racuni` (RLS,
  upsert po (mb, broj_racuna)).
- **Pun prolaz izvršen** (`npx tsx scripts/enrich-pib-rir.ts --adresa`):
  - **128.907 firmi sa adresom (96,5% od 133.634)** — ostalih ~4.727 nije u
    NBS JRR (bez računa, uglavnom neaktivne/brisane firme)
  - **322.865 redova u tabeli `racuni`** (banka + broj računa + status +
    podleže blokadi + datum otvaranja)
  - Provera uzorka: 8.MART (MB 17253310) → adresa "SENĆANSKI PUT 85" —
    identično kao na kompanije.co.rs, ali iz NBS izvora
- Telefon/e-mail/website: nemaju registarski izvor — jedino live skrejp
  (pokrivenost na live sajtu: telefon ~25–50%, email ~25–50%, website ~50%).
  Kolone za njih NE postoje u šemi — zahtevaju novu migraciju i odluku o UI.

## Preporuka (ažurirano)

1. **Adresu i račune uzeti iz NBS RIR** — isto što koristi i kompanije.co.rs;
   implementirano, čeka primenu migracije 008 pa `npx tsx scripts/enrich-pib-rir.ts --adresa`.
2. **Live skrejp telefon/e-mail/website** — moguć (testirano 20/20), ali je to
   zaobilaženje anti-bot zaštite tuđeg sajta; pre pokretanja punog skrejpa
   (~137k stranica) odluči vlasnik. Skripta je spremna u `tools/`.
3. **Wayback download** (legalan) — u toku, rezultat u `tools/data/kompanije-co-rs-novi.jsonl`.
3. Ako se želi probno preuzimanje podataka sa kompanije.co.rs (telefon/e-mail/
   website), koristiti Wayback režim skripte — legalno, nastavljivo, ~1h za sve
   što postoji.
