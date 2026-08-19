/**
 * Podaci za choropleth mapu Srbije po okruzima (PoC, /mapa/[metrika]).
 *
 * Napomena o izvoru okruga: kolona `municipalities.okrug` je prazna za svih
 * 192 opštine (APR open data je ne daje, videti scripts/data/README.md). Zato
 * se okrug izvodi iz statičke mape `OPSTINA_OKRUG_ISO`, ključane po šifri
 * opštine (stabilan ključ, nazivi tipa "PALILULA (BEOGRAD)" su dvosmisleni).
 *
 * Produkcijsko rešenje (kad PoC prođe): preneti ovu mapu u
 * `scripts/data/opstine.json` (polje `okrug`) i popuniti kolonu kroz seed —
 * bez promene šeme. Ovde ostaje samo dok je stranica probna.
 *
 * Kosovo i Metohija: APR sadrži 602 firme iz 22 opštine (šifre 90xxx), ali
 * izvor geometrije (geoBoundaries SRB ADM1) ne pokriva taj deo teritorije,
 * pa se one agregiraju zasebno (ključ "XK") i prikazuju kao napomena.
 */

import { cache } from "react";

import { ucitajDatumPreseka } from "./presek";
import { getSupabaseServerClient } from "./supabase";

/** Šifre opština koje pripadaju Kosovu i Metohiji (bez geometrije na mapi). */
export const KOSOVO_ISO = "XK";

/** Nazivi okruga (ISO → srpski, latinica). */
export const OKRUG_NAZIVI: Record<string, string> = {
  "RS-00": "Grad Beograd",
  "RS-01": "Severnobački okrug",
  "RS-02": "Srednjobanatski okrug",
  "RS-03": "Severnobanatski okrug",
  "RS-04": "Južnobanatski okrug",
  "RS-05": "Zapadnobački okrug",
  "RS-06": "Južnobački okrug",
  "RS-07": "Sremski okrug",
  "RS-08": "Mačvanski okrug",
  "RS-09": "Kolubarski okrug",
  "RS-10": "Podunavski okrug",
  "RS-11": "Braničevski okrug",
  "RS-12": "Šumadijski okrug",
  "RS-13": "Pomoravski okrug",
  "RS-14": "Borski okrug",
  "RS-15": "Zaječarski okrug",
  "RS-16": "Zlatiborski okrug",
  "RS-17": "Moravički okrug",
  "RS-18": "Raški okrug",
  "RS-19": "Rasinski okrug",
  "RS-20": "Nišavski okrug",
  "RS-21": "Toplički okrug",
  "RS-22": "Pirotski okrug",
  "RS-23": "Jablanički okrug",
  "RS-24": "Pčinjski okrug",
  [KOSOVO_ISO]: "Kosovo i Metohija",
};

