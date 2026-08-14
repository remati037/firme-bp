# CLAUDE.md

Kontekst projekta za Claude Code i Cursor. Pročitaj ovo pre svake sesije.

---

## Šta gradimo

Besplatan alat za proveru srpskih firmi na `firme.biznisprice.com`.
Deo brenda **Biznis priče** (podkast, biznisprice.com).

Cilj proizvoda: programatski SEO. 133.634 stranice firmi plus kategorijske stranice.
Svaka stranica odgovara na pitanje "šta znam o ovoj firmi pre nego što poslujem sa njom".

Cilj biznisa: organski saobraćaj koji hrani Biznis priče brend, email listu i budući biznis portal.
Ovo NIJE SaaS, nema pretplate, nema naplate u v1.

**Jezik proizvoda: srpski, latinica.** Sav UI tekst, sav AI izlaz, svi meta tagovi na srpskom.

**Obavezno uz ovaj fajl: [`SEO.md`](SEO.md).** Tehnička SEO specifikacija, sve u njoj je
obavezno. Gde se razilazi sa ovim fajlom, **SEO.md je noviji i ima prednost** — takva
mesta su niže označena. Pročitaj oba pre svake sesije koja dira rute, meta tagove,
interno linkovanje ili šemu.

---

## Tehnički stek, ne menjaj bez dogovora

- Next.js 16, App Router, TypeScript, strict mode
  (plan je pisan za Next 15; podignuto na 16 dogovorom 14.08.2026, jer su
  3 high severity ranjivosti u postcss i sharp ispravljene tek u Next 16)
- Tailwind CSS + shadcn/ui
- Supabase (Postgres) preko `@supabase/supabase-js`
- Vercel hosting, ISR
- Pretraga: Postgres `pg_trgm`, NE uvoditi Algoliju, Typesense ni Elasticsearch
- AI: Claude API, najjeftiniji dostupan model, isključivo za tekstualni sažetak
- Cron: GitHub Actions

---

## Izvori podataka

### APR open data (besplatno, Srpska licenca za otvorene podatke, komercijalna upotreba dozvoljena)

```
https://openapi.apr.gov.rs/api/opendata/companies
https://openapi.apr.gov.rs/api/opendata/companies/financial-statements
https://openapi.apr.gov.rs/api/opendata/ngo
```

Format odgovora:
```json
{ "DatumPreseka": "2026-07-31", "Podaci": { "<maticniBroj>": { ...polja } } }
```

**Napomena o TLS-u:** server ne šalje intermediate sertifikat. Standardni Node klijent puca
sa "unable to get local issuer certificate". Rešenje: dodati Sectigo intermediate u CA lanac.
Ako se koristi `rejectUnauthorized: false`, mora imati komentar zašto.

**companies polja:** ključ je matični broj. `PoslovnoIme`, `SifraOpstine`, `NazivOpstine` (ćirilica),
`NazivStatus`, `DatumOsnivanja`, `NazivPravneForme`, `SifraDelatnosti`.

**financial-statements polja:** `GodinaFi`, `PoslovnoIme`, `SifraOpstine`, `NazivOpstine`,
`PoslovnaImovina`, `Kapital`, `Gubitak`, `UkupniPrihodi`, `NetoDobitak`, `NetoGubitak`,
`ProsecanBrojZaposlenih`. **Sve novčane vrednosti su u hiljadama dinara.**

**Poznata ograničenja:**
- Nema PIB-a. Mapiranje matičnog broja na PIB dolazi iz NBS registra imalaca računa (besplatan veb servis).
- Nema preduzetnika, samo privredna društva.
- Nema vlasnika, zastupnika ni blokada.
- Samo poslednja godina, bez istorije. Zato arhiviramo snapshotove.

### Obavezno na svakoj stranici

Futer mora da sadrži tačno:
`Izvor podataka: Agencija za privredne registre. Presek podataka: {DatumPreseka}.`
Plus disclaimer da podaci nisu bonitetna ocena i ne predstavljaju savet.

---

## Šema baze je ZAKLJUČANA

Ne menjaj šemu, ne dodaj kolone, ne piši migracije bez eksplicitnog odobrenja u promptu.
Ako ti treba novo polje, prvo pitaj.

