# SEO.md

Tehnička SEO specifikacija za `firme.biznisprice.com`.
Referencira se iz `CLAUDE.md`. Sve u ovom fajlu je obavezno, ne opciono.

Podaci u ovom fajlu su provereni nad stvarnim APR setom (presek 31.07.2026) i nad
stvarnim SERP-om u avgustu 2026.

---

## 0. Stanje konkurencije, zašto ovo ima smisla

Provereno direktnim pregledom stranica u avgustu 2026:

| Konkurent | Stranica | Fatalna greška |
|---|---|---|
| companywall.rs | ~612.000 | Canonical je `https://www.https://www...` (dupli protokol). Bilo koji slug vraća 200 sa istim sadržajem. Nula JSON-LD. Nula linkova ka drugim firmama. TTFB 2,3s. |
| pretraga.cubepartner.rs | < 1.000 | Title tag IDENTIČAN na svakoj stranici. Nema H1. Nema robots.txt ni sitemap.xml (oba vraćaju HTML početne). Nula internih linkova. Google fizički ne može da otkrije njihove stranice. |
| privredni-imenik.com | ~55.000 | Title `FIRMA : privredni-imenik.com`. Nema H1, canonical ni JSON-LD. Ima klonove sa istim sadržajem koji im cepaju autoritet. |
| ls.rs | desetine hiljada | Mrtav projekat, 103 reči po stranici, bez sitemapa. Rangira samo zbog naziva u subdomenu. |
| kolikajeplata.com | ~100k | Najbolji title šablon, ali bez H1, bez JSON-LD, sadržaj iza paywalla. |
| apr.gov.rs | 0 | Pretraga je JS aplikacija bez indeksabilnih stranica. Nije konkurent na long-tailu. |

**Nijedan konkurent na tržištu nema JSON-LD Organization na stranici firme. Nijedan.**
**Samo jedan (privredni-imenik) ima interno linkovanje ka drugim firmama.**

Ovo nije tržište gde se pobeđuje trikovima. Pobeđuje se time što se osnovne stvari
urade ispravno, jer ih niko nije uradio.

---

## 1. BLOKERI, moraju biti gotovi pre nego što pustiš ijednu stranicu u indeks

Sve ispod je ili nepovratno, ili se posle indeksiranja popravlja uz gubitak.

### 1.1 Skraćeno poslovno ime (`poslovno_ime_kratko`)

**Ovo je najveći propust u prvobitnom planu.**

Provereno nad setom: prosečna dužina poslovnog imena je **48 znakova, a 28,7 odsto
imena (38.357 firmi) ima preko 60 znakova.**

Stvaran primer iz APR-a:
```
PREDUZEĆE ZA SPOLJNU I UNUTRAŠNJU TRGOVINU I USLUGE NELT CO. DOO DOBANOVCI
```
73 znaka. U title tagu nema mesta ni za šta drugo. Google seče na oko 60.

Potrebna je izvedena kolona `poslovno_ime_kratko` po pravilima:

1. Ukloni uvodne opisne fraze: `PREDUZEĆE ZA ...`, `DRUŠTVO ZA ...`, `DOO ZA ...`,
   `INDUSTRIJA ...`, `AKCIONARSKO DRUŠTVO ZA ...` do prvog pojavljivanja
   distinktivnog dela
2. Zadrži distinktivno jezgro + pravnu formu (DOO, AD, OD, KD) + grad
3. Normalizuj SVA VELIKA SLOVA u Title Case, uz čuvanje akronima (do 3 znaka ostaju velika)
4. Maksimum 45 znakova, seci na granici reči
5. Ako pravilo ne uspe (nema jasnog jezgra), fallback je prvih 45 znakova originala

Rezultat: `Nelt Co. DOO Beograd`

**Zašto je ovo bloker:** ovo ime ulazi u slug, title, H1 i OG sliku. Slug se posle
indeksiranja ne menja bez 301 lanca na 133.000 URL-ova.

**Prikaz pune verzije:** puno poslovno ime ostaje na stranici kao poseban red
("Puno poslovno ime: ..."), jer ljudi ga traže doslovno.

### 1.2 Stabilnost sluga i istorija

Firme menjaju ime. Ako je slug izveden iz imena, promena imena lomi URL.