/** Opština (šifra) → okrug (ISO). Sastavljeno iz zvanične teritorijalne podele. */
export const OPSTINA_OKRUG_ISO: Record<string, string> = {
  // Grad Beograd (17 opština + poseban red "Beograd (grad)" iz sifarnika)
  "70092": "RS-00", "70106": "RS-00", "70114": "RS-00", "70122": "RS-00",
  "70149": "RS-00", "70157": "RS-00", "70165": "RS-00", "70173": "RS-00",
  "70181": "RS-00", "70190": "RS-00", "70203": "RS-00", "70211": "RS-00",
  "70220": "RS-00", "70238": "RS-00", "70246": "RS-00", "70254": "RS-00",
  "71293": "RS-00", "71308": "RS-00",
  // Severnobački (RS-01)
  "80438": "RS-01", "80071": "RS-01", "80241": "RS-01",
  // Srednjobanatski (RS-02)
  "80152": "RS-02", "80250": "RS-02", "80268": "RS-02", "80373": "RS-02", "80144": "RS-02",
  // Severnobanatski (RS-03)
  "80209": "RS-03", "80012": "RS-03", "80195": "RS-03", "80276": "RS-03", "80365": "RS-03", "80489": "RS-03",
  // Južnobanatski (RS-04)
  "80314": "RS-04", "80039": "RS-04", "80098": "RS-04", "80128": "RS-04",
  "80217": "RS-04", "80225": "RS-04", "80292": "RS-04", "80349": "RS-04",
  // Zapadnobački (RS-05)
  "80381": "RS-05", "80047": "RS-05", "80306": "RS-05", "80233": "RS-05",
  // Južnobački (RS-06)
  "89010": "RS-06", "80055": "RS-06", "80063": "RS-06", "80080": "RS-06",
  "80101": "RS-06", "80110": "RS-06", "80462": "RS-06", "80136": "RS-06",
  "80390": "RS-06", "80411": "RS-06", "80446": "RS-06", "80454": "RS-06",
  // Sremski (RS-07)
  "80403": "RS-07", "80179": "RS-07", "80187": "RS-07", "80322": "RS-07",
  "80357": "RS-07", "80420": "RS-07", "80497": "RS-07",
  // Mačvanski (RS-08)
  "71269": "RS-08", "70289": "RS-08", "70408": "RS-08", "70637": "RS-08",
  "70661": "RS-08", "70734": "RS-08", "70777": "RS-08", "70793": "RS-08",
  // Kolubarski (RS-09)
  "70360": "RS-09", "70882": "RS-09", "71218": "RS-09", "70700": "RS-09",
  "70831": "RS-09", "70769": "RS-09",
  // Podunavski (RS-10)
  "71099": "RS-10", "71102": "RS-10", "70386": "RS-10",
  // Braničevski (RS-11)
  "70947": "RS-11", "70394": "RS-11", "70475": "RS-11", "70521": "RS-11",
  "70530": "RS-11", "70696": "RS-11", "70807": "RS-11", "70912": "RS-11", "71340": "RS-11",
  // Šumadijski (RS-12)
  "70645": "RS-12", "70033": "RS-12", "70076": "RS-12", "70599": "RS-12",
  "71277": "RS-12", "71013": "RS-12", "71153": "RS-12",
  // Pomoravski (RS-13)
  "71048": "RS-13", "71200": "RS-13", "70491": "RS-13", "70904": "RS-13",
  "71030": "RS-13", "71056": "RS-13",
  // Borski (RS-14)
  "70327": "RS-14", "70572": "RS-14", "70785": "RS-14", "70840": "RS-14",
  // Zaječarski (RS-15)
  "70556": "RS-15", "70319": "RS-15", "70602": "RS-15", "71129": "RS-15",
  // Zlatiborski (RS-16)
  "71145": "RS-16", "70041": "RS-16", "70068": "RS-16", "70629": "RS-16",
  "71234": "RS-16", "70955": "RS-16", "70971": "RS-16", "70980": "RS-16",
  "70866": "RS-16", "71072": "RS-16", "71366": "RS-16",
  // Moravički (RS-17)
  "71242": "RS-17", "70483": "RS-17", "70742": "RS-17", "70564": "RS-17",
  // Raški (RS-18)
  "70653": "RS-18", "70459": "RS-18", "71021": "RS-18", "70874": "RS-18", "71188": "RS-18",
  // Rasinski (RS-19)
  "70670": "RS-19", "70017": "RS-19", "70343": "RS-19", "70378": "RS-19",
  "71170": "RS-19", "71196": "RS-19",
  // Nišavski (RS-20)
  "70858": "RS-20", "70025": "RS-20", "71064": "RS-20", "70823": "RS-20",
  "71005": "RS-20", "70513": "RS-20", "70467": "RS-20", "71285": "RS-20",
  "71307": "RS-20", "71315": "RS-20", "71331": "RS-20", "71323": "RS-20",
  // Toplički (RS-21)
  "70998": "RS-21", "70262": "RS-21", "70688": "RS-21", "70548": "RS-21",
  // Pirotski (RS-22)
  "70939": "RS-22", "70084": "RS-22", "70050": "RS-22", "70505": "RS-22",
  // Jablanički (RS-23)
  "70726": "RS-23", "70297": "RS-23", "70718": "RS-23", "70815": "RS-23",
  "70424": "RS-23", "71226": "RS-23",
  // Pčinjski (RS-24)
  "70432": "RS-24", "70416": "RS-24", "71137": "RS-24", "70335": "RS-24",
  "70351": "RS-24", "70963": "RS-24", "71161": "RS-24", "71358": "RS-24",
  // Kosovo i Metohija (bez geometrije na mapi)
  "90018": KOSOVO_ISO, "90026": KOSOVO_ISO, "90042": KOSOVO_ISO,
  "90093": KOSOVO_ISO, "90107": KOSOVO_ISO, "90115": KOSOVO_ISO,
  "90123": KOSOVO_ISO, "90131": KOSOVO_ISO, "90140": KOSOVO_ISO,
  "90158": KOSOVO_ISO, "90166": KOSOVO_ISO, "90182": KOSOVO_ISO,
  "90204": KOSOVO_ISO, "90212": KOSOVO_ISO, "90239": KOSOVO_ISO,
  "90255": KOSOVO_ISO, "90263": KOSOVO_ISO, "90298": KOSOVO_ISO,
  "90301": KOSOVO_ISO, "90328": KOSOVO_ISO, "90336": KOSOVO_ISO, "90352": KOSOVO_ISO,
};

