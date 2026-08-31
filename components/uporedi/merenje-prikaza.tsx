"use client";

import { useEffect, useRef } from "react";

import { dogadjaj } from "@/lib/analitika";

/**
 * Prijavljuje da je poređenje prikazano, sa brojem firmi u njemu.
 *
 * Ne renderuje ništa. Postoji da bi se odgovorilo na jedno pitanje: ide li iko
 * preko dve firme. Od tog odgovora zavisi da li četvrta kolona uopšte treba da
 * postoji i da li nalozi imaju smisla.
 *
 * `kljuc` je putanja poređenja — pri klijentskoj navigaciji sa jednog
 * poređenja na drugo komponenta se ne montira ponovo, pa bi bez njega drugi
 * prikaz ostao neprijavljen.
 *
 * Zaštita kroz `ref` je tu jer StrictMode u razvoju pušta efekat dvaput. U
 * produkciji bi se to ne bi desilo, ali brojka od koje zavisi odluka o
 * nalozima ne sme da zavisi od te pretpostavke: ref preživljava oba prolaza
 * istog instanciranja, a resetuje se na pravom učitavanju stranice.
 */
export function MerenjePrikaza({ brojFirmi, kljuc }: { brojFirmi: number; kljuc: string }) {
  const poslato = useRef<string | null>(null);

  useEffect(() => {
    if (poslato.current === kljuc) return;
    poslato.current = kljuc;
    dogadjaj("poredjenje_prikazano", { broj_firmi: brojFirmi });
  }, [brojFirmi, kljuc]);

  return null;
}