Pravilo: **slug se generiše jednom, pri prvom unosu firme, i nikad se ne menja.**
Ingest pipeline ne sme da regeneriše slug za postojeći `maticni_broj`.

Ako slug ipak mora da se promeni, upisuje se stari slug u `slug_history` i servira
se trajni 301. Ovo traži dodatnu tabelu, dakle **odluči pre nego što baza ode u
produkciju**:

```sql
create table slug_history (
  stari_slug   text primary key,
  maticni_broj text not null references companies(maticni_broj),
  created_at   timestamptz default now()
);
```

Middleware proverava `slug_history` pre `notFound()`.

### 1.3 Validacija sluga, ne ponavljaj grešku CompanyWall-a

CompanyWall vraća HTTP 200 za `/firma/bilo-sta-izmisljeno/{id}`. Beskonačan
duplicate content.

Kod nas slug sadrži matični broj. Pravilo:
- izvuci matični broj iz sluga (poslednji segment posle poslednje crtice)
- ako firma postoji ali se slug ne poklapa tačno sa kanonskim → **301 na kanonski slug**
- ako firma ne postoji → `notFound()` sa 404, nikad 200

### 1.4 Tanak sadržaj, 27 odsto seta

Provereno nad setom:

| Kategorija | Broj | Udeo |
|---|---|---|
| Firme bez ijednog finansijskog zapisa | 10.274 | 7,7% |
| Firme sa zapisom ali nula prihoda | 25.896 | 19,4% |
| **Ukupno bez upotrebljivih finansija** | **36.170** | **27,1%** |
| Stranice sa punim sadržajem | 97.464 | 72,9% |

Za tih 36.170 stranica nemaš ni finansije, ni pokazatelje, ni rang, ni signale.
Ostaje ime, opština, datum osnivanja i status. To je definicija tankog sadržaja.

Pravilo:
- **Ne stavljaj ih u sitemap u prvoj fazi.** Ne `noindex` (Google i dalje troši crawl
  budžet na noindex stranice), samo ih ne guraj.
- Neka i dalje postoje i budu dostupne preko pretrage i internih linkova. Ako ih
  Google sam nađe i indeksira, u redu.
- Za njih napravi drugačiji šablon: umesto praznih tabela, jasan tekst
  "Firma nije predala finansijski izveštaj za 2025." plus kontekst delatnosti
  i opštine, plus 6 sličnih firmi koje jesu predale. Tako stranica ima svrhu.

### 1.5 Serverski render svega što je podatak

**Ovo je najvažnija tehnička stavka u celom dokumentu.**

Vercel je analizirao milijardu crawler zahteva: **nijedan veliki AI crawler ne
izvršava JavaScript.** GPTBot preuzima JS u 11,5 odsto zahteva i ne izvršava ga,
ClaudeBot u 23,8 odsto i nikad ga ne izvršava.

Posledica: sve što se učitava klijentski je nevidljivo za ChatGPT, Claude i Perplexity,
i kod Google-a se renderuje sa odlaganjem.

Obavezno u početnom HTML-u, kao pravi tekst na serveru:
- tabela finansija
- svi pokazatelji (prihod po zaposlenom, marža, odnos kapitala, poređenje sa medijanom)
- rang u delatnosti i opštini
- signali
- datum preseka
- svi interni linkovi

Nijedna od ovih sekcija ne sme imati `'use client'` iznad sebe.

### 1.6 AI sažetak, promena pristupa

Prvobitni plan (lazy load preko `/api/summary/[mb]`) ima dva problema:

1. **Nijedan AI crawler ga nikad neće videti.** Vidiće prazan kontejner.
2. **133.634 AI generisana teksta je doslovno Google-ova definicija scaled content
   abuse**: "using generative AI tools to generate many pages without adding value".

Nova arhitektura, hibrid:

```
Sekcija "Analiza" =
  [deterministički deo, serverski, iz templejta nad brojevima]   ~70%
  [AI deo, generisan jednom, keširan u bazi, serverski rendovan] ~30%
```

Deterministički deo se piše u `lib/narrative.ts` i sastavlja rečenice od brojeva:

> "Firma je u 2025. ostvarila prihod od 45.200.000 RSD sa 12 zaposlenih, što je
> 3.766.667 RSD po zaposlenom. To je 23 odsto iznad medijane delatnosti 4711
> (trgovina na malo), koja iznosi 3.062.000 RSD. Po ukupnom prihodu firma je
> 412. u svojoj delatnosti i 87. u opštini Novi Sad."

