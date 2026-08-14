/**
 * Formatiranje brojeva, novca i datuma za prikaz.
 *
 * Pravila su iz CLAUDE.md ("Normalizacija, pravila", tačke 4 i 5):
 *  - novčane vrednosti iz APR-a su u HILJADAMA dinara, u UI se množe sa 1000
 *  - `Intl.NumberFormat('sr-RS')`, bez decimala, sa oznakom RSD
 *  - nula znači da firma nije predala izveštaj → "Nema podataka", nikad "0 RSD"
 *
 * Sve funkcije su čiste i deterministične: isti ulaz daje isti izlaz i na
 * serveru i u pregledaču (bitno, jer se sve renderuje serverski, SEO.md §1.5).
 */

export const NEMA_PODATAKA = "Nema podataka";

const LOKALITET = "sr-RS";

const grupisano = new Intl.NumberFormat(LOKALITET, { maximumFractionDigits: 0 });
const saJednomDecimalom = new Intl.NumberFormat(LOKALITET, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type Broj = number | null | undefined;

type NumOpcije = {
  /** Kad je true, nula je legitiman podatak (npr. broj firmi u kategoriji). */
  nulaJePodatak?: boolean;
  /** Tekst koji se vraća kad podatka nema. */
  praznoKao?: string;
};

/** Nema podatka: null, undefined, NaN ili — po pravilu 5 — nula. */
export function jePrazno(v: Broj, nulaJePodatak = false): boolean {
  if (v === null || v === undefined || Number.isNaN(v)) return true;
  return !nulaJePodatak && v === 0;
}

/** Ceo broj sa tačkom kao separatorom hiljada: 133634 → "133.634". */
export function formatBroj(v: Broj, opcije: NumOpcije = {}): string {
  const { nulaJePodatak = false, praznoKao = NEMA_PODATAKA } = opcije;
  if (jePrazno(v, nulaJePodatak)) return praznoKao;
  return grupisano.format(v as number);
}

/**
 * Novčana vrednost. Ulaz je u HILJADAMA dinara, kako ga APR daje.
 * 45200 → "45.200.000 RSD".
 */
export function formatRSD(hiljadeDinara: Broj, opcije: NumOpcije = {}): string {
  const { nulaJePodatak = false, praznoKao = NEMA_PODATAKA } = opcije;
  if (jePrazno(hiljadeDinara, nulaJePodatak)) return praznoKao;
  return `${grupisano.format((hiljadeDinara as number) * 1000)} RSD`;
}

/**
 * Kompaktan zapis za kartice i liste: 238400000 (hiljada) → "238,4 mrd RSD".
 * Tabele uvek koriste `formatRSD` sa punom vrednošću (odluka iz prototipa,
 * README "Otvorene stvari", tačka 1).
 */
export function formatRSDKompaktno(hiljadeDinara: Broj, opcije: NumOpcije = {}): string {
  const { nulaJePodatak = false, praznoKao = NEMA_PODATAKA } = opcije;
  if (jePrazno(hiljadeDinara, nulaJePodatak)) return praznoKao;

  const dinara = (hiljadeDinara as number) * 1000;
  const znak = dinara < 0 ? "-" : "";
  const apsolutno = Math.abs(dinara);

  if (apsolutno >= 1e9) return `${znak}${saJednomDecimalom.format(apsolutno / 1e9)} mrd RSD`;
  if (apsolutno >= 1e6) return `${znak}${saJednomDecimalom.format(apsolutno / 1e6)} mil RSD`;
  return `${grupisano.format(dinara)} RSD`;
}

/** Procenat sa jednom decimalom: 23.4 → "23,4%". */
export function formatProcenat(v: Broj, opcije: NumOpcije & { decimale?: number } = {}): string {
  const { nulaJePodatak = true, praznoKao = NEMA_PODATAKA, decimale = 1 } = opcije;
  if (jePrazno(v, nulaJePodatak)) return praznoKao;
  const fmt = new Intl.NumberFormat(LOKALITET, {
    minimumFractionDigits: decimale,
    maximumFractionDigits: decimale,
  });
  return `${fmt.format(v as number)}%`;
}

/**
 * Datum u obliku 31.07.2026.
 *
 * ISO datum bez vremena se čita kao UTC, da vremenska zona ne pomeri dan
 * (Intl bi na `sr-RS` dao "31. 7. 2026." — prototip koristi dvocifreni oblik).
 */
export function formatDatum(datum: string | Date | null | undefined): string {
  const d = uDatum(datum);
  if (!d) return NEMA_PODATAKA;
  const dan = String(d.getUTCDate()).padStart(2, "0");
  const mesec = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dan}.${mesec}.${d.getUTCFullYear()}.`;
}

/** Godina iz datuma: "2026-07-31" → 2026. */
export function godinaIz(datum: string | Date | null | undefined): number | null {
  const d = uDatum(datum);
  return d ? d.getUTCFullYear() : null;
}

function uDatum(datum: string | Date | null | undefined): Date | null {
  if (!datum) return null;
  if (datum instanceof Date) return Number.isNaN(datum.getTime()) ? null : datum;

  const samoDatum = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  const d = samoDatum
    ? new Date(Date.UTC(Number(samoDatum[1]), Number(samoDatum[2]) - 1, Number(samoDatum[3])))
    : new Date(datum);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Starost firme u punim godinama na dan `naDan` (podrazumevano danas).
 * Vraća null ako datum osnivanja nedostaje ili je u budućnosti.
 *
 * `naDan` se prosleđuje eksplicitno gde god render mora da bude deterministički
 * (npr. datum preseka umesto "danas" na stranici firme).
 */
export function starostUGodinama(
  datumOsnivanja: string | Date | null | undefined,
  naDan: string | Date = new Date(),
): number | null {
  const od = uDatum(datumOsnivanja);
  const do_ = uDatum(naDan);
  if (!od || !do_) return null;

  let godine = do_.getUTCFullYear() - od.getUTCFullYear();
  const presaoRodjendan =
    do_.getUTCMonth() > od.getUTCMonth() ||
    (do_.getUTCMonth() === od.getUTCMonth() && do_.getUTCDate() >= od.getUTCDate());
  if (!presaoRodjendan) godine -= 1;

  return godine < 0 ? null : godine;
}

/** "12 godina", "1 godina", "3 godine", "manje od godinu dana". */
export function formatStarost(
  datumOsnivanja: string | Date | null | undefined,
  naDan: string | Date = new Date(),
): string {
  const godine = starostUGodinama(datumOsnivanja, naDan);
  if (godine === null) return NEMA_PODATAKA;
  if (godine === 0) return "manje od godinu dana";
  return `${formatBroj(godine)} ${pluralSrpski(godine, "godina", "godine", "godina")}`;
}

/**
 * Srpska množina: 1 firma, 2–4 firme, 5+ firmi.
 * Brojevi 11–14 idu u treći oblik (11 firmi, ne "11 firma").
 */
export function pluralSrpski(n: number, jedan: string, dva: string, pet: string): string {
  const apsolutno = Math.abs(Math.trunc(n));
  const poslednje = apsolutno % 10;
  const poslednjeDve = apsolutno % 100;

  if (poslednjeDve >= 11 && poslednjeDve <= 14) return pet;
  if (poslednje === 1) return jedan;
  if (poslednje >= 2 && poslednje <= 4) return dva;
  return pet;
}

/** "2.847 firmi", "1.101 firma", "14.203 firme". */
export function formatFirmi(n: Broj): string {
  if (jePrazno(n, true)) return NEMA_PODATAKA;
  const broj = n as number;
  return `${formatBroj(broj, { nulaJePodatak: true })} ${pluralSrpski(broj, "firma", "firme", "firmi")}`;
}

/** "12 zaposlenih", "1 zaposleni". Nula zaposlenih nije podatak (pravilo 5). */
export function formatZaposleni(n: Broj): string {
  if (jePrazno(n)) return NEMA_PODATAKA;
  const broj = n as number;
  return `${formatBroj(broj)} ${pluralSrpski(broj, "zaposleni", "zaposlena", "zaposlenih")}`;
}

/** Vraća `vrednost` ako postoji, inače "Nema podataka". Za tekstualna polja. */
export function iliNemaPodataka(vrednost: string | null | undefined): string {
  const ocisceno = vrednost?.trim();
  return ocisceno ? ocisceno : NEMA_PODATAKA;
}
