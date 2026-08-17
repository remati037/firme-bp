import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { marked } from "marked";

/**
 * Blog: članci su Markdown u repou, bez CMS-a i bez baze (odluka #4 iz
 * koordinacije). Commit je objavljivanje.
 *
 * Zašto ne u bazi: šema je zaključana, a tekst koji se menja jednom mesečno
 * ne zaslužuje migraciju. Uz to, članak u gitu ima istoriju izmena i pregled
 * pre objave, što tabela nema.
 *
 * Sadržaj se čita sa diska u vreme builda. Sve rute koje ovo koriste su
 * statične, pa fs poziv nikad ne pada na zahtev korisnika.
 */

const DIREKTORIJUM = path.join(process.cwd(), "content", "blog");

/** Reči u minutu za srpski tekst; koristi se samo za "N min čitanja". */
const RECI_U_MINUTU = 200;

export const KATEGORIJE = ["delatnosti", "opstine", "analize"] as const;
export type Kategorija = (typeof KATEGORIJE)[number];

export const NAZIV_KATEGORIJE: Record<Kategorija, string> = {
  delatnosti: "Delatnosti",
  opstine: "Opštine",
  analize: "Analize",
};

export type Clanak = {
  slug: string;
  naslov: string;
  /** ISO datum, npr. "2026-08-12". */
  datum: string;
  kategorija: Kategorija;
  excerpt: string;
  autor: string;
  /** Kratka oznaka na tipografskom coveru, npr. "NS" ili "4690". */
  glif: string;
  /** Klasa boje covera iz prototipa: c-teal, c-slate, c-rose, c-amber, c-indigo, c-sky. */
  boja: string;
  /** Sirov Markdown, bez frontmatter-a. */
  telo: string;
  minutaCitanja: number;
};

function jeKategorija(v: unknown): v is Kategorija {
  return typeof v === "string" && (KATEGORIJE as readonly string[]).includes(v);
}

function minutaCitanja(telo: string): number {
  const reci = telo.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(reci / RECI_U_MINUTU));
}

/**
 * Frontmatter se proverava strogo i puca glasno.
 *
 * Članak sa pogrešnom kategorijom ili bez datuma bi se tiho izgubio iz liste
 * ili srušio poredak. Pošto se sadržaj objavljuje commit-om, greška mora da
 * padne na buildu, dok je autor još uz tekst.
 */
export function parsirajClanak(imeFajla: string, sirovo: string): Clanak {
  const { data, content } = matter(sirovo);
  const slug = imeFajla.replace(/\.md$/, "");
  const gde = `content/blog/${imeFajla}`;

  const naslov = String(data.naslov ?? "").trim();
  if (!naslov) throw new Error(`${gde}: nedostaje "naslov" u frontmatter-u.`);

  const datum = String(data.datum ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    throw new Error(`${gde}: "datum" mora biti oblika GGGG-MM-DD, dobijeno "${datum}".`);
  }

  if (!jeKategorija(data.kategorija)) {
    throw new Error(
      `${gde}: "kategorija" mora biti jedna od: ${KATEGORIJE.join(", ")}, dobijeno "${String(data.kategorija)}".`,
    );
  }

  const excerpt = String(data.excerpt ?? "").trim();
  if (!excerpt) throw new Error(`${gde}: nedostaje "excerpt".`);

  return {
    slug,
    naslov,
    datum,
    kategorija: data.kategorija,
    excerpt,
    autor: String(data.autor ?? "Biznis priče").trim(),
    glif: String(data.glif ?? "BP").trim(),
    boja: String(data.boja ?? "c-indigo").trim(),
    telo: content,
    minutaCitanja: minutaCitanja(content),
  };
}

let kes: Clanak[] | null = null;

/** Svi članci, najnoviji prvi. Čita se jednom po procesu. */
export function sviClanci(): Clanak[] {
  if (kes) return kes;

  let imena: string[];
  try {
    imena = readdirSync(DIREKTORIJUM).filter((f) => f.endsWith(".md"));
  } catch {
    // Blog bez ijednog članka nije greška — rute samo prikažu praznu listu.
    return [];
  }

  const clanci = imena
    .map((ime) => parsirajClanak(ime, readFileSync(path.join(DIREKTORIJUM, ime), "utf8")))
    // Isti datum na dva članka ne sme da da nasumičan poredak, pa slug razrešava.
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.slug.localeCompare(b.slug));

  kes = clanci;
  return clanci;
}