To je originalna analiza nad javnim podacima, izračunata u kodu, proverljivo tačna,
i to je tvoja odbrana od scaled content filtera.

AI dodaje samo interpretativni sloj od jednog do dva pasusa, generiše se jednom pri
ingestu ili pri prvom zahtevu, **upisuje se u bazu i renderuje se serverski iz baze**,
ne fetchuje se klijentski.

Ako AI sažetak još nije generisan za tu firmu, stranica se renderuje bez njega.
Nikad skeleton, nikad prazan prostor.

### 1.7 CLS na 133.000 stranica

Ako ipak zadržiš bilo kakvo klijentsko učitavanje, skeleton mora imati **tačno istu
visinu** kao finalni sadržaj. Inače dobijaš layout shift na svih 133k stranica
odjednom. Fiksiraj `min-height`.

Pragovi (nepromenjeni u 2026, mereno na 75. percentilu): LCP do 2,5s, INP do 200ms,
CLS do 0,1.

### 1.8 Ćirilica: NE praviti drugu verziju sajta

Odluka: **jedna verzija, latinica, `<html lang="sr">`, bez hreflang-a.**

Razlozi:
1. Transliteracija nije prevod. Google: "Localized versions are only considered
   duplicates if the main content remains untranslated." Ćirilična verzija je
   po definiciji duplikat.
2. 267.000 stranica umesto 133.000 prepolovljava crawl budžet.
3. 133.000 mašinski transliterisanih stranica je Google-ov doslovan primer scaled
   content abuse: "automated transformations like synonymizing or translating with
   minimal user benefit".

Kako se ipak pokrivaju ćirilični upiti, bez dupliranja:

- **`alternateName` u JSON-LD** sa ćiriličnim oblikom poslovnog imena i opštine
  (APR ti ionako daje `NazivOpstine` ćirilicom)
- **jedna vidljiva linija u zaglavlju**: `Ćirilica: ПОСЛОВНО ИМЕ ДОО, Нови Сад`.
  To je stvaran podatak iz APR-a, ne keyword stuffing
- **u internoj pretrazi indeksiraj oba oblika** da `pg_trgm` autocomplete radi i za
  ćirilične upite. Traži dodatnu kolonu `poslovno_ime_norm_cir` ili konkatenaciju,
  odluči pre zaključavanja baze

### 1.9 robots.txt, tačan sadržaj

Kritično: svaki AI vendor ima ODVOJENE botove za treniranje i za pretragu.
Blokiranje pogrešnog te izbacuje iz citata u ChatGPT i Claude pretrazi.

```
# AI pretraga i citiranje, OBAVEZNO dozvoliti
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: Claude-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Perplexity-User
Allow: /

# Treniranje modela, poslovna odluka. Preporuka: dozvoliti.
# Podaci su javni pod otvorenom licencom, a prisustvo u korpusu
# gradi asocijaciju brenda Biznis priče sa temom srpskih firmi.
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: CCBot
Allow: /

User-agent: *
Disallow: /api/
Disallow: /*?sort=
Disallow: /*?order=

Sitemap: https://firme.biznisprice.com/sitemap.xml
```

Napomena: `Google-Extended` kontroliše samo Gemini treniranje i **ne utiče** na
Google Search ni na AI Overviews.

---

## 2. Arhitektura internog linkovanja

Ovo je jedina poluga koja realno pomera indeksiranje na 133k stranica, i to je
najveća rupa kod konkurencije (CompanyWall ima 612.000 stranica i **nula** linkova
ka drugim firmama).

### 2.1 Slične firme: 3 + 3, ne 6

Prvobitni plan (6 firmi iz iste delatnosti sa najbližim prihodom) pravi gusto
povezane klastere koji su međusobno izolovani, i velike firme skupljaju sve linkove.

Ispravno:
- **3 firme iz iste delatnosti**, najbliži prihod (gore i dole)
- **3 firme iz iste opštine**, najbliži prihod

Time se klasteri ukrštaju i graf postaje povezan. 133.634 × 6 = oko 800.000 internih
linkova u povezanoj mreži.

### 2.2 Ukrštene hub stranice `/delatnost/[sifra]/[opstina]`

