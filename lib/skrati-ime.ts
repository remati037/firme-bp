import { cirilicaULatinicu } from "./transliterate";

/**
 * Skraćeno poslovno ime za title, H1, slug i OG sliku.
 *
 * Pravila su iz SEO.md, sekcija 1.1. Razlog: prosečno poslovno ime ima 48
 * znakova, a 28,7 odsto ih ima preko 60, pa u title tagu ne ostaje mesta ni
 * za šta drugo.
 *
 * Pristup: ne skida se prefiks, nego se pravna forma koristi kao sidro, pa se
 * jezgro imena traži relativno u odnosu na nju. Uz to stoji tvrda zaštita koja
 * nikad ne pušta rezultat sastavljen samo od opisnih reči.
 */

// ============================================================================
// 1. Normalizacija pisma
// ============================================================================

/**
 * Ćirilični homoglifi: slova koja IZGLEDAJU kao latinična.
 *
 * Kritično: 2,3 odsto imena u APR setu (3.025 firmi) meša pisma, najčešće
 * unutar same pravne forme ("DОO" sa ćiriličnim О). Bez ovog koraka regex za
 * DOO ne pogađa i algoritam tiho vrati smeće.
 */
const HOMOGLIFI: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C",
  Т: "T", Х: "X", У: "Y", Ј: "J", І: "I", Ѕ: "S",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", ј: "j", і: "i",
};

const JE_CIRILICA = /[Ѐ-ӿ]/;

/**
 * Ime pisano ćirilicom se transliteriše celo. Ime pisano latinicom u koje se
 * potkralo koje ćirilično slovo popravlja se samo na tim mestima, da se ne
 * dira ostatak.
 */
export function normalizujPismo(tekst: string): string {
  let cirilicnih = 0;
  let latinicnih = 0;

  for (const znak of tekst) {
    if (JE_CIRILICA.test(znak)) cirilicnih++;
    else if (/[a-zA-ZčćšžđČĆŠŽĐ]/.test(znak)) latinicnih++;
  }

  if (cirilicnih === 0) return tekst;
  // Naša transliteracija, jer ispravno rešava digrafe: ЖАБАЉ -> ŽABALJ.
  if (cirilicnih > latinicnih) return cirilicaULatinicu(tekst);

  return [...tekst].map((znak) => HOMOGLIFI[znak] ?? cirilicaULatinicu(znak)).join("");
}

// ============================================================================
// 2. Statusni sufiksi
// ============================================================================

const STATUS =
  /[\s,\-–]*\b(u\s+likvidaciji|u\s+prinudnoj\s+likvidaciji|u\s+ste[čc]aju|u\s+restrukturiranju|u\s+ste[čc]ajnom\s+postupku|brisan[oa]?)\b.*$/i;

// ============================================================================
// 3. Pravne forme, sidra
// ============================================================================

const FORME: [RegExp, string][] = [
  [/dru[šs]tv[oa]\s+s\s*a?\s+ograni[čc]enom\s+odgovorno[šs][ćc]u/gi, "DOO"],
  [/\bd\s*\.?\s*o\s*\.?\s*o\s*\.?(?=\s|,|$)/gi, "DOO"],
  [/\bdoo\b/gi, "DOO"],
  [/\bd0{2}\b/gi, "DOO"], // tipfeler D00 u izvoru
  [/akcionarsk[oe]\s+dru[šs]tv[oa]/gi, "AD"],
  [/\ba\s*\.?\s*d\s*\.?(?=\s|,|$)/gi, "AD"],
  [/komanditn[oa]\s+dru[šs]tv[oa]/gi, "KD"],
  [/\bk\s*\.?\s*d\s*\.?(?=\s|,|$)/gi, "KD"],
  [/orta[čc]k[oa]\s+dru[šs]tv[oa]/gi, "OD"],
  [/zemljoradni[čc]k[ae]\s+zadrug[ae]/gi, "ZZ"],
  [/\bzadrug[ae]\b/gi, "ZZ"],
  [/javno\s+preduze[ćc]e/gi, "JP"],
  [/\bpredstavni[šs]tvo\b/gi, "Predstavništvo"],
  [/\bogranak\b/gi, "Ogranak"],
  [/\bs\s*\.?\s*r\s*\.?\s*l\s*\.?(?=\s|,|$)/gi, "S.R.L."],
  [/\bltd\b|\blimited\b/gi, "Ltd"],
  [/\bgmbh\b/gi, "GmbH"],
  [/\bllc\b/gi, "LLC"],
];