export type RedOpstine = { sifra: string; naziv_lat: string | null };

export type RedStatOpstine = {
  sifra_opstine: string;
  broj_firmi: number;
  /** U hiljadama dinara (APR format). */
  ukupan_prihod: number | null;
  ukupno_zaposlenih: number | null;
};

export type OkrugStat = {
  iso: string;
  naziv: string;
  brojFirmi: number;
  /** U hiljadama dinara. */
  ukupanPrihod: number;
  zaposleni: number;
  brojOpstina: number;
};

export type PodaciMape = {
  /** 25 jedinica sa geometrijom (24 okruga + Grad Beograd), po ISO redosledu. */
  okruzi: OkrugStat[];
  /** Agregat za Kosovo i Metohiju, ako ima firmi; nema geometrije. */
  kosovo: OkrugStat | null;
  datumPreseka: string | null;
  brojFirmiUkupno: number;
};

/** Šifra opštine → okrug ISO; null ako šifra nije u mapi (ne treba da se desi). */
export function okrugIsoIzSifre(sifra: string): string | null {
  return OPSTINA_OKRUG_ISO[sifra] ?? null;
}

/** Agregira statistiku opština po okrugu. */
export function agregirajPoOkrugu(
  opstine: RedOpstine[],
  stat: RedStatOpstine[],
): { okruzi: OkrugStat[]; kosovo: OkrugStat | null } {
  const poSifri = new Map(stat.map((s) => [s.sifra_opstine, s]));
  const mapa = new Map<string, OkrugStat>();

  const dodaj = (iso: string, sifra: string, red?: RedStatOpstine) => {
    const postojeci = mapa.get(iso) ?? {
      iso,
      naziv: OKRUG_NAZIVI[iso] ?? iso,
      brojFirmi: 0,
      ukupanPrihod: 0,
      zaposleni: 0,
      brojOpstina: 0,
    };
    postojeci.brojFirmi += red?.broj_firmi ?? 0;
    postojeci.ukupanPrihod += red?.ukupan_prihod ?? 0;
    postojeci.zaposleni += red?.ukupno_zaposlenih ?? 0;
    postojeci.brojOpstina += 1;
    mapa.set(iso, postojeci);
  };

  for (const o of opstine) {
    const iso = okrugIsoIzSifre(o.sifra);
    if (!iso) continue;
    dodaj(iso, o.sifra, poSifri.get(o.sifra));
  }

  const okruzi = [...mapa.values()]
    .filter((o) => o.iso !== KOSOVO_ISO)
    .sort((a, b) => a.iso.localeCompare(b.iso));
  const kosovo = mapa.get(KOSOVO_ISO) ?? null;
  return { okruzi, kosovo };
}

/**
 * Podaci za mapu: sifarnik opština + statistika po opštini + datum preseka.
 * Sve su male tabele (192 reda), bez runtime agregacije u bazi.
 */
export const ucitajPodatkeMape = cache(async (): Promise<PodaciMape> => {
  const db = getSupabaseServerClient();

  const [opstine, stat, datumPreseka] = await Promise.all([
    db.from("municipalities").select("sifra,naziv_lat").returns<RedOpstine[]>(),
    db
      .from("mv_opstina_stats")
      .select("sifra_opstine,broj_firmi,ukupan_prihod,ukupno_zaposlenih")
      .returns<RedStatOpstine[]>(),
    ucitajDatumPreseka(),
  ]);

  const { okruzi, kosovo } = agregirajPoOkrugu(opstine.data ?? [], stat.data ?? []);
  return {
    okruzi,
    kosovo,
    datumPreseka,
    brojFirmiUkupno: okruzi.reduce((z, o) => z + o.brojFirmi, 0) + (kosovo?.brojFirmi ?? 0),
  };
});

/**
 * Kvantilni bucket za boju (0..koraka-1). Nule se bacaju u prvi bucket.
 * Vrednosti se sortiraju ovde, pa je poziv jednostavan:
 * `kvantilBucket(vrednosti.map(m), v)`.
 */
export function kvantilBucket(niz: number[], v: number, koraka = 5): number {
  if (v <= 0) return 0;
  const sortiran = [...niz].sort((a, b) => a - b);
  const n = sortiran.length;
  let bucket = 0;
  for (let k = 1; k < koraka; k++) {
    const granica = sortiran[Math.min(n - 1, Math.floor((k * n) / koraka))];
    if (v >= granica) bucket = k;
  }
  return bucket;
}
