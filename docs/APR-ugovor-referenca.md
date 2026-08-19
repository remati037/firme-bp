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

Cena je proporcionalna broju podataka (1 RSD/podatak; vrednost „0" se naplaćuje).
2025. već imamo besplatno iz open data — istorija treba samo 2021–2024.

## Cilj pregovora

- **Godišnji ugovor po modelu CompanyWall-a**, ali sa smanjenim skupom polja
  (prihodi, neto rezultat, kapital, imovina, zaposleni) i **samo za društva koja
  su predala izveštaj** → procena reda **600–800k RSD godišnje (≈ 5–7k EUR)**.
- Tražiti **istoriju 2021–2024** po istom modelu (ne duplo plaćati 2025).
- Pismeno potvrditi klauzulu člana 8 (sopstveni proizvod + APR kao izvor).

## Alternativa bez kupovine

- Istoriju gradimo unapred kroz postojeću mesečnu arhivu (`financials_history`).
- Prošle godine (2020–2024) ostaju van sajta dok se ne odluči o kupovini.
