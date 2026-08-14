import { cirilicaULatinicu } from "./transliterate";

/** Srpska latinična slova u ASCII, po pravilu 2 iz CLAUDE.md. */
const U_ASCII: Record<string, string> = {
  č: "c", ć: "c", š: "s", ž: "z", đ: "dj",
};

const MAX_OSNOVA = 80;

function uAscii(tekst: string): string {
  return cirilicaULatinicu(tekst)
    .toLowerCase()
    .replace(/[čćšžđ]/g, (znak) => U_ASCII[znak]);
}

/**
 * Matični broj iz APR ključa. U financial-statements setu 11.099 ključeva ima
 * razmak na kraju, pa se trimuje pre svake druge obrade.
 * Vraća null za sve što nije tačno osam cifara.
 */
export function trimMb(vrednost: string): string | null {
  const ocisceno = String(vrednost ?? "").trim();
  return /^\d{8}$/.test(ocisceno) ? ocisceno : null;
}

/** Ime za pg_trgm pretragu: mala slova, ASCII, bez interpunkcije. */
export function normalizeIme(ime: string): string {
  return uAscii(String(ime ?? ""))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** slug = slugify(poslovno_ime) + "-" + maticni_broj, osnova najviše 80 znakova. */
export function slugify(ime: string, maticniBroj: string): string {
  const osnova = uAscii(String(ime ?? ""))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_OSNOVA)
    .replace(/-+$/, ""); // sečenje na 80 može da ostavi crticu na kraju

  return osnova ? `${osnova}-${maticniBroj}` : maticniBroj;
}

/** APR šalje 100% ISO datuma, ali se svejedno proverava da datum stvarno postoji. */
export function parseDatum(vrednost: unknown): string | null {
  if (typeof vrednost !== "string") return null;

  const ocisceno = vrednost.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ocisceno)) return null;

  // toISOString vraća isti string samo ako datum stvarno postoji (2026-02-31 ne)
  const datum = new Date(`${ocisceno}T00:00:00.000Z`);
  if (Number.isNaN(datum.getTime())) return null;

  return datum.toISOString().slice(0, 10) === ocisceno ? ocisceno : null;
}