Nove rute koje nisu bile u prvobitnom planu. Ovo su istovremeno:
- stvarne namere pretrage ("pekare u Nišu", "IT firme u Novom Sadu")
- savršeni hub-ovi koji spuštaju svaku firmu na dubinu 2 od početne

Generiši samo kombinacije sa **minimum 5 firmi**, inače praviš tanke stranice.

### 2.3 Pravila dubine

- nijedna stranica firme dalje od **3 klika** od početne
- putanja: početna → delatnost ili grad → (paginacija) → firma
- **nula orphan stranica**: svaka firma mora biti dostupna preko bar jedne kategorijske
  stranice i preko bar jedne "slične firme" veze
- paginacija mora biti pravi `<a href>`, ne JS dugme
- breadcrumb na svakoj stranici, sa `BreadcrumbList` JSON-LD

### 2.4 Linkovi naviše sa stranice firme

Sa svake stranice firme obavezno: link na delatnost, link na opštinu, link na
ukrštenu delatnost+opština stranicu.

---

## 3. Meta tagovi, tačni šabloni

### Stranica firme

```
title:
{PoslovnoImeKratko} - PIB, matični broj, prihod {godina}

description:
{PoslovnoImeKratko}, {opstina}. PIB {pib}, matični broj {mb}. Prihod
{prihod} RSD u {godina}, {n} zaposlenih. Osnovana {datum}. Besplatni
podaci iz APR.
```

Za firme bez finansija:
```
description:
{PoslovnoImeKratko}, {opstina}. PIB {pib}, matični broj {mb}. Osnovana
{datum}, {pravnaForma}. Finansijski izveštaj za {godina} nije predat.
Besplatni podaci iz APR.
```

Brend `| Biznis priče` NE ide u title stranice firme. Srpska imena su preduga,
a brend će Google svejedno prikazati kao ime sajta ispod URL-a.
Brend ide samo u title na početnoj i kategorijskim stranicama.

### Kategorijske stranice

```
/delatnost/[sifra]
title: Najveće firme: {nazivDelatnosti} u Srbiji {godina} | Biznis priče
desc:  {brojFirmi} firmi u delatnosti {nazivDelatnosti}. Medijan prihoda
       {x} RSD, medijan marže {y}%. Rang lista po prihodu, podaci APR
       presek {datum}.

/grad/[opstina]
title: Najveće firme u opštini {Opstina} {godina} | Biznis priče
desc:  {brojFirmi} firmi registrovanih u opštini {Opstina}. Ukupan prihod
       {x} RSD, {y} zaposlenih. Rang lista po prihodu iz APR podataka.

/delatnost/[sifra]/[opstina]
title: {nazivDelatnosti} u opštini {Opstina} - {brojFirmi} firmi | Biznis priče

/najvece/[metrika]
title: 100 najvećih firmi u Srbiji po {metrika} {godina} | Biznis priče
```

### Obavezno na svakoj stranici

- `<link rel="canonical">` sa apsolutnim URL-om, **provereno da nema duplog protokola**
- `og:title`, `og:description`, `og:image`, `og:type`, `og:url`
- `<html lang="sr">`
- jedan i samo jedan `<h1>`, sa skraćenim poslovnim imenom

---

## 4. Structured data, samo ono što radi

Implementiraj tačno četiri stvari. Ostalo je gubljenje vremena.

### 4.1 BreadcrumbList (jedini vidljivi rich result)

Na svakoj stranici firme i svakoj kategorijskoj. Ovo proizvodi navigacionu putanju
u SERP-u i utiče na CTR.

### 4.2 Organization (entity signal, bez vizuelnog efekta)

Na stranici firme. Polja: `legalName`, `alternateName` (ćirilični oblik), `taxID`,
`identifier` (matični broj), `foundingDate`, `address` (samo `addressLocality`
i `addressCountry`, nemaš ulicu), `numberOfEmployees`, `naics`.

**Realno očekivanje:** ovo neće proizvesti rich result, jer Google Organization shemu
tumači kao "organizacija koja stoji iza ovog sajta", a ti opisuješ treću stranu.
Efekat je entity disambiguation i mašinska čitljivost. Vredi raditi jer je nula truda
i **nijedan konkurent to nema**, ali ne planiraj saobraćaj na osnovu toga.

### 4.3 FAQPage na stranici firme

CompanyWall ima FAQ blok sa doslovnim long-tail upitima ali **bez schema markupa**.
Uzmi im ideju i uradi je kako treba.