export function clanakPoSlugu(slug: string): Clanak | null {
  return sviClanci().find((c) => c.slug === slug) ?? null;
}

export function clanciKategorije(kategorija: Kategorija): Clanak[] {
  return sviClanci().filter((c) => c.kategorija === kategorija);
}

/**
 * Srodni članci: prvo iz iste kategorije, pa najnoviji ostali do tri.
 * Sam članak se nikad ne predlaže.
 */
export function srodniClanci(clanak: Clanak, koliko = 3): Clanak[] {
  const ostali = sviClanci().filter((c) => c.slug !== clanak.slug);
  const ista = ostali.filter((c) => c.kategorija === clanak.kategorija);
  const razlicita = ostali.filter((c) => c.kategorija !== clanak.kategorija);
  return [...ista, ...razlicita].slice(0, koliko);
}

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const esc = (t: string): string => t.replace(/[&<>"]/g, (z) => ESCAPE[z]);

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Dve custom komponente iz odobrenog prototipa, pisane kao blok direktive:
 *
 *   :::stat
 *   Novi Sad, presek 31.07.2026
 *   14.203 firme
 *   ukupan prihod 1.842 mrd RSD
 *   :::
 *
 *   :::proveri
 *   [NIS a.d. Novi Sad](/firma/nis-ad-novi-sad-20084693)
 *   :::
 *
 * `proveri` je nosivi deo interne strukture linkova (SEO.md §4): svaki članak
 * mora da vodi na stranice firmi o kojima govori, jer interno linkovanje je
 * jedina poluga koja realno pomera indeksiranje 133.634 stranice.
 */
const DIREKTIVA = /^:::(stat|proveri)[ \t]*\n([\s\S]*?)^:::[ \t]*$/gm;

function statBoks(telo: string): string {
  const [labela = "", vrednost = "", detalj = ""] = telo
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  return [
    '<div class="stat-box">',
    `<div class="l">${esc(labela)}</div>`,
    `<div class="v">${esc(vrednost)}</div>`,
    detalj ? `<div class="d">${esc(detalj)}</div>` : "",
    "</div>",
  ].join("");
}

function proveriBoks(telo: string): string {
  const veze = [...telo.matchAll(LINK)].map(
    ([, tekst, adresa]) =>
      `<a href="${esc(adresa)}">${esc(tekst)} <span class="go">→</span></a>`,
  );

  if (!veze.length) return "";

  return [
    '<div class="data-callout">',
    '<div class="h">Podaci iz ovog teksta, na stranicama firmi</div>',
    ...veze,
    "</div>",
  ].join("");
}

/** Markdown u HTML, sa custom direktivama razrešenim pre parsiranja. */
export function uHtml(markdown: string): string {
  const saDirektivama = markdown.replace(DIREKTIVA, (_, vrsta: string, telo: string) =>
    vrsta === "stat" ? statBoks(telo) : proveriBoks(telo),
  );

  return marked.parse(saDirektivama, { async: false });
}

/**
 * Prvi pasus je lead i prikazuje se krupnije, u zaglavlju članka (prototip
 * clanak.html). Ako tekst počinje naslovom ili direktivom, leada nema i sve
 * ide u telo — bolje bez leada nego sa naslovom istrgnutim iz konteksta.
 */
export function razdvojLead(telo: string): { lead: string | null; ostatak: string } {
  const blokovi = telo.trim().split(/\n\s*\n/);
  const prvi = blokovi[0]?.trim() ?? "";

  if (!prvi || prvi.startsWith("#") || prvi.startsWith(":::")) {
    return { lead: null, ostatak: telo };
  }

  return { lead: prvi, ostatak: blokovi.slice(1).join("\n\n") };
}

/** Sve interne adrese na koje članak upućuje, bez duplikata. */
export function interneVezeIzClanka(clanak: Clanak): string[] {
  return [
    ...new Set(
      [...clanak.telo.matchAll(LINK)].map(([, , adresa]) => adresa).filter((a) => a.startsWith("/")),
    ),
  ];
}

/** Sve firme na koje članak upućuje — koristi se za proveru internih linkova. */
export function slugoviFirmiIzClanka(clanak: Clanak): string[] {
  return [...clanak.telo.matchAll(LINK)]
    .map(([, , adresa]) => adresa)
    .filter((a) => a.startsWith("/firma/"))
    .map((a) => a.slice("/firma/".length));
}