/** Forme koje se pišu ispred imena, a ne iza njega. */
const FORME_ISPRED = new Set(["ZZ", "JP"]);

// ============================================================================
// 4. Rečnik opisnih reči
// ============================================================================

/** Tvrde stop reči: na njima se prekida skupljanje jezgra. */
const TVRDE = new Set(
  `
preduzece preduzeće drustvo društvo privredno proizvodno trgovinsko trgovacko trgovačko
usluzno uslužno prometno transportno gradjevinsko građevinsko proizvodnja proizvodnju
promet prometa usluge usluga uslugu poslove poslovi trgovina trgovinu trgovine
unutrasnju unutrašnju spoljnu spoljno spoljna veliko malo izvoz uvoz uvozno izvozno
opsta opšta opste opšte zemljoradnicka zemljoradnička sportsko sportska kulturno
akcionarsko ogranicenom ograničenom odgovornoscu odgovornošću ortacko ortačko
komanditno javno agencija delatnost delatnosti proizvoda proizvodima robe roba robom
pruzanje pružanje posredovanje zastupanje izgradnja izgradnju odrzavanje održavanje
projektovanje izvodjenje izvođenje radova radovi montaza montaža remont
distribucija distribuciju prerada preradu otkup otkupu skladistenje skladištenje
prevoz prevoza transport transporta spedicija špedicija ugostiteljstvo turizam
konsalting savetovanje edukacija edukaciju edukacije obuka reciklaza reciklaža
hrane hrana pica pića materijalom opremom vrsta vrste ostalih ostalo
nespecijalizovana specijalizovana ostala drugi ostali
stambenih nestambenih zgrada zgrade objekata objekti instalacija
sistema sistemi opreme uredjaja uređaja materijala industrija industrije
odecom odećom obucom obućom tekstilom prehrambenim
doo ad kd od zz jp ograniceno ograničeno odgovornoscu odgovornošću
`
    .trim()
    .split(/\s+/),
);

/** Meke stop reči: kroz njih se prolazi, ne prekidaju skupljanje. */
const MEKE = new Set(["i", "za", "na", "od", "sa", "u", "ili", "the", "and", "of", "po", "pri"]);

const ogoli = (t: string) => t.toLowerCase().replace(/^[.,\-()"'']+|[.,\-()"'']+$/g, "");
const naReci = (s: string) => s.split(/[\s,;]+/).filter(Boolean);

function samoOpisne(reci: string[]): boolean {
  return reci.every((r) => {
    const b = ogoli(r);
    return TVRDE.has(b) || MEKE.has(b) || !/[a-zčćšžđ]/.test(b);
  });
}

/**
 * Uzima poslednji niz distinktivnih reči, prolazeći kroz meke stop reči.
 * "PREDUZEĆE ZA PROIZVODNJU I USLUGE JAGODINA-KOMERC" -> "JAGODINA-KOMERC"
 */
function jezgroSKraja(tekst: string, maxReci = 4): string {
  const reci = naReci(tekst);
  const izlaz: string[] = [];

  for (let i = reci.length - 1; i >= 0; i--) {
    const b = ogoli(reci[i]);
    if (TVRDE.has(b)) {
      if (izlaz.length) break;
      continue;
    }
    if (MEKE.has(b)) {
      if (izlaz.length) izlaz.push(reci[i]);
      continue;
    }
    izlaz.push(reci[i]);
    if (izlaz.length >= maxReci) break;
  }

  while (izlaz.length && MEKE.has(ogoli(izlaz[izlaz.length - 1]))) izlaz.pop();
  return izlaz.reverse().join(" ").replace(/^[\s,.\-]+|[\s,.\-]+$/g, "");
}

// ============================================================================
// 5. Title case
// ============================================================================

/** Akronimi koji ostaju veliki iako sadrže samoglasnik. */
const AKRONIMI = new Set([
  "VIP", "RK", "FK", "KK", "OK", "JP", "ZZ", "PTP", "IT", "PR", "TV",
  "AB", "MB", "PIB", "GSM", "LTD", "LLC", "SRL", "NP", "SM", "BG", "NS",
  "DMS", "ID", "HR", "EU", "US", "UK", "AD", "KD", "OD", "DOO",
  "MVD", "CNC", "LED", "PVC", "HDD", "SSD", "GPS",
]);

const MALIM = new Set(["i", "za", "na", "od", "sa", "u", "ili", "and", "of", "the", "de", "van"]);