Pitanja (generisana iz podataka, sa stvarnim odgovorima):
- `Koji je PIB firme {ime}?`
- `Koji je matični broj firme {ime}?`
- `Koliki je prihod firme {ime} u {godina}?`
- `Koliko zaposlenih ima {ime}?`
- `Da li je {ime} aktivna firma?`
- `Kada je osnovana {ime}?`

Odgovori moraju biti **samostalne rečenice** koje imaju smisla izvučene iz konteksta.
To je i format koji LLM najlakše citira.

### 4.4 Dataset, samo na `/o-podacima`

Opiši ceo APR snapshot: `name`, `description`, `creator` (APR), `license` (Srpska
licenca za otvorene podatke), `temporalCoverage`, `distribution`. Daje ti prisustvo
u Google Dataset Search i jak signal o poreklu podataka, za Google i za LLM-ove.

### Šta NE raditi

- **LocalBusiness**: nemaš ulicu ni poštanski broj, samo opštinu. Nepotpun
  LocalBusiness markup vodi u manualnu akciju "Structured data issue".
- **ItemList**: nije rich result osim u kombinaciji sa Product/Recipe/Course/Movie.
  Stavi ga na `/najvece` jer košta nula, ali ne očekuj efekat.
- **llms.txt**: 97 odsto llms.txt fajlova dobilo je nula zahteva u maju 2026.
  Google je potvrdio da fajl ne utiče na vidljivost. Preskoči.

---

## 5. Sitemap i indeksiranje

### 5.1 Segmentacija po kvalitetu, ne po abecedi

Google daje statistiku indeksiranja **po sitemap fajlu**. Iskoristi to kao
dijagnostiku:

```
/sitemap.xml                    index
/sitemaps/staticne.xml          početna, /o-podacima, /najvece
/sitemaps/kategorije.xml        delatnosti, gradovi, ukrštene (< 5.000 URL)
/sitemaps/firme-1.xml           top 45.000 po prihodu
/sitemaps/firme-2.xml           sledećih 45.000
/sitemaps/firme-3.xml           ostatak sa finansijama (~7.500)
/sitemaps/firme-bez-fi.xml      36.170 bez finansija, NE šalje se u fazi 1
```

Ovako tačno vidiš koji sloj Google odbija, umesto jednog pomešanog broja.

### 5.2 lastmod

- vrednost = `datum_preseka` **te konkretne firme**, menja se samo kad se podaci
  te firme stvarno promene
- Google koristi `lastmod` samo ako je "consistently and verifiably accurate".
  Ako svakog meseca setuješ lastmod na svih 133k a promenilo se 5.000, Google
  prestaje da veruje tvom lastmod-u u celini
- `<priority>` i `<changefreq>` Google **ignoriše**. Ne stavljaj ih.

### 5.3 Redosled slanja

| Kada | Šta |
|---|---|
| Dan 0 | `staticne.xml` + `kategorije.xml` |
| Dan 0 | `firme-1.xml` (top 45.000) |
| Dan 14 | `firme-2.xml` |
| Dan 30 | `firme-3.xml` |
| Kada prvi sloj pređe 60% indeksiranosti | `firme-bez-fi.xml` |

### 5.4 Šta NE radi

- **Google Indexing API ne dolazi u obzir.** Zvanično: radi samo za `JobPosting` i
  `BroadcastEvent`. Alati koji nude "instant indexing" za obične stranice krše uslove.
- **IndexNow: Google ga ne podržava.** Podržavaju Bing, Yandex, Naver, Seznam.
  Implementacija je pola sata iz GitHub Actions cron-a posle ingesta. Uradi zbog
  Bing i Copilot-a, ali ne očekuj ništa za Google.

### 5.5 Realno očekivanje

Google će indeksirati **40 do 70 odsto** stranica ovakvog sajta u prvoj godini.
To nije neuspeh, to je normalno za ovu klasu sajta. Ne panici.

Dijagnostika u Search Console:
- puno **"Discovered - currently not indexed"** = problem sa brzinom servera ili
  internim linkovima. Rešivo tehnički.
- puno **"Crawled - currently not indexed"** = Google je video stranicu i procenio
  da ne vredi. Signal kvaliteta. Tu tehnika ne pomaže, pomaže samo dublji sadržaj
  i jači linkovi.

