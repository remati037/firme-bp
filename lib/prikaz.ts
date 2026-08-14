/**
 * Pomoćnici za prikaz podataka iz baze.
 *
 * APR piše opštine velikim slovima ("NOVI SAD", "STARI GRAD"), a poslovna
 * imena mešano. Ovde se to dovodi u oblik za čitanje, bez menjanja podataka
 * u bazi.
 */

import { titleCase } from "./skrati-ime";

/**
 * Skraćeno ime za H1, title i OG sliku.
 *
 * Prvi izbor je kolona `poslovno_ime_kratko` (migracija 003, popunjena za svih
 * 133.634 firmi). Fallback je skraćivanje u kodu, za slučaj da red nema kratko
 * ime — nikad se ne vraća prazan string, jer bi stranica ostala bez H1.
 */
export function kratkoIme(firma: {
  poslovno_ime: string;
  poslovno_ime_kratko?: string | null;
  opstina?: string | null;
}): string {
  const izBaze = firma.poslovno_ime_kratko?.trim();
  if (izBaze) return izBaze;

  return skratiUKodu(firma.poslovno_ime);
}

/** Rezervno skraćivanje: 45 znakova, sečeno na granici reči, Title Case. */
export function skratiUKodu(ime: string, maxDuzina = 45): string {
  const ocisceno = (ime ?? "").replace(/\s{2,}/g, " ").trim();
  if (!ocisceno) return "";

  const naslovljeno = titleCase(ocisceno);
  if (naslovljeno.length <= maxDuzina) return naslovljeno;

  const odsecak = naslovljeno.slice(0, maxDuzina);
  const poslednjiRazmak = odsecak.lastIndexOf(" ");
  const rez = poslednjiRazmak > 12 ? odsecak.slice(0, poslednjiRazmak) : odsecak;
  return rez.replace(/[\s,.\-–]+$/, "");
}

/** "NOVI SAD" → "Novi Sad", "PALILULA (BEOGRAD)" → "Palilula (Beograd)". */
export function imeOpstine(opstina: string | null | undefined): string {
  const ocisceno = opstina?.trim();
  if (!ocisceno) return "";

  // titleCase diže slovo posle razmaka i crtice, ali ne i posle zagrade,
  // a APR gradske opštine piše baš tako: "PALILULA (BEOGRAD)".
  return titleCase(ocisceno).replace(/\(([a-zčćšžđ])/g, (_, slovo: string) => `(${slovo.toUpperCase()}`);
}

/** "4690 — Trgovina na veliko", ili samo šifra ako naziv nedostaje. */
export function nazivDelatnosti(
  sifra: string | null | undefined,
  naziv: string | null | undefined,
): string {
  if (!sifra) return naziv?.trim() ?? "";
  const ocisceno = naziv?.trim();
  return ocisceno ? `${sifra} — ${ocisceno}` : sifra;
}

/** Slug opštine za rutu `/grad/[opstina]`: "NOVI SAD" → "novi-sad". */
export function slugOpstine(opstina: string | null | undefined): string {
  return (opstina ?? "")
    .toLowerCase()
    .replace(/č|ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Status firme u jednu od četiri kategorije, za badge i boju. */
export type VrstaStatusa = "aktivan" | "likvidacija" | "stecaj" | "neutralno";

export function vrstaStatusa(
  status: string | null | undefined,
  statusAktivan?: boolean | null,
): VrstaStatusa {
  const s = (status ?? "").toLowerCase();
  if (s.includes("stečaj") || s.includes("stecaj")) return "stecaj";
  if (s.includes("likvidacij")) return "likvidacija";
  if (statusAktivan || s.includes("aktivan")) return "aktivan";
  return "neutralno";
}
