/**
 * Latinica u ćirilicu.
 *
 * Koristi se samo za dve stvari na stranici firme (SEO.md §1.8):
 *  - vidljivu liniju "Ćirilica: ПОСЛОВНО ИМЕ ДОО, Нови Сад"
 *  - `alternateName` u Organization JSON-LD
 *
 * NIJE osnova za drugu verziju sajta. Ćirilična verzija bi po Google-ovoj
 * definiciji bila duplikat i prepolovila crawl budžet.
 *
 * Suprotan smer (ćirilica u latinicu) je u `lib/transliterate.ts`.
 */

/** Digrafi idu prvi, inače bi "nj" postalo "нј" umesto "њ". */
const DIGRAFI: [RegExp, string][] = [
  [/Nj/g, "Њ"],
  [/NJ/g, "Њ"],
  [/nj/g, "њ"],
  [/Lj/g, "Љ"],
  [/LJ/g, "Љ"],
  [/lj/g, "љ"],
  [/Dž/g, "Џ"],
  [/DŽ/g, "Џ"],
  [/dž/g, "џ"],
];

const SLOVA: Record<string, string> = {
  A: "А", B: "Б", V: "В", G: "Г", D: "Д", Đ: "Ђ", E: "Е", Ž: "Ж", Z: "З",
  I: "И", J: "Ј", K: "К", L: "Л", M: "М", N: "Н", O: "О", P: "П", R: "Р",
  S: "С", T: "Т", Ć: "Ћ", U: "У", F: "Ф", H: "Х", C: "Ц", Č: "Ч", Š: "Ш",
  a: "а", b: "б", v: "в", g: "г", d: "д", đ: "ђ", e: "е", ž: "ж", z: "з",
  i: "и", j: "ј", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р",
  s: "с", t: "т", ć: "ћ", u: "у", f: "ф", h: "х", c: "ц", č: "ч", š: "ш",
};

const IMA_CIRILICE = /[Ѐ-ӿ]/;

/**
 * Prevodi latinično poslovno ime u ćirilično.
 *
 * Strana slova (Q, W, X, Y) ostaju kakva jesu — u imenima tipa "Xella" bi
 * transliteracija dala nečitljiv rezultat.
 */
export function latinicaUCirilicu(tekst: string): string {
  if (!tekst) return "";

  let rezultat = tekst;
  for (const [obrazac, zamena] of DIGRAFI) {
    rezultat = rezultat.replace(obrazac, zamena);
  }

  return [...rezultat].map((znak) => SLOVA[znak] ?? znak).join("");
}

/**
 * Ćirilični oblik imena za prikaz.
 *
 * APR šalje deo imena već ćirilicom (npr. „Акционарско друштво Електропривреда
 * Србије"). Takvo ime se ne dira — ono je original, a ne naša transliteracija.
 */
export function cirilicniOblik(poslovnoIme: string): string {
  if (!poslovnoIme) return "";
  return IMA_CIRILICE.test(poslovnoIme) ? poslovnoIme : latinicaUCirilicu(poslovnoIme);
}

/** Slova kojih u srpskoj latinici nema, pa za njih nema ni ćiriličnog para. */
const STRANA_SLOVA = /[QWXYqwxy]/;

/**
 * Ćirilični oblik samo kad je transliteracija čista.
 *
 * "ASYA GRADNJA DOO" bi dalo "АСYА ГРАДЊА ДОО" — mešano pismo koje ne pomaže
 * ni čitaocu ni pretrazi. U tom slučaju se linija „Ćirilica: ..." i
 * `alternateName` izostavljaju, umesto da se izmišlja transkripcija.
 */
export function cirilicniOblikIliNista(poslovnoIme: string): string | null {
  if (!poslovnoIme) return null;
  if (IMA_CIRILICE.test(poslovnoIme)) return poslovnoIme;
  if (STRANA_SLOVA.test(poslovnoIme)) return null;
  return latinicaUCirilicu(poslovnoIme);
}

/**
 * "СТАРИ ГРАД" → "Стари Град".
 *
 * `municipalities.naziv_cir` je u APR-u sav velikim slovima, a u rečenici
 * "Ćirilica: ..., Стари Град" to izgleda kao vika.
 */
export function naslovnoCirilica(tekst: string | null | undefined): string {
  if (!tekst) return "";
  return tekst
    .toLowerCase()
    .replace(/(^|[\s\-–/])(\p{L})/gu, (_, pre: string, slovo: string) => pre + slovo.toUpperCase());
}