---

## 6. Crawl budget

Sa `generateStaticParams` koji pravi samo top 10.000, preostalih 123.000 stranica se
generiše on-demand pri prvom zahtevu. Ako Googlebot naiđe na 5.000 nekeširanih
stranica u nizu i TTFB skoči, Google **smanjuje crawl rate** i ti si sam sebi
zatvorio slavinu.

Obavezno:
- p95 TTFB za hladan ISR ispod **500ms**, meri ga
- svi podaci za stranicu firme u **jednom** upitu do baze (RPC funkcija), ne pet
- pokazatelji i rangovi iz materijalizovanih view-ova, nikad runtime agregacija
- prati Crawl Stats u GSC i traži inverznu korelaciju između skoka response time
  i pada broja zahteva
- blokiraj sortiranje i filtriranje parametrima u robots.txt (duplikati najviše
  troše crawl budžet)
- `/api/` blokiran

Razmisli o podizanju `generateStaticParams` sa 10.000 na 45.000 (isti skup kao
`firme-1.xml`). Build traje duže, ali crawl prvog sloja ide na statiku.

---

## 7. Format za AI pretragu

AI referral saobraćaj je **0,32 odsto** ukupnih poseta u 2026 (studija na 101.574
sajta). Organska pretraga šalje oko 134 puta više. Dakle: ovo je Google projekat,
AI vidljivost je besplatan bonus, ne kanal.

Ali format koji LLM lako citira je isti format koji je dobar za ljude, pa se isplati:

- **prava HTML `<table>`** za finansije, sa `<caption>` i `<th scope>`, ne div grid
- **samostalne rečenice sa brojem i kontekstom**. Loše: "23% iznad proseka".
  Dobro: "Prihod firme Nelt Co. DOO u 2025. iznosio je 119.272.508.000 RSD, što je
  23 odsto iznad medijane delatnosti 4690."
- **naslovi u obliku pitanja** (poklapa se sa FAQ sekcijom)
- **datum preseka vidljiv kao tekst na vrhu**, ne samo u futeru. AI citiran sadržaj
  je u proseku 25,7 odsto svežiji od organskog top 10, svežina korelira sa citiranjem

**Najjači potez za AI vidljivost nije tehnički.** Brend pominjanja koreliraju sa
vidljivošću u AI Overviews na 0,664, dok backlinkovi koreliraju na 0,218 (Ahrefs,
75.000 brendova). Jedna epizoda podkasta o alatu vredi više od svih GEO taktika
zajedno.

---

## 8. Zero-click, i zašto stranica mora nuditi više od snippeta

68 odsto Google pretraga u 2026 završava bez klika (sa 60 odsto u 2024).
AI Overviews se pojavljuju na oko 48 odsto pretraga i obaraju organski CTR za 61 odsto.

Za upit "PIB firme X" Google može prikazati odgovor direktno i ti nemaš klik.

Zato tvoja stranica mora nuditi ono što ne staje u snippet:
- poređenje sa medijanom delatnosti
- rang u delatnosti i opštini
- signale i upozorenja
- 6 sličnih firmi

To je i razlog zašto su pokazatelji, a ne sirovi podaci, tvoj stvarni proizvod.

---

## 9. Najbrži put do prvog saobraćaja: `/najvece`

Provereno u SERP-u: za upite `najveće firme u srbiji`, `najveće IT firme u srbiji`,
`koliko zarađuju firme u srbiji` u top 10 **nema nijedne baze podataka**. Sve su
mediji: forbes.n1info.rs, biznis.rs (3 pozicije), bif.rs, rs.bloombergadria.com,
nova.rs.

Ti članci su statični, jednokratni, sa podacima od pre godinu ili dve.

Stranica koja se osvežava svakog meseca sa svežim APR presekom ima trajnu prednost.
To su **head upiti sa realnim volumenom**, ne long-tail, i tu ćeš videti prvi
saobraćaj mnogo pre nego što se 133k stranica indeksira.

Prioritet pri lansiranju: kategorijske i `/najvece` stranice idu prve, moraju biti
najbolje odrađene, i one su ono što guraš kroz Instagram i podkast.

---

## 10. Merenje, šta pratiti nedeljno

