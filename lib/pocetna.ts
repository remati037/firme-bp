import { cache } from "react";

import { ucitajNajvece } from "./kategorije";
import { ucitajDatumPreseka } from "./presek";
import { slugOpstine } from "./prikaz";
import {
  upitNajveceDelatnosti,
  upitNajveceOpstine,
  upitNaceKodovi,
  upitPoslednjiPresek,
  type KarticaFirme,
} from "./queries";
import { BROJ_FIRMI } from "./site";
import { getSupabaseServerClient } from "./supabase";

/**
 * Podaci za početnu stranu.
 *
 * Sve je iz materijalizovanih view-ova i iz gotovih top lista, pa je stranica
 * statična sa ISR-om — početna je najposećenija adresa i ne sme da zavisi od
 * runtime agregacije.
 */

export type Kategorija = { naziv: string; putanja: string; brojFirmi: number | null };

export type PodaciPocetne = {
  datumPreseka: string;
  brojFirmi: number;
  topPrihod: KarticaFirme[];
  topZaposleni: KarticaFirme[];
  topDobit: KarticaFirme[];
  delatnosti: Kategorija[];
  opstine: Kategorija[];
};

export const ucitajPocetnu = cache(async (): Promise<PodaciPocetne> => {
  const db = getSupabaseServerClient();

  const [datumPreseka, presek, topPrihod, topZaposleni, topDobit, delatnosti, opstine] =
    await Promise.all([
      ucitajDatumPreseka(),
      upitPoslednjiPresek(db),
      ucitajNajvece("prihod", 5),
      ucitajNajvece("zaposleni", 5),
      ucitajNajvece("dobit", 5),
      upitNajveceDelatnosti(db, 8),
      upitNajveceOpstine(db, 8),
    ]);

  const redoviDelatnosti = delatnosti.data ?? [];
  const { data: nazivi } = await upitNaceKodovi(
    db,
    redoviDelatnosti.map((r) => r.sifra_delatnosti),
  );
  const nazivPoSifri = new Map((nazivi ?? []).map((n) => [n.sifra, n.naziv]));

  return {
    datumPreseka,
    brojFirmi: presek.data?.broj_firmi ?? BROJ_FIRMI,
    topPrihod,
    topZaposleni,
    topDobit,
    delatnosti: redoviDelatnosti.map((r) => ({
      naziv: nazivPoSifri.get(r.sifra_delatnosti) ?? `Delatnost ${r.sifra_delatnosti}`,
      putanja: `/delatnost/${r.sifra_delatnosti}`,
      brojFirmi: r.broj_firmi,
    })),
    opstine: (opstine.data ?? []).map((r) => ({
      naziv: r.opstina ?? r.sifra_opstine,
      putanja: `/grad/${slugOpstine(r.opstina)}`,
      brojFirmi: r.broj_firmi,
    })),
  };
});
