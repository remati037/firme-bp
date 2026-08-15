import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { formatBroj, formatDatum, formatProcenat, formatRSD } from "./format";
import {
  ucitajDelatnost,
  ucitajGrad,
  ucitajUkrsteno,
  type PodaciDelatnosti,
  type PodaciOpstine,
  type PodaciUkrstene,
} from "./kategorije";
import { ucitajDatumPreseka } from "./presek";
import { apsolutniUrl, BREND } from "./site";

/**
 * Učitavanje i meta tagovi za kategorijske stranice.
 *
 * Zašto je ovo izdvojeno: paginacija ide kroz putanju (`/delatnost/4690/strana/3`),
 * a ne kroz `?strana=3`. Stranica koja čita `searchParams` je po definiciji
 * dinamična — Next je ne prerenderuje i ne kešira ISR-om, pa bi Googlebot na
 * svakih 259 strana delatnosti 4690 dobijao svež SSR i obarao crawl rate
 * (SEO.md §6). Sa putanjom, svaka strana je zasebno keširana ruta.
 *
 * Cena je duplirana ruta po tipu stranice (prva strana + `strana/[broj]`), pa
 * učitavanje i meta stoje ovde, a rute su tanke.
 */

export const ucitajDelatnostIliNotFound = cache(
  async (sifra: string, strana: number): Promise<PodaciDelatnosti> => {
    const podaci = await ucitajDelatnost(sifra, strana);
    if (!podaci) notFound();
    return podaci;
  },
);

export const ucitajGradIliNotFound = cache(
  async (slug: string, strana: number): Promise<PodaciOpstine> => {
    const podaci = await ucitajGrad(slug, strana);
    if (!podaci) notFound();
    return podaci;
  },
);

export const ucitajUkrstenoIliNotFound = cache(
  async (sifra: string, slug: string, strana: number): Promise<PodaciUkrstene> => {
    const podaci = await ucitajUkrsteno(sifra, slug, strana);
    // Kombinacija sa manje od 5 firmi nema stranicu (SEO.md §2.2).
    if (!podaci) notFound();
    return podaci;
  },
);

/** Prazna strana iza poslednje je 404, ne prazan spisak. */
export function proveriStranu(strana: number, brojStrana: number): void {
  if (strana > brojStrana) notFound();
}

export function putanjaStrane(osnova: string, strana: number): string {
  return strana > 1 ? `${osnova}/strana/${strana}` : osnova;
}

function sufiksStrane(strana: number): string {
  return strana > 1 ? ` — strana ${strana}` : "";
}

export async function metaDelatnost(sifra: string, strana: number): Promise<Metadata> {
  const [podaci, datumPreseka] = await Promise.all([
    ucitajDelatnostIliNotFound(sifra, strana),
    ucitajDatumPreseka(),
  ]);

  const naziv = podaci.naziv ?? `delatnost ${sifra}`;
  const godina = podaci.stat?.godina ?? "";

  // Šablon iz SEO.md §3; brend IDE u title kategorijskih stranica.
  const title = `Najveće firme: ${naziv} u Srbiji ${godina} | ${BREND}`;
  const description = `${formatBroj(podaci.stat?.broj_firmi, { nulaJePodatak: true })} firmi u delatnosti ${naziv}. Medijan prihoda ${formatRSD(
    podaci.stat?.medijan_prihoda,
  )}, medijan marže ${formatProcenat(podaci.stat?.medijan_marze)}. Rang lista po prihodu, podaci APR presek ${formatDatum(datumPreseka)}`;

  const url = apsolutniUrl(putanjaStrane(`/delatnost/${sifra}`, strana));

  return {
    title: title + sufiksStrane(strana),
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

export async function metaOpstina(slug: string, strana: number): Promise<Metadata> {
  const [podaci, datumPreseka] = await Promise.all([
    ucitajGradIliNotFound(slug, strana),
    ucitajDatumPreseka(),
  ]);

  const godina = podaci.stat?.godina ?? "";

  // Šablon iz SEO.md §3, sada u celosti: zbirovi stižu iz migracije 005.
  const title = `Najveće firme u opštini ${podaci.naziv} ${godina} | ${BREND}`;
  const description = `${formatBroj(podaci.stat?.broj_firmi, { nulaJePodatak: true })} firmi registrovanih u opštini ${podaci.naziv}. Ukupan prihod ${formatRSD(
    podaci.stat?.ukupan_prihod,
  )}, ${formatBroj(podaci.stat?.ukupno_zaposlenih, { praznoKao: "nepoznato" })} zaposlenih. Rang lista po prihodu iz APR podataka, presek ${formatDatum(datumPreseka)}`;

  const url = apsolutniUrl(putanjaStrane(`/grad/${slug}`, strana));

  return {
    title: title + sufiksStrane(strana),
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

export async function metaUkrstena(
  sifra: string,
  slug: string,
  strana: number,
): Promise<Metadata> {
  const [podaci, datumPreseka] = await Promise.all([
    ucitajUkrstenoIliNotFound(sifra, slug, strana),
    ucitajDatumPreseka(),
  ]);

  const naziv = podaci.nazivDelatnosti ?? `Delatnost ${sifra}`;
  const broj = podaci.lista.stranicenje.ukupno;

  const title = `${naziv} u opštini ${podaci.nazivOpstine} - ${formatBroj(broj)} firmi | ${BREND}`;
  const description = `Spisak firmi u delatnosti ${naziv} (${sifra}) registrovanih u opštini ${podaci.nazivOpstine}. ${formatBroj(
    broj,
  )} firmi, rang lista po ukupnom prihodu. Podaci APR, presek ${formatDatum(datumPreseka)}`;

  const url = apsolutniUrl(putanjaStrane(`/delatnost/${sifra}/${slug}`, strana));

  return {
    title: title + sufiksStrane(strana),
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

/** "3" -> 3; sve što nije ceo broj veći od 1 je 404 (nema /strana/1 ni /strana/x). */
export function brojIzPutanje(vrednost: string): number {
  const broj = Number(vrednost);
  if (!Number.isInteger(broj) || broj < 2) notFound();
  return broj;
}
