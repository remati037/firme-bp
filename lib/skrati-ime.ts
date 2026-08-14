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
  // Tolerantno, jer sam APR izvor sadrzi tipfelere: DRUSTO, DUSTVO, DRUSVO,
  // DPUSTVO, OGRANICEBOM, OGRNICENOM, OGARNICENOM, ORGANICENOM...
  [
    /d[rp]?u[šs]?[tv]{1,2}[oa]m?\s+s\s*a?\s+og[ar]{1,4}ni[čcć]{1,2}[e]?[nb]om\s+odgovorno[šs][ćc]u/gi,
    "DOO",
  ],
  [/\bdoo\s*za\b/gi, "DOO"],
  [/\bdooza\b/gi, "DOO"],
  [/\bsa\s+potpunom\s+odgovorno[šs][ćc]u/gi, "OD"],
  [/\bs\s*a?\s*\.?\s*p\s*\.?\s*o\s*\.?(?=\s|,|$)/gi, "OD"],
  [/\bd\s*\.?\s*o\s*\.?\s*o\s*\.?(?=\s|,|$)/gi, "DOO"],
  [/\bdoo\b/gi, "DOO"],
  [/\bd0{2}\b/gi, "DOO"], // tipfeler D00 u izvoru
  [/akcionarsk[oe]\s+dru[šs]tv[oa]/gi, "AD"],
  [/\ba\s*\.?\s*d\s*\.?(?=\s|,|$)/gi, "AD"],
  [/komanditn[oa]\s+dru[šs]tv[oa]/gi, "KD"],
  [/\bk\s*\.?\s*d\s*\.?(?=\s|,|$)/gi, "KD"],
  [/orta[čc]k[oa]\s+dru[šs]tv[oa]/gi, "OD"],
  // Samo na kraju ili pred zarezom, da se ne pobrka sa predlogom "od".
  [/\bod(?=\s*,|\s*$)/gi, "OD"],
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
inzenjering inženjering marketing gradjevinarstvo građevinarstvo poslovne poslovno
export-import eksport-import uvoz-izvoz izvoz-uvoz import-export omladinska
studentsko-omladinska omladinsko zadrugarstvo racunovodstvo računovodstvo
knjigovodstvo knjigovodstvene projektovanja instalacije instalacija servisiranje
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
const jeBroj = (rec: string) => /^\d{3,4}$/.test(ogoli(rec));

/**
 * Opisna reč do broja NIJE opis nego deo naziva: "RADOVIĆ TRANSPORT 2023",
 * "MAK 037 UGOSTITELJSTVO", "KUME PROMET 2020". Bez ovoga desetine firmi sa
 * istim prezimenom ostanu bez razlikovnog dela i slugovi im se sudare.
 */
function zasticene(reci: string[]): Set<number> {
  const skup = new Set<number>();
  reci.forEach((rec, i) => {
    if (!jeBroj(rec)) return;
    if (i > 0) skup.add(i - 1);
    if (i + 1 < reci.length) skup.add(i + 1);
    skup.add(i);
  });
  return skup;
}