export function titleCase(tekst: string): string {
  return tekst
    .split(/(\s+)/)
    .map((rec, i) => {
      if (!rec.trim()) return rec;
      const jezgro = rec.replace(/[^\wČĆŠŽĐčćšžđ]/g, "");

      // Akronim: sa spiska, ili kratak i bez samoglasnika.
      if (
        jezgro &&
        jezgro === jezgro.toUpperCase() &&
        (AKRONIMI.has(jezgro) || (jezgro.length <= 4 && !/[AEIOU]/.test(jezgro)))
      ) {
        return rec;
      }

      // Tačkasti akronim: D.M.S.-Mirkić
      const tackasti = rec.match(/^((?:[A-ZČĆŠŽĐ]\.)+)(.*)$/);
      if (tackasti) {
        const ostatak = tackasti[2]
          .toLowerCase()
          .replace(/(^|[-/])([\wČĆŠŽĐčćšžđ])/g, (_, a, b) => a + b.toUpperCase());
        return tackasti[1].toUpperCase() + ostatak;
      }

      if (MALIM.has(jezgro.toLowerCase()) && i > 0) return rec.toLowerCase();

      return rec
        .toLowerCase()
        .replace(/(^|[-/.])([\wČĆŠŽĐčćšžđ])/g, (_, a, b) => a + b.toUpperCase());
    })
    .join("");
}

// ============================================================================
// 6. Grad
// ============================================================================

/**
 * Gradske opštine se sklapaju u ime grada.
 *
 * 44,3 odsto svih firmi je u beogradskim opštinama, a 93,4 odsto njih ima reč
 * "Beograd" u poslovnom imenu. Ispisivanje "Vračar" umesto "Beograd" pogađa
 * oko 55.000 stranica i ubija ih u pretrazi.
 *
 * Mladenovac, Obrenovac, Lazarevac, Sopot, Barajevo, Grocka i Surčin su
 * formalno beogradske opštine, ali su u svesti korisnika zasebni gradovi, pa
 * se NE sklapaju u "Beograd".
 */
const GRADSKE_OPSTINE: Record<string, Set<string>> = {
  Beograd: new Set([
    "voždovac", "vozdovac", "vračar", "vracar", "zvezdara", "zemun",
    "novi beograd", "palilula", "rakovica", "savski venac", "stari grad",
    "čukarica", "cukarica", "beograd",
  ]),
  Niš: new Set(["medijana", "pantelej", "crveni krst", "niška banja", "niska banja", "niš", "nis"]),
  "Novi Sad": new Set(["novi sad", "petrovaradin"]),
  Kragujevac: new Set(["kragujevac"]),
};

function odrediGrad(opstina: string): string {
  // APR šalje i "PALILULA (BEOGRAD)" i "MLADENOVAC-VAROŠ".
  const ocisceno = opstina
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/-varo[šs]$/i, "")
    .trim();

  const kljuc = ocisceno.toLowerCase();
  for (const [grad, skup] of Object.entries(GRADSKE_OPSTINE)) {
    if (skup.has(kljuc)) return grad;
  }
  return titleCase(ocisceno);
}

// ============================================================================
// 7. Glavna funkcija
// ============================================================================

export type Zastavica = "" | "posle-forme" | "bez-forme" | "FALLBACK";

export type SkracenoIme = {
  kratko: string;
  /** Prazno je čisto. FALLBACK znači da jezgro nije nađeno i traži ručnu proveru. */
  zastavica: Zastavica;
};

