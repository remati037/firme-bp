import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ListaFirmi } from "@/components/category/lista-firmi";
import { PoredjenjeProvider } from "@/components/category/poredjenje";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { formatDatum } from "@/lib/format";
import { ucitajNajvece } from "@/lib/kategorije";
import { ucitajDatumPreseka } from "@/lib/presek";
import { METRIKE_FINANSIJA, type KarticaFirme, type MetrikaFinansija } from "@/lib/queries";
import { apsolutniUrl, BREND } from "@/lib/site";

import { METRIKE } from "../page";

export const revalidate = 2592000;

const KOLIKO = 100;

type Props = { params: Promise<{ metrika: string }> };

function jeMetrika(vrednost: string): vrednost is MetrikaFinansija {
  return Object.hasOwn(METRIKE_FINANSIJA, vrednost);
}

const ucitaj = cache(async (metrika: MetrikaFinansija): Promise<KarticaFirme[]> => {
  return ucitajNajvece(metrika, KOLIKO);
});

export async function generateStaticParams() {
  return METRIKE.map((m) => ({ metrika: m.kljuc }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { metrika } = await params;
  if (!jeMetrika(metrika)) notFound();

  const opis = METRIKE.find((m) => m.kljuc === metrika);
  const [firme, datumPreseka] = await Promise.all([ucitaj(metrika), ucitajDatumPreseka()]);
  const godina = firme[0]?.godina ?? "";

  // Šablon iz SEO.md §3.
  const title = `100 najvećih firmi u Srbiji po ${opis?.upit ?? metrika} ${godina} | ${BREND}`;
  const description = `Rang lista sto najvećih firmi u Srbiji po ${opis?.upit ?? metrika}, iz podataka Agencije za privredne registre. Presek ${formatDatum(datumPreseka)} Lista se osvežava svakog meseca.`;

  return {
    title,
    description,
    alternates: { canonical: apsolutniUrl(`/najvece/${metrika}`) },
    openGraph: {
      title,
      description,
      url: apsolutniUrl(`/najvece/${metrika}`),
      type: "website",
    },
  };
}

export default async function TopLista({ params }: Props) {
  const { metrika } = await params;
  if (!jeMetrika(metrika)) notFound();

  const opis = METRIKE.find((m) => m.kljuc === metrika);
  const [firme, datumPreseka] = await Promise.all([ucitaj(metrika), ucitajDatumPreseka()]);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          { tekst: "Najveće firme", href: "/najvece" },
          { tekst: opis?.naziv ?? metrika },
        ]}
      />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          100 najvećih firmi u Srbiji po {opis?.upit ?? metrika}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {opis?.opis}, po poslednjem predatom finansijskom izveštaju
        </p>
        <p className="mt-3.5 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(datumPreseka)} · Izvor: Agencija za privredne registre
        </p>
      </header>

      <div className="flex flex-wrap gap-2 pb-6">
        {METRIKE.filter((m) => m.kljuc !== metrika).map((m) => (
          <Link
            key={m.kljuc}
            href={`/najvece/${m.kljuc}`}
            className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:border-accent-ring hover:bg-accent-soft hover:text-primary"
          >
            {m.naziv} →
          </Link>
        ))}
      </div>

      <PoredjenjeProvider>
        <ListaFirmi firme={firme} />
      </PoredjenjeProvider>

      <div className="pb-10" />

      <JsonLd
        podaci={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `100 najvećih firmi u Srbiji po ${opis?.upit ?? metrika}`,
          numberOfItems: firme.length,
          itemListElement: firme.map((firma, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: firma.imeKratko ?? firma.ime,
            url: apsolutniUrl(`/firma/${firma.slug}`),
          })),
        }}
      />
    </main>
  );
}
