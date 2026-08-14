# Ingest pipeline, dizajn

Datum: 14.08.2026.
Sesija: 3
Grana: `feat/ingest`
Preduslov: migracija 001 primenjena na projekat `ypovucckebvxbianbvam`.

---

## Cilj

Skripta koja povlači APR open data, normalizuje ga po pravilima iz `CLAUDE.md`,
upisuje u Supabase, arhivira sirov presek i osvežava materijalizovane view-ove.
Pokreće se ručno tokom razvoja, a od Sesije 10 mesečno preko GitHub Actions.

Šema je zaključana. Ovaj dizajn ne dodaje ni jednu kolonu, tabelu ni migraciju.

---

## Utvrđeno stanje izvora

Provereno nad živim APR API-jem 14.08.2026.

| Endpoint | Veličina | DatumPreseka |
|---|---|---|
| `/api/opendata/companies` | 57,6 MB | 2026-07-31 |
| `/api/opendata/companies/financial-statements` | 56,9 MB | 2026-07-31 |
| `/api/opendata/ngo` | 32 MB | 2026-07-31 |

### Prenos i TLS

1. **TLS.** Node puca sa `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Server šalje samo leaf
   sertifikat (`CN=*.apr.gov.rs`), izdavalac je
   `SSL2BUY EMEA RSA Domain Validation Secure Server CA`, čiji je koren
   `Sectigo Public Server Authentication Root R46`. Intermediate se skida sa
   `http://crt.sectigo.com/SSL2BUYEMEARSADomainValidationSecureServerCA.crt`
   (DER, konvertuje se u PEM). `curl` prolazi jer sam dovlači intermediate preko
   AIA, Node to ne radi.

   **Provereno da rešenje radi:** `https.Agent({ ca: [...tls.rootCertificates, pem] })`
   vraća 200. Bez dodatog PEM-a isti zahtev vraća `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

2. **Range zahtevi se NE poštuju.** Server vraća `200` i celo telo, ne `206`, i ne
   šalje `Content-Length` (chunked). Ranija `curl` provera je delovala kao da Range
   radi, ali je zapravo curl primao ceo odgovor.

   Zato se `DatumPreseka` čita tako što se konekcija **prekine posle prvog chunka**.
   Izmereno: `DatumPreseka` stigne unutar prvih **8 KB** i za **oko 1 sekundu**,
   pa se soket ruši. Efekat je isti kao da Range radi.

3. **`DatumPreseka` je prvi ključ** u sva tri odgovora. Ako ga nema u prva 4 KB,
   ide fallback na pun download i `JSON.parse`.

4. **Nema endpointa za šifarnik delatnosti.** Provereno: `/api/opendata`,
   `/swagger/v1/swagger.json` i `/api/opendata/delatnosti` vraćaju 404.

### Oblik podataka, izmereno nad celim setovima

**companies, 133.634 reda** (poklapa se sa brojkom iz `CLAUDE.md`):

| Nalaz | Vrednost |
|---|---|
| Matični broj | svih 8 cifara, bez razmaka, bez duplikata |
| `DatumOsnivanja` | 100% `YYYY-MM-DD`, nijedan null |
| `NazivStatus` | tačno 4 vrednosti, sve ćirilicom |
| `NazivPravneForme` | 13 vrednosti, sve ćirilicom |
| `SifraDelatnosti` | 571 distinct, uvek 4 cifre, nijedan prazan, **ima vodećih nula** (`0161`) |
| `SifraOpstine` | 192 distinct, nijedan prazan, naziv uvek ćirilicom |
| `PoslovnoIme` | nijedno prazno, najduže **397 znakova**, **10.602 sadrže ćirilicu** |

Raspodela statusa: `Активан` 125.005, `У ликвидацији` 6.185, `У стечају` 1.360,
`У принудној ликвидацији` 1.084. Odatle sledi eksplicitno pravilo
`status_aktivan = (NazivStatus === 'Активан')`, bez ikakvog `contains`.

**financial-statements, 123.360 redova:**

| Nalaz | Vrednost |
|---|---|
| Ključ sa razmakom na kraju | **11.099 redova**, oko 9% seta |
| Duplikati posle trima | nema |
| `GodinaFi` | dve godine: 2025 (112.208), 2024 (11.152) |
| Siročići, MB kojeg nema u `companies` | **6.513** |
| Sva novčana polja | uvek broj, **nikad null, nikad negativno**, celobrojno, staje u `bigint` |
| Redovi gde je sve nula | 11.154, to je „nije predala izveštaj" iz pravila 5 |
| `SifraOpstine` | u ovom setu je **broj**, a u companies setu **string** |

Dve posledice:

- `financials` dobija **116.847** redova (123.360 minus 6.513 siročića), a ne oko
  123.000 kako plan razvoja očekuje. `financials_history` dobija svih 123.360.
  Uslov završetka je usklađen sa ovim.
- Signal „negativan kapital" iz `CLAUDE.md` **ne može da se okine iz ovog izvora**,
  jer `Kapital` nikad nije negativan; gubitak stoji u zasebnim poljima. To je stvar
  Sesije 6, ovde se samo evidentira.

### Ćirilica u poslovnim imenima

`CLAUDE.md` propisuje transliteraciju samo za nazive opština, a slugify pominje samo
srpska latinična slova. Ali **10.602 poslovna imena su ćirilicom**. Bez transliteracije
ta imena bi kroz slugify ispala prazna, pa bi slug bio goli `-{MB}`, a
`poslovno_ime_norm` prazan i firma nepretraživa.

Zato `slugify` i `normalizeIme` **prvo transliterišu ćirilicu**, pa onda primenjuju
pravila iz `CLAUDE.md`. `poslovno_ime` za prikaz ostaje originalno, u skladu sa
pravilom 3. Isto važi za `status` i `pravna_forma`, koji stižu ćirilicom a čuvaju se
latinicom, jer je jezik proizvoda srpski latinicom.

---

## Odluke

| Pitanje | Odluka | Razlog |
|---|---|---|
| `ngo` endpoint | Povlači se i arhivira kao `.gz`, ne parsira se i ne ulazi ni u jednu tabelu | Šema nema tabelu za udruženja, v1 ih ne prikazuje. Arhiva čuva presek za fazu 2; APR daje samo tekuće stanje, pa presek koji se ne sačuva sada nestaje zauvek |
| Slug pri promeni imena | Zamrznut pri prvom upisu, `on conflict` ga ne dira | 133k programatskih SEO stranica. Promena sluga je 404 na indeksiranom URL-u. Slug sadrži MB pa ostaje jedinstven i čitljiv i kad ime zastari |
| FI redovi bez firme u `companies` | Preskaču se za `financials`, upisuju se u `financials_history`, broj se prijavljuje | `financials` ima FK, `financials_history` nema. Ništa se ne gubi, integritet ostaje |
| `nace_codes` | Statički JSON iz zvaničnog RZS `.xls` fajla, konvertovan jednom i komitovan | Nazivi delatnosti idu na javne SEO stranice, pa moraju biti zvanični. Izvor je nađen i pokrivenost je 100% |
| Ćirilica u poslovnom imenu | `slugify` i `normalizeIme` transliterišu pre svega ostalog; `poslovno_ime` za prikaz ostaje originalno | 10.602 firme imaju ćirilično ime. Bez ovoga im je slug goli `-{MB}`, a pretraga po imenu ne radi |
| `status` i `pravna_forma` | Čuvaju se transliterisano u latinicu | Stižu ćirilicom, a jezik proizvoda je srpski latinicom |
| Ponovno pokretanje | `--force` zastavica | Bez nje ponašanje je tačno po planu (exit 0). Sa njom se presek obrađuje ponovo, bez ručnog brisanja reda u SQL editoru |
| Storage bucket | Skripta ga kreira ako ne postoji, privatan | Mesečni cron mora da radi na čistom okruženju bez ručnog koraka |
| `okrug` u `municipalities` | Ostaje `null` u v1 | APR ga ne daje, rutiranje ga ne koristi. Popunjava se kad zatreba, iz zvaničnog izvora |

---

## Struktura

```
lib/transliterate.ts        ćirilica → latinica, eksplicitna mapa
lib/normalize.ts            slugify(), normalizeIme(), trimMb(), parseDatum()