```
companies
  maticni_broj        text primary key
  slug                text unique not null
  poslovno_ime        text not null
  poslovno_ime_norm   text not null        -- za pretragu, bez interpunkcije, lowercase
  sifra_opstine       text
  opstina             text                 -- normalizovano na latinicu
  status              text
  status_aktivan      boolean
  datum_osnivanja     date
  pravna_forma        text
  sifra_delatnosti    text
  pib                 text                 -- popunjava se iz NBS, može biti null
  created_at          timestamptz
  updated_at          timestamptz

financials                                  -- poslednje stanje
  maticni_broj        text references companies
  godina              int
  poslovna_imovina    bigint
  kapital             bigint
  gubitak             bigint
  ukupni_prihodi      bigint
  neto_dobitak        bigint
  neto_gubitak        bigint
  prosecan_broj_zaposlenih int
  primary key (maticni_broj, godina)

financials_history                          -- svaki mesečni presek, arhiva se ne briše
                                            -- jedini izuzetak: ingest briše redove za
                                            -- datum_preseka koji upravo upisuje, jer se
                                            -- red u snapshots piše poslednji, pa bi prekid
                                            -- u pola upisa doveo do udvajanja. Nikad ne
                                            -- diraj preseke koji nisu tekući.
  id                  bigserial primary key
  maticni_broj        text
  datum_preseka       date
  godina              int
  ... ista polja kao financials

nace_codes
  sifra               text primary key
  naziv               text
  sektor              text

municipalities
  sifra               text primary key
  naziv_lat           text
  naziv_cir           text
  okrug               text

ai_summaries
  maticni_broj        text primary key
  datum_preseka       date
  summary             text
  model               text
  generated_at        timestamptz

snapshots
  datum_preseka       date primary key
  storage_path        text
  broj_firmi          int
  broj_fi             int
  created_at          timestamptz
```

Materijalizovani view-ovi (osvežavaju se posle svakog ingesta):
- `mv_delatnost_stats` : po šifri delatnosti, medijan prihoda, medijan marže, broj firmi, medijan prihoda po zaposlenom
- `mv_opstina_stats` : isto po opštini
- `mv_company_ranks` : rang firme unutar delatnosti i unutar opštine po prihodu

---

## Normalizacija, pravila

1. **Ćirilica u latinicu** za nazive opština. Koristi eksplicitnu mapu, ne biblioteku koja gađa.
2. **Slug** = `slugify(poslovno_ime) + "-" + maticni_broj`. Uvek jedinstven jer sadrži MB.
   Slugify: lowercase, srpska slova u ASCII (č→c, ć→c, š→s, ž→z, đ→dj), sve nealfanumeričko u crticu,
   višestruke crtice u jednu, maksimum 80 karaktera pre matičnog broja.
3. **Poslovno ime za prikaz** ostaje originalno. Za pretragu se koristi `poslovno_ime_norm`.
4. **Novčane vrednosti su u hiljadama dinara.** U UI se prikazuju kao dinari, dakle množe se sa 1000.
   Formatiranje: `Intl.NumberFormat('sr-RS')`, bez decimala, sa oznakom RSD.
5. **Nula vrednosti** znače da firma nije predala izveštaj ili je neaktivna. Ne prikazuj ih kao "0 RSD",
   prikaži "Nema podataka".
6. **Upsert, nikad delete pa insert.** Istorija se čuva. Jedini dozvoljen delete je nad
   `financials_history`, i to samo za `datum_preseka` koji se upravo upisuje (vidi šemu).

---

## Struktura stranice firme, `/firma/[slug]`

Redosled sekcija je fiksan:

1. **Zaglavlje** — poslovno ime, MB, PIB, status badge (aktivan zeleno, likvidacija žuto, stečaj crveno)
2. **Osnovni podaci** — datum osnivanja, starost u godinama, pravna forma, opština, delatnost sa nazivom
3. **Finansije** — godina, prihodi, neto rezultat, kapital, imovina, zaposleni
4. **Pokazatelji** (računati u kodu, bez AI):
   - prihod po zaposlenom
   - neto marža u procentima
   - odnos kapitala i poslovne imovine
   - poređenje sa medijanom delatnosti (iznad/ispod, za koliko procenata)
   - rang u delatnosti i rang u opštini
