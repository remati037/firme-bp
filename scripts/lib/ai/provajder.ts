/**
 * Zajednički interfejs ka oba AI provajdera.
 *
 * Skripta za generisanje ne zna koji je provajder u igri — dobije `Klijent` i
 * zove `posalji`. Zamena DeepSeek ↔ Anthropic je jedan argument u komandnoj
 * liniji, bez ijedne izmene koda.
 */

import { nadjiModel, PODRAZUMEVANI_MODEL, type Model, type Provajder } from "./modeli";

export type Zahtev = {
  sistem: string;
  korisnik: string;
  maxTokena: number;
};

export type Odgovor = {
  tekst: string;
  ulazTokena: number;
  izlazTokena: number;
};

export interface Klijent {
  readonly naziv: string;
  readonly model: Model;
  posalji(zahtev: Zahtev): Promise<Odgovor>;
}

/** Greška koja se isplati ponoviti (rate limit, prolazni kvar servera). */
export class PrivremenaGreska extends Error {
  constructor(
    message: string,
    readonly cekajMs?: number,
  ) {
    super(message);
    this.name = "PrivremenaGreska";
  }
}

const POKUSAJA = 5;
const OSNOVNI_ZASTOJ_MS = 1000;

/**
 * Ponavlja samo `PrivremenaGreska`. Trajne greške (neispravan ključ, nepoznat
 * model, odbijen sadržaj) se propuštaju odmah — ponavljanje bi 133.634 puta
 * čekalo isti neuspeh.
 */
export async function saPonavljanjem<T>(posao: () => Promise<T>, opis: string): Promise<T> {
  let poslednja: unknown;

  for (let pokusaj = 1; pokusaj <= POKUSAJA; pokusaj++) {
    try {
      return await posao();
    } catch (greska) {
      poslednja = greska;
      if (!(greska instanceof PrivremenaGreska)) throw greska;
      if (pokusaj === POKUSAJA) break;

      const zastoj = greska.cekajMs ?? OSNOVNI_ZASTOJ_MS * 2 ** (pokusaj - 1);
      await new Promise((r) => setTimeout(r, zastoj));
    }
  }

  throw new Error(
    `${opis}: neuspeh posle ${POKUSAJA} pokušaja. Poslednja greška: ${
      poslednja instanceof Error ? poslednja.message : String(poslednja)
    }`,
  );
}

export function odrediProvajdera(nazivModela: string): Provajder {
  return nadjiModel(nazivModela).provajder;
}

/**
 * Pravi klijenta za dati model. Uvoz implementacije je dinamičan da bi
 * pokretanje sa DeepSeek-om radilo i kada Anthropic SDK nije instaliran, i
 * obrnuto — provajder koji se ne koristi ne sme da bude uslov za rad.
 */
export async function napraviKlijenta(nazivModela: string): Promise<Klijent> {
  const model = nadjiModel(nazivModela);

  if (model.provajder === "deepseek") {
    const { deepseekKlijent } = await import("./deepseek");
    return deepseekKlijent(nazivModela, model);
  }

  const { anthropicKlijent } = await import("./anthropic");
  return anthropicKlijent(nazivModela, model);
}

export function podrazumevaniModel(provajder: Provajder): string {
  return PODRAZUMEVANI_MODEL[provajder];
}