scripts/ingest.ts           orkestrator, CLI, ispis statistike
scripts/lib/apr-client.ts   fetch sa CA lancem, timeout, pokušaji, backoff
scripts/lib/archive.ts      bucket, gzip, upload u Storage
scripts/lib/map-apr.ts      sirov APR red → red za bazu
scripts/lib/upsert.ts       batch upsert, diff protiv postojećeg stanja

scripts/certs/sectigo-intermediate.pem
scripts/seed-sifarnici.ts
scripts/data/nace-2010.json
scripts/data/opstine.json

tests/normalize.test.ts     unit, čiste funkcije
tests/ingest.test.ts        integracioni, nad živom bazom
```

`transliterate` i `normalize` idu u `lib/`, a ne u `scripts/`, jer isti `slugify` i
`normalizeIme` koristi i pretraga u Sesiji 5. Jedna definicija, jedno ponašanje.

Nove dev zavisnosti: `tsx`, `vitest`. Ništa ne ulazi u runtime bundle.

Env varijable se učitavaju preko `process.loadEnvFile('.env.local')` u `try/catch`;
u GitHub Actions fajla nema, vrednosti dolaze iz secrets. Supabase klijent je
postojeći `getSupabaseServerClient()` iz `lib/supabase.ts`, ne pravi se novi.

---

## Granice modula

| Modul | Radi | Zavisi od |
|---|---|---|
| `lib/transliterate.ts` | Jedna funkcija, ćirilični string u latinični | ničega |
| `lib/normalize.ts` | Čiste string i datum transformacije | `transliterate` |
| `scripts/lib/apr-client.ts` | Dovlači bajtove sa APR-a u temp fajl, ili čita zaglavlje | `node:https`, pem fajl |
| `scripts/lib/archive.ts` | Bucket i gzip upload | Supabase klijent |
| `scripts/lib/map-apr.ts` | Sirov objekat u red za bazu, bez I/O | `lib/normalize.ts` |
| `scripts/lib/upsert.ts` | Diff i batch upis | Supabase klijent |
| `scripts/ingest.ts` | Redosled koraka, CLI, izveštaj | sve gore |

`map-apr.ts` nema I/O, pa je testabilan bez mreže i baze.

---

## Tok

### Korak 0, provera preseka pre povlačenja

GET na `companies`, čita se stream dok se regexom ne nađe `DatumPreseka`, pa se
`req.destroy()`. Izmereno: 8 KB i oko 1 sekunda. Zatim se pita tabela `snapshots`.

- Presek postoji i nema `--force` → ispis `presek već obrađen`, exit 0.
- `DatumPreseka` nije u prva 4 KB → fallback, pun download pa `JSON.parse`.
- `ECONNRESET` posle `destroy()` se ignoriše, to je očekivana posledica prekida.

Ovim se u redovnom mesečnom pokretanju bez novog preseka povuče 8 KB umesto 147 MB.

### Korak 1, povlačenje

Sva tri seta u temp fajlove u `os.tmpdir()`, jedan po jedan, stream u fajl.
Timeout 120 s po pokušaju, 3 pokušaja, eksponencijalni backoff.
CA lanac: sistemski plus `scripts/certs/sectigo-intermediate.pem`.
`rejectUnauthorized: false` se ne koristi nigde.

### Korak 2, arhiviranje

Bucket `snapshots` se kreira ako ne postoji, kao privatan. Svaki temp fajl se
gzipuje u toku i uploaduje na:

```
{DatumPreseka}/companies.json.gz
{DatumPreseka}/financial-statements.json.gz
{DatumPreseka}/ngo.json.gz
```

NGO staje ovde. Ne parsira se.

### Korak 3, companies

1. Učita se postojeće stanje tabele u `Map` po matičnom broju.
2. Za svaki red iz APR-a: trim MB, normalizacija po `CLAUDE.md`.
3. Slug se uzima iz `Map` ako firma postoji, inače se generiše.
4. Upoređuje se sa postojećim redom. U upsert idu **samo promenjeni i novi** redovi.
5. Batch 1000, `on conflict maticni_broj`.

Učitavanje postojećeg stanja rešava tri stvari odjednom: zamrznut slug, tačnu
statistiku novih i izmenjenih, i to da se u mesecima sa malo promena ne piše 133k
redova bez potrebe.

### Korak 4, financials

Redovi čiji MB nije u `companies` setu preskaču se za `financials`, broj se prijavljuje.
Isti diff pristup, batch 1000, `on conflict (maticni_broj, godina)`.

APR daje samo poslednju godinu. Stari redovi u `financials` se **ne brišu**, po
pravilu „upsert, nikad delete pa insert" iz `CLAUDE.md`.

### Korak 5, istorija

Svi FI redovi, uključujući siročiće, idu u `financials_history` sa tekućim
`datum_preseka`. Append only. Uz `--force` se prvo brišu redovi za taj datum,
da se arhiva ne duplira.

### Korak 6, zatvaranje

Red u `snapshots` se upisuje tek na kraju, posle uspešnog upserta. Time red u toj
tabeli znači „presek uspešno obrađen", što je tačno semantika koju idempotencija
traži: prekid u pola posla ne ostavlja lažan marker.

Zatim `refresh_all_stats()` preko `rpc`, pa izveštaj.

---

## Zaštita pred upis

| Provera | Prag | Ponašanje |
|---|---|---|
| Odstupanje broja firmi od prethodnog preseka | 5% | Prekid sa objašnjenjem, osim uz `--force` |
| Udeo preskočenih redova (bez MB, neparsiv datum) | 1% | Prekid, uz prvih 10 primera |
| `DatumPreseka` nije noviji od poslednjeg u `snapshots` | — | Prekid, osim uz `--force` |

Prve dve traži `CLAUDE.md` u sekciji „Radni proces". Jeftine su i sprečavaju da
pokvaren APR odgovor pregazi bazu.

---

## Rukovanje greškama

| Situacija | Postupak |
|---|---|
| Mrežna greška ili timeout | 3 pokušaja, eksponencijalni backoff, pa exit 1 sa jasnom porukom |
| TLS greška | Exit 1. Poruka upućuje na `scripts/certs/`. Nikad se ne isključuje provera |
| Neispravan pojedinačni red | Preskače se, broji se, prvih 10 primera se ispisuje. Prag iz tabele gore |
| Greška u batch upsertu | Prijavljuje se batch i opseg, prekid. Bez delimičnog „uspeha" |
| `refresh_all_stats()` padne | Exit 1. Podaci su već upisani; ponovno pokretanje uz `--force` je bezbedno |
| Temp fajlovi | Brišu se u `finally`, i na uspehu i na grešci |

---

## Memorija

Setovi se obrađuju jedan po jedan, referenca se oslobađa pre sledećeg. Očekivani vrh
je oko 1,5 GB pri parsiranju `companies` uz `Map` postojećeg stanja, pošto oba seta
imaju blizu 57 MB sirovog JSON-a.

Pokreće se sa `npx tsx scripts/ingest.ts`, kako plan i traži. Uz to postoji i
`npm run ingest`, koji prosleđuje `--max-old-space-size=4096` za slučaj da podrazumevani
heap ne bude dovoljan na slabijem runneru.

---

## Šifarnici

`scripts/seed-sifarnici.ts` puni obe tabele iz statičkih JSON fajlova, offline i
deterministički.

**`nace_codes`** iz `scripts/data/nace-2010.json`, polja `sifra`, `naziv`, `sektor`.

Izvor je pronađen i proveren: Republički zavod za statistiku,
`https://www.stat.gov.rs/media/2620/klasifikacija-delatnosti-2010-puni-nazivi.xls`,
zvanična Klasifikacija delatnosti 2010 sa punim nazivima.