function jezgroSKraja(tekst: string, maxReci = 4): string {
  // Token bez ijednog slova ili cifre nije naziv. Nastaje kad se iz "BEOGRAD
  // (VRAČAR)" ukloni ime opstine, pa ostane gola zagrada.
  const reci = naReci(tekst).filter((r) => /[\p{L}\p{N}]/u.test(r));
  const cuvane = zasticene(reci);
  const izlaz: string[] = [];

  for (let i = reci.length - 1; i >= 0; i--) {
    const b = ogoli(reci[i]);
    if (TVRDE.has(b) && !cuvane.has(i)) {
      if (izlaz.length) break;
      continue;
    }
    if (MEKE.has(b) && !cuvane.has(i)) {
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

/**
 * Javna preduzeća i zadruge: naziv stoji IZA forme, pa se čita spreda.
 * Redosled je bitan, duži oblici idu prvi.
 *
 * Kod njih algoritam koji čita otpozadi nalazi samo opisne reči, pa je
 * "JKP GRADSKO SAOBRAĆAJNO PREDUZEĆE BEOGRAD" i "JKP POGREBNE USLUGE BEOGRAD"
 * davao isto ime. Dve stranice sa istim H1 su duplicate content.
 */
const FORME_SPREDA: [RegExp, string][] = [
  [/^javno\s+komunalno[\s-]+stambeno\s+preduze[ćc]e/i, "JKSP"],
  [/^javno\s+komunalno\s+stambeno\s+preduze[ćc]e/i, "JKSP"],
  [/^komunalno[\s-]+stambeno\s+preduze[ćc]e/i, "JKSP"],
  [/^javno\s+gradsko\s+saobra[ćc]ajno\s+preduze[ćc]e/i, "JGSP"],
  [/^javno\s+komunalno\s+preduze[ćc]e/i, "JKP"],
  [/^javno\s+stambeno\s+preduze[ćc]e/i, "JSP"],
  [/^javno\s+autotransportno\s+preduze[ćc]e/i, "JAP"],
  [/^javno\s+urbanisti[čc]ko\s+preduze[ćc]e/i, "JUP"],
  [/^javno\s+preduze[ćc]e/i, "JP"],
  [/^stambena\s+zadruga/i, "ZZ"],
  [/^studentska\s+zadruga/i, "ZZ"],
  [/^omladinska\s+zadruga/i, "ZZ"],
  [/^op[šs]ta\s+zemljoradni[čc]ka\s+zadruga/i, "ZZ"],
  [/^zemljoradni[čc]ka\s+zadruga/i, "ZZ"],
  [/^u[čc]eni[čc]ka\s+zadruga/i, "ZZ"],
  [/^zadruga/i, "ZZ"],
];

/** Reči koje se u nazivu javnog preduzeća ili zadruge nikad ne ispisuju. */
const SUVISNE_U_NAZIVU = new Set([
  "zadruga", "zadruge", "preduzece", "preduzeće", "javno", "komunalno", "stambeno",
  "stambena", "studentska", "omladinska", "studentsko-omladinska",
]);

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

/** Seče na granicu reči. */
function seciNaRec(tekst: string, max: number): string {
  if (tekst.length <= max) return tekst;
  const kratko = tekst.slice(0, max);
  const razmak = kratko.lastIndexOf(" ");
  return (razmak > max * 0.5 ? kratko.slice(0, razmak) : kratko).replace(/[\s,.\-&"]+$/, "");
}

/** Uklanja uzastopno ponovljene reči: "GAAM DOO UB DOO UB" -> "GAAM DOO UB". */
function skiniPonavljanja(tekst: string): string {
  const reci = tekst.split(" ").filter(Boolean);
  const izlaz: string[] = [];
  for (const rec of reci) {
    if (izlaz.length && ogoli(izlaz[izlaz.length - 1]) === ogoli(rec)) continue;
    izlaz.push(rec);
  }
  // I ponovljeni parovi: "DOO BEOGRAD DOO BEOGRAD".
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + 2 * n <= izlaz.length; i++) {
      const a = izlaz.slice(i, i + n).map(ogoli).join(" ");
      const b = izlaz.slice(i + n, i + 2 * n).map(ogoli).join(" ");
      if (a === b) {
        izlaz.splice(i + n, n);
        i--;
      }
    }
  }
  return izlaz.join(" ");
}

export function skratiIme(ime: string, opstina = "", maxDuzina = MAX): SkracenoIme {
  const sirovo = skiniPonavljanja(
    normalizujPismo(String(ime ?? ""))
      .replace(STATUS, "")
      // Ortačka društva: "... MAKSIMOVIĆ JOVANA I ORTAKA FINMAX ... OD LOZNICA".
      // Lična imena ortaka jesu javan podatak, ali ne idu u title i H1.
      .replace(/\s+\S+(?:\s+\S+)?\s+i\s+(ortaci|ortaka|ortak|drugi|dr\.?|ostali)\b/gi, " ")
      // Prazne zagrade i zaostala interpunkcija iz izvora: "... DOO BEOGRAD ()".
      .replace(/\(\s*\)/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, ""),
  );

  if (!sirovo) return { kratko: "", zastavica: "FALLBACK" };

  // Javna preduzeća i zadruge: naziv stoji iza forme, čita se spreda.
  for (const [obrazac, oznaka] of FORME_SPREDA) {
    const m = sirovo.match(obrazac);
    if (!m) continue;

    const grad = opstina ? odrediGrad(opstina) : "";
    const ostatak = sirovo
      .slice(m[0].length)
      .replace(/^[\s,.\-]+/, "")
      .split(/[(,]/)[0];

    const jezgroReci: string[] = [];
    for (const rec of naReci(ostatak)) {
      const b = ogoli(rec);
      if (SUVISNE_U_NAZIVU.has(b)) continue;
      // Grad zatvara naziv: "JKP VODOVOD I KANALIZACIJA ZRENJANIN".
      if (grad && b === grad.toLowerCase()) break;
      if (b === ogoli(opstina)) break;
      jezgroReci.push(rec);
      if (jezgroReci.length >= 4) break;
    }
    while (jezgroReci.length && MEKE.has(ogoli(jezgroReci[jezgroReci.length - 1]))) jezgroReci.pop();

    // Recenicna kapitalizacija, ne Title Case: "Vodovod i kanalizacija",
    // "Pogrebne usluge". To je ispravan srpski pravopis za opisne nazive.
    const naziv = jezgroReci
      .map((rec, i) => {
        const golo = rec.replace(/[^\wČĆŠŽĐčćšžđ]/g, "");
        const jeAkronim =
          golo === golo.toUpperCase() &&
          (AKRONIMI.has(golo) || (golo.length <= 4 && !/[AEIOU]/.test(golo)));
        if (jeAkronim) return rec;
        return i === 0 ? titleCase(rec) : rec.toLowerCase();
      })
      .join(" ");
    // "JKP RAŠKA RAŠKA": firma se zaista zove po gradu, ne ponavljaj ga.
    const kratko = skiniPonavljanja(
      [oznaka, naziv && naziv.toLowerCase() !== grad.toLowerCase() ? naziv : "", grad]
        .filter(Boolean)
        .join(" "),
    );

    return {
      kratko: kratko.length > maxDuzina ? seciNaRec(kratko, maxDuzina) : kratko,
      zastavica: jezgroReci.length ? "" : "FALLBACK",
    };
  }

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
