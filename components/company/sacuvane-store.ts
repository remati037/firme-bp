"use client";

import { useSyncExternalStore } from "react";

/**
 * Lista sačuvanih firmi (D2), u localStorage-u ovog uređaja.
 *
 * `useSyncExternalStore` je ovde pravi API: localStorage je spoljni izvor
 * podataka, a serverski snapshot je prazna lista, pa se HTML sa servera i prvi
 * klijentski render poklapaju.
 *
 * Snapshot se kešira po sirovom JSON stringu — bez toga bi svaki poziv vratio
 * novi niz i React bi renderovao u krug.
 */

export const KLJUC_SACUVANE = "sacuvane-firme";
export const DOGADJAJ_SACUVANE = "sacuvane-promena";

export type SacuvanaFirma = { slug: string; ime: string };

const PRAZNO: SacuvanaFirma[] = [];

let kesiranSirov: string | null = null;
let kesiranaLista: SacuvanaFirma[] = PRAZNO;

function sirovo(): string {
  try {
    return localStorage.getItem(KLJUC_SACUVANE) ?? "";
  } catch {
    return "";
  }
}

function parsiraj(tekst: string): SacuvanaFirma[] {
  if (!tekst) return PRAZNO;
  try {
    const lista: unknown = JSON.parse(tekst);
    if (!Array.isArray(lista)) return PRAZNO;
    return lista.filter(
      (r): r is SacuvanaFirma =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as SacuvanaFirma).slug === "string" &&
        typeof (r as SacuvanaFirma).ime === "string",
    );
  } catch {
    return PRAZNO;
  }
}

function snapshot(): SacuvanaFirma[] {
  const tekst = sirovo();
  if (tekst !== kesiranSirov) {
    kesiranSirov = tekst;
    kesiranaLista = parsiraj(tekst);
  }
  return kesiranaLista;
}

function serverSnapshot(): SacuvanaFirma[] {
  return PRAZNO;
}

function pretplati(obavesti: () => void): () => void {
  window.addEventListener(DOGADJAJ_SACUVANE, obavesti);
  // Promena iz drugog taba.
  window.addEventListener("storage", obavesti);
  return () => {
    window.removeEventListener(DOGADJAJ_SACUVANE, obavesti);
    window.removeEventListener("storage", obavesti);
  };
}

export function useSacuvane(): SacuvanaFirma[] {
  return useSyncExternalStore(pretplati, snapshot, serverSnapshot);
}

/** Dodaje ili uklanja firmu iz liste. */
export function prebaciSacuvanu(firma: SacuvanaFirma) {
  const lista = snapshot();
  const ima = lista.some((f) => f.slug === firma.slug);
  const nova = ima ? lista.filter((f) => f.slug !== firma.slug) : [firma, ...lista];

  try {
    localStorage.setItem(KLJUC_SACUVANE, JSON.stringify(nova));
  } catch {
    // Privatni režim: dugme radi vizuelno, samo se ne pamti.
  }
  window.dispatchEvent(new CustomEvent(DOGADJAJ_SACUVANE));
}