Izmereno nad fajlom: 997 redova u četiri nivoa (21 sektor slovom, 88 oblasti,
219 grupa, **615 četvorocifrenih šifara**). Sektor se dodeljuje šifri praćenjem
poslednjeg viđenog slova pri prolasku kroz redove.

**Pokrivenost je potpuna:** svih 571 šifara koje se pojavljuju u APR setu postoji u
ovom fajlu, nedostaje nijedna. Test „svaka šifra delatnosti iz companies postoji u
nace_codes" prolazi.

Nazivi su ćirilicom i transliterišu se u latinicu pri konverziji. Konverzija je
jednokratna: `.xls` se pretvori u JSON i JSON se komituje, tako da ni ingest ni
seed nikad ne zavise od dostupnosti sajta RZS-a.

**`municipalities`** iz `scripts/data/opstine.json`, oko 190 redova, generisan
jednom iz APR `companies` seta: `sifra` i `naziv_cir` iz podataka, `naziv_lat`
transliteracijom, `okrug` `null`.

Ingest prijavljuje šifru opštine ili delatnosti koje nema u šifarniku, kao
upozorenje, ne kao grešku.

---

## Testovi

`tests/normalize.test.ts` piše se prvi, po TDD-u. Pokriva:

- transliteraciju svih ćiriličnih slova, uključujući `љ њ џ ђ ћ ж ч ш`
- `slugify`: srpska latinična slova u ASCII, nealfanumeričko u crticu, višestruke
  crtice u jednu, ograničenje 80 karaktera pre matičnog broja
