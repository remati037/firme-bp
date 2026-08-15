/**
 * Prompt za AI sažetak. Isti za oba provajdera — i DeepSeek i Anthropic
 * primaju sistemsku poruku plus jednu korisničku, pa se prompt gradi jednom
 * i ne razilazi se između provajdera.
 *
 * Pravila su doslovno iz CLAUDE.md ("AI sažetak, stroga pravila") i SEO.md §1.6.
 *
 * Zašto je prompt ovako kratak i podaci ovako zbijeni: izlaz nosi oko dve
 * trećine troška, ali ulaz se plaća 133.634 puta. Svaki suvišan red u
 * sistemskoj poruci je 133.634 puta naplaćen, pa ovde nema uvoda ni primera.
 */

import { formatBroj, formatRSD } from "../../../lib/format";

/**
 * Novčane vrednosti su u HILJADAMA dinara, tačno onako kako ih APR daje i kako
 * stoje u bazi. Množenje sa 1000 radi `formatRSD`, isti formater koji koristi
 * i stranica — da model i posetilac nikad ne vide različit iznos.
 */
export type PodaciZaSazetak = {
  ime: string;
  opstina: string | null;
  sifraDelatnosti: string | null;
  nazivDelatnosti: string | null;
  pravnaForma: string | null;
  status: string | null;
  datumOsnivanja: string | null;
  starostGodina: number | null;

  godina: number | null;
  prihodi: number | null;
  netoRezultat: number | null;
  kapital: number | null;
  imovina: number | null;
  zaposleni: number | null;

  prihodPoZaposlenom: number | null;
  netoMarza: number | null;
  medijanPrihodaDelatnosti: number | null;
  medijanPrihodaPoZaposlenom: number | null;
  rangDelatnost: number | null;
  ukupnoDelatnost: number | null;
  rangOpstina: number | null;
  ukupnoOpstina: number | null;

  /** Već izračunati signali iz `lib/signali.ts`, kao kratke oznake. */
  signali: string[];
};

export const SISTEMSKI_PROMPT = [
  "Pišeš kratku analitičku belešku o srpskoj firmi za javni informativni sajt.",
  "",
  "JEZIK: srpski, isključivo latinica. Nikad ćirilica, nikad hrvatski oblici.",
  "OBLIK: tačno 2 pasusa, ukupno 90 do 130 reči. Bez naslova, bez lista, bez markdown-a.",
  "TON: neutralan i informativan, kao beleška analitičara. Bez reklamnog tona i bez vrednosnih ocena.",
  "",
  "ZABRANJENO:",
  "- bilo koja tvrdnja koja nije direktno izvedena iz brojeva koje si dobio",
  "- ocena kreditne sposobnosti ili boniteta, i preporuka da li poslovati sa firmom",
  "- spekulacija o uzrocima rezultata (tržište, uprava, kriza, konkurencija)",
  "- pominjanje imena ljudi",
  "- izmišljanje podataka koji ti nisu prosleđeni, uključujući godine i iznose",
  "",
  "ŠTA SE OD TEBE TRAŽI:",
  "Iznad tvog teksta stranica već prikazuje tabelu sa svim brojevima i rečenice",
  "koje ih nabrajaju. Nemoj ih ponavljati. Tvoj posao je da te brojeve staviš u",
  "odnos: veličina firme u okviru njene delatnosti i opštine, odnos prihoda i",
  "rezultata, odnos kapitala i imovine, i šta od navedenih signala stoji uz to.",
  "Najviše dva broja u celom tekstu, i to samo ako nose poređenje.",
  "",
  "Ako su svi finansijski podaci prazni ili nula, napiši samo jednu rečenicu da",
  "firma nije predala finansijski izveštaj i ništa više.",
].join("\n");