const MAX = 45; // SEO.md 1.1

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function skratiIme(ime: string, opstina = "", maxDuzina = MAX): SkracenoIme {
  const sirovo = normalizujPismo(String(ime ?? ""))
    .replace(STATUS, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "");

  if (!sirovo) return { kratko: "", zastavica: "FALLBACK" };

  // Sidro je POSLEDNJE pojavljivanje bilo koje pravne forme.
  let sidro: { od: number; do: number; oznaka: string } | null = null;
  for (const [obrazac, oznaka] of FORME) {
    obrazac.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = obrazac.exec(sirovo)) !== null) {
      if (!sidro || m.index > sidro.od) {
        sidro = { od: m.index, do: m.index + m[0].length, oznaka };
      }
      if (m.index === obrazac.lastIndex) obrazac.lastIndex++;
    }
  }

  let jezgro = "";
  let forma = "";
  let zastavica: Zastavica = "";

  if (sidro) {
    forma = sidro.oznaka;
    const ispred = sirovo.slice(0, sidro.od).replace(/^[\s,.\-]+|[\s,.\-]+$/g, "");
    const iza = sirovo.slice(sidro.do).replace(/^[\s,.\-]+|[\s,.\-]+$/g, "");

    let kandidat = jezgroSKraja(ispred);
    if (!kandidat || samoOpisne(naReci(kandidat))) {
      // Ime stoji IZA forme: "ZEMLJORADNIČKA ZADRUGA AGROKORDUN".
      const bezGrada = opstina
        ? iza.replace(new RegExp("\\b" + escapeRe(opstina) + "\\b", "gi"), "")
        : iza;
      kandidat = jezgroSKraja(bezGrada.replace(/^[\s,.\-]+|[\s,.\-]+$/g, "")) || jezgroSKraja(ispred, 8);
      zastavica = "posle-forme";
    }
    jezgro = kandidat;
  } else {
    jezgro = jezgroSKraja(sirovo);
    zastavica = "bez-forme";
  }

  /** Naziv mesta na kraju jezgra bi se duplirao sa gradom. */
  const skiniGrad = (tekst: string): string => {
    let t = tekst;
    for (let i = 0; i < 2; i++) {
      t = t
        .replace(
          new RegExp("[\\s,]*\\b(" + escapeRe(opstina || " ") + "|beograd)\\b[\\s,]*$", "gi"),
          "",
        )
        .replace(/^[\s,.\-]+|[\s,.\-]+$/g, "");
    }
    return t;
  };

  /** Distinktivan deo sa POCETKA imena, preskacuci opisne reci. */
  const jezgroSPocetka = (): string => {
    const reci = naReci(skiniGrad(sirovo));
    while (reci.length && (TVRDE.has(ogoli(reci[0])) || MEKE.has(ogoli(reci[0])))) reci.shift();

    // Skuplja se do prve tvrde opisne reči, inače se u naziv uvuče i opis:
    // "TRIOPROJEKT DRUŠTVO ZA ..." bi ispalo "Trioprojekt Društvo za".
    const izlaz: string[] = [];
    for (const rec of reci) {
      if (TVRDE.has(ogoli(rec))) break;
      izlaz.push(rec);
      if (izlaz.length >= 3) break;
    }
    while (izlaz.length && MEKE.has(ogoli(izlaz[izlaz.length - 1]))) izlaz.pop();

    return izlaz.join(" ").replace(/^[\s,.\-]+|[\s,.\-]+$/g, "");
  };

  // Zastita: nikad ne pustaj rezultat sastavljen samo od opisnih reci.
  if (!jezgro || samoOpisne(naReci(jezgro))) {
    jezgro = jezgroSPocetka();
    zastavica = "FALLBACK";
  }

  jezgro = skiniGrad(jezgro);

  // Ako je jedina nadjena rec bio bas naziv grada, jezgro je sada prazno.
  // Naziv je u tim imenima po pravilu na pocetku: "TRIOPROJEKT DRUSTVO ZA ...".
  if (!jezgro) {
    jezgro = jezgroSPocetka();
    zastavica = "FALLBACK";
  }

  // Poslednja odbrana: radije odseceno pravo ime nego lazan naziv "n/a".
  if (!jezgro) {
    jezgro = titleCase(sirovo.slice(0, 30)).trim();
    zastavica = "FALLBACK";
  }

  const grad = opstina ? odrediGrad(opstina) : "";
  const delovi = FORME_ISPRED.has(forma)
    ? [forma, titleCase(jezgro), grad]
    : [titleCase(jezgro), forma, grad];

  let kratko = delovi.filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();

  if (kratko.length > maxDuzina) {
    const visak = kratko.length - maxDuzina;
    let skraceno = titleCase(jezgro);
    skraceno = skraceno.slice(0, Math.max(8, skraceno.length - visak)).replace(/[\s,.\-]+$/, "");
    kratko = (FORME_ISPRED.has(forma) ? [forma, skraceno, grad] : [skraceno, forma, grad])
      .filter(Boolean)
      .join(" ");
  }

  return { kratko, zastavica };
}

// ============================================================================
// 8. Ručni override
// ============================================================================

/**
 * Za top firme po prihodu, gde svaka stranica nosi realan saobraćaj,
 * automatika nije dovoljna. Ručni spisak uvek ima prednost nad algoritmom.
 *
 * Čista funkcija, bez veze sa bazom: spisak se prosleđuje spolja.
 */
export function primeniOverride(
  maticniBroj: string,
  automatski: string,
  overrides: Record<string, string>,
): string {
  return overrides[maticniBroj] ?? automatski;
}