- `normalizeIme`: lowercase, bez interpunkcije
- `trimMb`: razmaci sa oba kraja, prazan ulaz

`tests/ingest.test.ts`, integracioni, samo čita bazu:

- broj firmi veći od 100.000
- nema duplikata slugova
- nema reda bez `maticni_broj`
- nijedna vrednost `poslovno_ime_norm` nema velika slova ni interpunkciju
- svaka šifra delatnosti iz `companies` postoji u `nace_codes`

---

## Uslov završetka

- Ingest prošao dva puta zaredom, drugi put ispisuje `presek već obrađen`
- Svi testovi zeleni
- `companies`: **133.634** reda
- `financials`: **116.847** redova, tj. 123.360 minus 6.513 siročića
- `financials_history`: **123.360** redova za presek `2026-07-31`
- `nace_codes`: 615 redova, `municipalities`: 192 reda
- Sva tri `.gz` fajla u Storage bucketu `snapshots`
- `snapshots` ima red za `2026-07-31` sa tačnim brojevima
- `refresh_all_stats()` prošao, MV-ovi popunjeni

Brojevi su izmereni nad presekom `2026-07-31`. Za kasnije preseke očekuje se
odstupanje unutar 5%, što je i prag zaštitne provere.

---

## Van opsega

PIB iz NBS-a (Sesija 4), GitHub Actions workflow (Sesija 10), bilo kakva izmena šeme,
parsiranje NGO seta, `okrug` u `municipalities`.