5. **AI sažetak** — lazy load, skeleton dok se učitava, fallback ako padne
6. **Signali** — samo ako postoje, računati u kodu:
   - negativan kapital
   - gubitak veći od kapitala
   - nula prihoda uz prijavljene zaposlene
   - status nije aktivan
   - firma mlađa od 12 meseci
7. **Slične firme** — 6 firmi, ista delatnost, najbliži prihod. Interni linkovi, kritično za SEO.
8. **Futer sa izvorom i disclaimerom**

### Meta tagovi

```
title:       "{PoslovnoIme} - PIB, matični broj, finansijski izveštaj | Biznis priče"
description: "{PoslovnoIme}, {opstina}. Prihod {X} RSD u {godina}, {N} zaposlenih. Osnovana {datum}. Besplatna provera podataka iz APR."
```

JSON-LD: schema.org `Organization` sa `legalName`, `taxID`, `foundingDate`, `address`.

---

## Rutiranje

```
/                              pretraga, hero, top liste
/firma/[slug]                  stranica firme
/delatnost/[sifra]             lista firmi u delatnosti, sortirano po prihodu
/grad/[opstina]                lista firmi u opštini
/najvece                       top liste
/najvece/[metrika]             po prihodu, dobiti, zaposlenima, prihodu po zaposlenom
/o-podacima                    odakle podaci, kako se koriste, kako prijaviti grešku
/api/search                    autocomplete
/api/summary/[mb]              AI sažetak, keširan
/sitemap.xml                   index
/sitemaps/firme-[n].xml        po 50.000 URL-ova, Google limit
```

---

## ISR i performanse

```ts
// app/firma/[slug]/page.tsx
export const revalidate = 2592000  // 30 dana, koliko i presek podataka

export async function generateStaticParams() {
  // SAMO top 10.000 po ukupnim prihodima. Ostalo se generiše na zahtev.
}
```

- Nikad ne računaj medijane u runtime. Sve ide iz materijalizovanih view-ova.
- Pretraga mora da vrati odgovor ispod 100ms. GIN indeks na `poslovno_ime_norm` sa `gin_trgm_ops`.
- Bez client side biblioteka za grafikone u v1. Ako treba vizuelizacija, inline SVG.

---

## AI sažetak, stroga pravila

Model dobija samo strukturisane podatke iz baze. Prompt mora da sadrži:

**Zabranjeno:**
- Bilo kakva tvrdnja koja nije direktno izvedena iz prosleđenih brojeva
- Procena kreditne sposobnosti, boniteta ili preporuka da li poslovati sa firmom
- Spekulacija o razlozima za rezultat
- Pominjanje imena ljudi
- Izmišljanje podataka koji nisu prosleđeni

**Obavezno:**
- Srpski, latinica, 2 do 3 kratka pasusa
- Ton: neutralan, informativan, kao kratka analitička beleška
- Ako su svi finansijski podaci nula, reci samo da firma nije predala izveštaj

Keširanje: jedan sažetak po firmi po `datum_preseka`. Ako se presek promeni, regeneriši.
Rate limit: 30 zahteva po IP na sat.
Fallback: ako API padne, vrati `{ summary: null }` sa statusom 200, nikad 500.

---

## Radni proces

1. **Jedna sesija, jedna funkcionalnost.** Ne "napravi ceo sajt".
2. **Grana po funkcionalnosti**, Vercel pravi preview deploy automatski.
3. **Testovi idu na pipeline, ne na UI.** Ključni testovi:
   - broj firmi ne odstupa više od 5 odsto od prethodnog preseka
   - nema duplikata slugova
   - nema firmi bez matičnog broja
   - `DatumPreseka` je noviji od prethodnog
4. **Nikad ne komituj `.env`.** Supabase service key i Claude API key idu u Vercel env varijable.
5. Kada nešto nije definisano u ovom fajlu, **pitaj umesto da pretpostaviš.**

---

## Šta NE raditi u v1

- Nema registracije, naloga ni logina
- Nema naplate
- Nema NBS blokada računa (faza 2)
- Nema podataka o vlasnicima i zastupnicima
- Nema preduzetnika
- Nema grafikona i vizuelizacija
- Nema mobilne aplikacije
- Nema engleske verzije
