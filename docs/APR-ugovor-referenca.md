# APR — referenca za pregovore o isporuci podataka

Beleške iz javno dostupnog ugovora CompanyWall-a sa APR-om (objavljen na sajtu
companywall.rs), kao osnova za naše pregovore. Nisu pravni savet — za ugovor
angažovati advokata.

## Izvor

- **Ugovor:** „Ugovor o preuzimanju i korišćenju prepisa baze podataka iz
  finansijskih izveštaja" — APR (Brankova 25, Beograd) i CompanyWall DOO
  Beograd, **Br. 08-3-39/17, 12.05.2017**.
- **Osnov:** čl. 43 st. 5 Odluke o naknadama za poslove registracije i druge
  usluge APR (Sl. glasnik RS 119/2013… 32/2016).

## Predmet ugovora (šta CompanyWall dobija)

- **Cela baza redovnih godišnjih finansijskih izveštaja** (2016. i naredne
  godine): svi podaci iz Bilansa stanja i Bilansa uspeha za potpune i računski
  tačne izveštaje.
- Obveznici: **privredna društva, zadruge, ustanove koje obavljaju delatnost
  radi sticanja dobiti i preduzetnici**.
- Plus: osnovna identifikacija (poslovno ime, sedište, matični broj), veličina,
  broj zaposlenih, šifra i opis pretežne delatnosti, šifra opštine.

## Model isporuke

- **Inicijalni prepis** (stanje na dogovoreni dan) + **nedeljni presek** dok
  traje sezona obrade izveštaja za datu godinu.
- Dostava preko **FTP servera APR-a**, sa posebnim korisničkim nalogom i
  lozinkom (čl. 4).
- Naknada se obračunava **po ukupnom broju podataka** (čl. 5), po tarifi iz
  Odluke o naknadama; račun do 5. u mesecu za prethodni mesec.

## Cena (javno objavljeno od strane CompanyWall-a)

- **2024: 5.252.670,40 RSD godišnje** (≈ 44.900 EUR po kursu 117 RSD/EUR).
- To je red veličine koji bonitetna kuća plaća za kompletan set (sva polja BS+BU,
  sve vrste obveznika, nedeljno ažuriranje).

## Ključne klauzule

| Član | Sadržaj | Šta znači za nas |
|---|---|---|
| **8** | Korisnik ne sme da **ustupa bazu trećim licima**, ali kad podatke koristi za **izradu sopstvenog dokumenta ili drugog proizvoda, dužan je da navede APR kao izvor**. | Model „sopstveni proizvod + APR kao izvor" (upravo to javno radi CompanyWall) = dozvoljen način za naš sajt. Naš futer već navodi APR. |
| **7** | Blanko sopstvena menica sa klauzulom „bez protesta" + menično pismo kao obezbeđenje. | Za mali projekat ozbiljna obaveza — razmotriti pre potpisa. |
| **13** | Ugovor na neodređeno vreme; otkaz uz 15 dana; APR može jednostrano raskinuti pri zloupotrebi ili neplaćanju. | |
| **10** | APR odgovara za istovetnost podataka sa izvorom u Registru FI. | |

## Naša ponuda iz upita (16.08.2026, jednokratna preuzimanja)

| Podaci | RSD | ≈ EUR |
|---|---|---|
| Finansije — istorija 5 god (133k × 6 polja × 5) | 4.000.000 | ≈ 34.200 |
| Finansije — istorija 10 god | 8.000.000 | ≈ 68.400 |
| Vlasnička struktura + zastupnici (aktuelni) | 4.700.000 | ≈ 40.200 |
| Stvarni vlasnici UBO (aktuelni) | 6.000.000 | ≈ 51.300 |
| Preduzetnici (~386k, aktuelni) | 11.600.000 | ≈ 99.100 |

**Jednokratno:** 1 RSD po podatku, **vrednost „0" se NAPLAĆUJE** kao podatak.
Plaća se po predračunu; istorijski podaci vlasnika/UBO/preduzetnika — dodatna analiza.

## Alternativa: redovno preuzimanje po povoljnijim naknadama (KLJUČNO)

### a) Prepis baze finansijskih izveštaja — 0,60 RSD po podatku

- **„Podatak" = popunjeno polje različito od nule** — „0" se NE naplaćuje.
- Obuhvata najmanje sve redovne godišnje FI (društva, zadruge, ustanove,
  preduzetnici), bilans stanja + bilans uspeha.
- Ilustracija APR: svi podaci BS+BU za sve obveznike **2024. ≈ 4,8M RSD**
  (to je za CELI obrazac sa ~100+ polja; naša 4–5 polja → srazmerno manje).

**Naša procena za 4–5 polja × 123k društava sa izveštajem:**
~123k × 5 × 0,60 ≈ **370k RSD/god**; za istoriju 2021–2024 ≈ **1,5M RSD**
(umesto 3,2M po jednokratnom modelu). Za 3 polja još manje (~0,9M).

### b) PLWS veb-servis (statusni registri / poslovni podaci)

- **Inicijalni set: 7 RSD po subjektu** (nezavisno od broja grupa podataka!)
- **Mesečni set promena: 32 RSD po subjektu** koji je imao promenu
- Fiksna mesečna naknada: **7.500 RSD**
- Ilustracija APR: svi aktivni subjekti (133k + 386k) → inicijalno ~3,6M RSD;
  mesečno ~600–900k RSD (jer se naplaćuju samo subjekti sa promenama).

**Za nas (samo privredna društva, 133k):**
- Inicijalni set ≈ **133k × 7 = 931k RSD** — ako PLWS uključuje grupe
  „vlasnici/zastupnici/stvarni vlasnici", to je daleko jeftinije od
  jednokratnih 4,7M + 6,0M! **Vredi pitati koje grupe podataka nudi.**
- Mesečno: ~32 RSD × broj društava sa promenama (procena 10–20k/mes)
  ≈ 320–640k RSD/mes — za v1 preskupo, ali inicijalni set je jednokratan.

### c) Redistribucija — POTVRĐENO (odgovor APR, 16.08.2026)

> „Корисник преузете податке може користити за сопствене потребе, али их не
> може даље умножавати нити **комерцијално** дистрибуирати. Ако их користи за
> израду **сопственог производа**, дужан је да Агенцију означи као извор."

- **Naš slučaj odgovara**: sopstveni proizvod (sajt), bez komercijalne
  distribucije, APR kao izvor u futeru ✅ — isto kao CompanyWall (čl. 8).
- Ugovor se zaključuje **samo sa pravnim licima sa sedištem u RS**,
  uz obezbeđenje plaćanja (menica ili avans).

## Cilj pregovora (revidirano)

1. **Istorija FI 2021–2024** po modelu „prepis baze" (0,60 RSD, bez nula),
   samo naša polja, samo društva sa izveštajem → cilj ≈ 1–1,5M RSD.
2. **PLWS**: pitati koje su grupe podataka dostupne (da li vlasnici/zastupnici/
   stvarni vlasnici); ako jesu → inicijalni set za društva ≈ 931k RSD
   (umesto 10,7M jednokratno za oba seta). Mesečno ažuriranje preskočiti u v1.
3. Redistribucija: već potvrđena — samo potvrditi ugovornu klauzulu.

## Alternativa bez kupovine

- Istoriju gradimo unapred kroz postojeću mesečnu arhivu (`financials_history`).
- Prošle godine (2020–2024) ostaju van sajta dok se ne odluči o kupovini.