/**
 * Novac ide kroz `formatRSD` iz `lib/format.ts`, ne kroz sopstveni `Intl`.
 * Razlog je konkretan: vrednosti u bazi su u hiljadama dinara, a množenje sa
 * 1000 živi u tom formateru. Sopstveno formatiranje je već jednom dalo modelu
 * iznose 1000 puta manje od stvarnih (EPS sa 479 miliona umesto 479 milijardi).
 */
const dinar = (v: number): string => formatRSD(v, { nulaJePodatak: true });

const broj = (v: number): string => formatBroj(v, { nulaJePodatak: true });

const procenat = (v: number): string => `${Math.round(v)} odsto`;

/**
 * Podaci kao `ključ: vrednost` redovi. Prazna polja se izostavljaju — red
 * "kapital: nema podatka" troši tokene, a modelu ne govori ništa što izostanak
 * reda već ne govori.
 */
export function korisnickiPrompt(p: PodaciZaSazetak): string {
  const redovi: [string, string | null][] = [
    ["firma", p.ime],
    ["opština", p.opstina],
    [
      "delatnost",
      p.sifraDelatnosti && p.nazivDelatnosti
        ? `${p.sifraDelatnosti} (${p.nazivDelatnosti})`
        : (p.sifraDelatnosti ?? p.nazivDelatnosti),
    ],
    ["pravna forma", p.pravnaForma],
    ["status", p.status],
    ["osnovana", p.datumOsnivanja],
    ["starost", p.starostGodina === null ? null : `${p.starostGodina} godina`],

    ["godina izveštaja", p.godina === null ? null : String(p.godina)],
    ["prihodi", p.prihodi === null ? null : dinar(p.prihodi)],
    ["neto rezultat", p.netoRezultat === null ? null : dinar(p.netoRezultat)],
    ["kapital", p.kapital === null ? null : dinar(p.kapital)],
    ["poslovna imovina", p.imovina === null ? null : dinar(p.imovina)],
    ["zaposleni", p.zaposleni === null ? null : broj(p.zaposleni)],

    [
      "prihod po zaposlenom",
      p.prihodPoZaposlenom === null ? null : dinar(p.prihodPoZaposlenom),
    ],
    ["neto marža", p.netoMarza === null ? null : procenat(p.netoMarza)],
    [
      "medijan prihoda u delatnosti",
      p.medijanPrihodaDelatnosti === null ? null : dinar(p.medijanPrihodaDelatnosti),
    ],
    [
      "medijan prihoda po zaposlenom u delatnosti",
      p.medijanPrihodaPoZaposlenom === null ? null : dinar(p.medijanPrihodaPoZaposlenom),
    ],
    [
      "rang po prihodu u delatnosti",
      p.rangDelatnost === null
        ? null
        : `${p.rangDelatnost}${p.ukupnoDelatnost ? ` od ${p.ukupnoDelatnost}` : ""}`,
    ],
    [
      "rang po prihodu u opštini",
      p.rangOpstina === null
        ? null
        : `${p.rangOpstina}${p.ukupnoOpstina ? ` od ${p.ukupnoOpstina}` : ""}`,
    ],
    ["signali", p.signali.length ? p.signali.join("; ") : null],
  ];

  return redovi
    .filter((red): red is [string, string] => red[1] !== null && red[1] !== "")
    .map(([kljuc, vrednost]) => `${kljuc}: ${vrednost}`)
    .join("\n");
}

/**
 * Firma bez ijedne upotrebljive finansijske vrednosti ne ide na API.
 * CLAUDE.md za taj slučaj propisuje jednu fiksnu rečenicu, a fiksna rečenica
 * je deterministički tekst — plaćati model da je napiše 39.406 puta je čist
 * gubitak, i uz to je rizik da je svaki put napiše malo drugačije.
 */
export function imaUpotrebljiveFinansije(p: PodaciZaSazetak): boolean {
  return [p.prihodi, p.netoRezultat, p.kapital, p.imovina, p.zaposleni].some(
    (v) => v !== null && v !== 0,
  );
}