| Metrika | Gde | Alarm |
|---|---|---|
| Indeksirane stranice po sitemap fajlu | GSC Sitemaps | prvi sloj ispod 40% posle 60 dana |
| Discovered vs Crawled not indexed | GSC Page indexing | rast Crawled not indexed = problem kvaliteta |
| Crawl requests po danu | GSC Crawl stats | pad uz rast response time = crawl capacity |
| Prosečno vreme odgovora | GSC Crawl stats | preko 600ms |
| p95 TTFB za cold ISR | Vercel Analytics | preko 500ms |
| Klikovi na `/najvece` i `/delatnost` | GSC Performance | ovo raste prvo |
| Broj orphan stranica | sopstvena skripta nad bazom | mora biti 0 |

---

## 11. Kontrolna lista pre lansiranja

Sve mora biti čekirano pre nego što pošalješ prvi sitemap.

- [ ] `poslovno_ime_kratko` generisano i provereno na 50 nasumičnih firmi
- [ ] Slug se ne regeneriše pri ponovnom ingestu (testirano dvostrukim pokretanjem)
- [ ] `slug_history` tabela postoji, middleware radi 301
- [ ] Pogrešan slug sa validnim MB → 301 na kanonski, ne 200
- [ ] Nepostojeći MB → 404, ne 200
- [ ] Canonical na 10 nasumičnih stranica proveren ručno, bez duplog protokola
- [ ] Tabela finansija, pokazatelji, signali i rang su u `view-source`, ne u JS
- [ ] Nijedna stranica firme nema `'use client'` na sekciji sa podacima
- [ ] AI sažetak se renderuje serverski iz baze, ne fetchuje klijentski
- [ ] Deterministički narativ postoji i radi i bez AI sažetka
- [ ] Jedan `<h1>` po stranici, sa skraćenim imenom
- [ ] BreadcrumbList, Organization i FAQPage validirani u Rich Results Test
- [ ] Dataset schema na `/o-podacima`
- [ ] robots.txt sa svim AI search botovima eksplicitno dozvoljenim
- [ ] Sitemapi segmentirani po kvalitetu, `firme-bez-fi.xml` NIJE poslat
- [ ] `lastmod` po firmi, bez `priority` i `changefreq`
- [ ] 3 + 3 slične firme (delatnost + opština), ne 6 iz iste delatnosti
- [ ] `/delatnost/[sifra]/[opstina]` rute postoje, samo za kombinacije sa 5+ firmi
- [ ] Nula orphan stranica (skripta provereno)
- [ ] Paginacija je `<a href>`, ne JS
- [ ] Ćirilični oblik u `alternateName` i kao vidljiva linija
- [ ] Bez ćirilične verzije sajta, bez hreflang
- [ ] p95 TTFB za cold ISR ispod 500ms
- [ ] CLS ispod 0,1 na stranici firme
- [ ] Futer sa izvorom APR i datumom preseka na svakoj stranici
- [ ] Datum preseka vidljiv i na vrhu stranice, kao tekst
- [ ] OG slika se generiše i prikazuje pri deljenju u Viber i WhatsApp

---

## Izvori za tvrdnje u ovom dokumentu

- Google spam policies, scaled content abuse: https://developers.google.com/search/docs/essentials/spam-policies
- Crawl budget za velike sajtove: https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget
- Sitemap, lastmod i ignorisanje priority: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Indexing API ograničenja: https://developers.google.com/search/apis/indexing-api/v3/quickstart
- Organization structured data: https://developers.google.com/search/docs/appearance/structured-data/organization
- LocalBusiness zahtevi: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Lokalizovane verzije i duplikati: https://developers.google.com/search/docs/specialty/international/localized-versions
- AI features u pretrazi: https://developers.google.com/search/docs/appearance/ai-features
- OpenAI botovi: https://developers.openai.com/api/docs/bots
- Anthropic crawleri: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Vercel, AI crawleri ne izvršavaju JS: https://vercel.com/blog/the-rise-of-the-ai-crawler
- Ahrefs, brend pominjanja vs AI vidljivost: https://ahrefs.com/blog/ai-overview-brand-correlation/
- SE Ranking, AI saobraćaj 0,32%: https://seranking.com/blog/ai-traffic-research-study/
- llms.txt, 97% bez zahteva: https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/
- Zero-click 2026: https://searchengineland.com/google-zero-click-searches-2026-study-479717
- Web Vitals pragovi: https://web.dev/articles/vitals
