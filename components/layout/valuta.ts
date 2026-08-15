"use client";

import { useSyncExternalStore } from "react";

import { formatNovac, type Valuta } from "@/lib/format";

/**
 * Zajednički klijentski sloj za izbor valute.
 *
 * Dva potrošača: `CurrencyToggle` (menja izbor i prepisuje serverski HTML) i
 * komponente koje same renderuju iznose posle hidratacije, npr. tabela
 * poređenja — njih prepisivanje DOM-a ne bi stiglo jer nastaju kasnije.
 */

export const KLJUC_VALUTA = "valuta";
export const DOGADJAJ_VALUTA = "valuta-promena";

export function procitajValutu(): Valuta {
  try {
    return localStorage.getItem(KLJUC_VALUTA) === "EUR" ? "EUR" : "RSD";
  } catch {
    return "RSD";
  }
}

export function upisiValutu(valuta: Valuta) {
  try {
    localStorage.setItem(KLJUC_VALUTA, valuta);
  } catch {
    // Privatni režim: izbor važi do kraja sesije.
  }
  window.dispatchEvent(new CustomEvent(DOGADJAJ_VALUTA, { detail: valuta }));
}

/** Prepisuje sve serverski renderovane iznose (`components/ui/novac.tsx`). */
export function primeniNaDom(valuta: Valuta) {
  for (const cvor of document.querySelectorAll<HTMLElement>("[data-novac]")) {
    const dinara = Number(cvor.dataset.dinara);
    if (!Number.isFinite(dinara)) continue;
    cvor.textContent = formatNovac(dinara, valuta, {
      kompaktno: cvor.dataset.kompaktno === "1",
      nulaJePodatak: true,
    });
  }
}

function pretplati(obavesti: () => void): () => void {
  window.addEventListener(DOGADJAJ_VALUTA, obavesti);
  // Promena iz drugog taba.
  window.addEventListener("storage", obavesti);
  return () => {
    window.removeEventListener(DOGADJAJ_VALUTA, obavesti);
    window.removeEventListener("storage", obavesti);
  };
}

/**
 * Trenutna valuta. Serverski snapshot je uvek RSD, isto što je u HTML-u —
 * inače bi se hidratacija razlikovala od poslatog markupa.
 */
export function useValuta(): Valuta {
  return useSyncExternalStore(pretplati, procitajValutu, () => "RSD" as Valuta);
}
