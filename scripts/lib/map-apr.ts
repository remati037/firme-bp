import { cirilicaULatinicu } from "../../lib/transliterate";
import { normalizeIme, parseDatum, slugify } from "../../lib/normalize";

export type SirovaFirma = {
  PoslovnoIme: string;
  SifraOpstine: string;
  NazivOpstine: string;
  NazivStatus: string;
  DatumOsnivanja: string;
  NazivPravneForme: string;
  SifraDelatnosti: string;
};

export type SirovFi = {
  GodinaFi: number;
  PoslovnoIme: string;
  SifraOpstine: number;
  NazivOpstine: string;
  PoslovnaImovina: number;
  Kapital: number;
  Gubitak: number;
  UkupniPrihodi: number;
  NetoDobitak: number;
  NetoGubitak: number;
  ProsecanBrojZaposlenih: number;
};

export type RedFirme = {
  maticni_broj: string;
  slug: string;
  poslovno_ime: string;
  poslovno_ime_norm: string;
  sifra_opstine: string | null;
  opstina: string | null;
  status: string | null;
  status_aktivan: boolean;
  datum_osnivanja: string | null;
  pravna_forma: string | null;
  sifra_delatnosti: string | null;
};

export type RedFinansija = {
  maticni_broj: string;
  godina: number;
  poslovna_imovina: number;
  kapital: number;
  gubitak: number;
  ukupni_prihodi: number;
  neto_dobitak: number;
  neto_gubitak: number;
  prosecan_broj_zaposlenih: number;
};

export type RedIstorije = RedFinansija & { datum_preseka: string };

/**
 * Jedina vrednost koja znači aktivnu firmu. U setu postoje tačno četiri statusa:
 * Активан, У ликвидацији, У стечају, У принудној ликвидацији.
 * Eksplicitno poređenje, nikad provera sadržanosti.
 */
const STATUS_AKTIVAN = "Активан";

/** Prazan string i nedostajuća vrednost su isto: null u bazi. */
function tekstIliNull(vrednost: unknown): string | null {
  const ocisceno = String(vrednost ?? "").trim();
  return ocisceno === "" ? null : ocisceno;
}

function broj(vrednost: unknown): number {
  return typeof vrednost === "number" && Number.isFinite(vrednost) ? vrednost : 0;
}

export function mapirajFirmu(
  maticniBroj: string,
  sirovo: SirovaFirma,
  postojeciSlug: string | null,
): RedFirme {
  const ime = String(sirovo.PoslovnoIme ?? "").trim();
  const opstinaCir = tekstIliNull(sirovo.NazivOpstine);
  const status = tekstIliNull(sirovo.NazivStatus);
  const pravnaForma = tekstIliNull(sirovo.NazivPravneForme);

  return {
    maticni_broj: maticniBroj,
    // Slug se zamrzava pri prvom upisu: 133k indeksiranih URL-ova ne sme da se menja.
    slug: postojeciSlug ?? slugify(ime, maticniBroj),
    poslovno_ime: ime, // original, i kad je ćirilicom
    poslovno_ime_norm: normalizeIme(ime),
    sifra_opstine: tekstIliNull(sirovo.SifraOpstine),
    opstina: opstinaCir === null ? null : cirilicaULatinicu(opstinaCir),
    status: status === null ? null : cirilicaULatinicu(status),
    status_aktivan: String(sirovo.NazivStatus ?? "").trim() === STATUS_AKTIVAN,
    datum_osnivanja: parseDatum(sirovo.DatumOsnivanja),
    pravna_forma: pravnaForma === null ? null : cirilicaULatinicu(pravnaForma),
    sifra_delatnosti: tekstIliNull(sirovo.SifraDelatnosti),
  };
}

/** Vrednosti se prenose nepromenjene, u hiljadama dinara. */
export function mapirajFinansije(maticniBroj: string, sirovo: SirovFi): RedFinansija {
  return {
    maticni_broj: maticniBroj,
    godina: broj(sirovo.GodinaFi),
    poslovna_imovina: broj(sirovo.PoslovnaImovina),
    kapital: broj(sirovo.Kapital),
    gubitak: broj(sirovo.Gubitak),
    ukupni_prihodi: broj(sirovo.UkupniPrihodi),
    neto_dobitak: broj(sirovo.NetoDobitak),
    neto_gubitak: broj(sirovo.NetoGubitak),
    prosecan_broj_zaposlenih: broj(sirovo.ProsecanBrojZaposlenih),
  };
}

const POLJA_FIRME: (keyof RedFirme)[] = [
  "slug", "poslovno_ime", "poslovno_ime_norm", "sifra_opstine", "opstina",
  "status", "status_aktivan", "datum_osnivanja", "pravna_forma", "sifra_delatnosti",
];

const POLJA_FINANSIJA: (keyof RedFinansija)[] = [
  "poslovna_imovina", "kapital", "gubitak", "ukupni_prihodi",
  "neto_dobitak", "neto_gubitak", "prosecan_broj_zaposlenih",
];

export function firmaIzmenjena(nova: RedFirme, stara: RedFirme): boolean {
  return POLJA_FIRME.some((polje) => nova[polje] !== stara[polje]);
}

export function finansijeIzmenjene(nove: RedFinansija, stare: RedFinansija): boolean {
  return POLJA_FINANSIJA.some((polje) => nove[polje] !== stare[polje]);
}
