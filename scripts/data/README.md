# Statički podaci

## nace-2010.json

615 četvorocifrenih šifara delatnosti, sa nazivom i sektorom.

Izvor: Republički zavod za statistiku, Klasifikacija delatnosti 2010, puni nazivi.
`https://www.stat.gov.rs/media/2620/klasifikacija-delatnosti-2010-puni-nazivi.xls`

Original je legacy `.xls` sa četiri nivoa (21 sektor slovom, 88 oblasti, 219 grupa,
615 šifara). U repo ulaze samo četvorocifrene šifre, jer se samo one upisuju u APR.
Sektor se dodeljuje praćenjem poslednjeg viđenog slova pri prolasku kroz redove.
Nazivi su transliterisani iz ćirilice.

Provereno: pokriva svih 571 šifru koje se pojavljuju u APR `companies` setu.

## opstine.json

192 opštine, izvedene iz APR `companies` seta (`SifraOpstine`, `NazivOpstine`).
`naziv_lat` je transliteracija, `naziv_cir` je original.

`okrug` je `null`. APR ga ne daje, rutiranje ga ne koristi u v1. Popunjava se iz
zvaničnog izvora kad zatreba, ne procenom.

Oba fajla se generišu jednom i komituju, da seed radi offline i deterministički.
Postupak je opisan u planu, Zadatak 4.
