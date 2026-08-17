import type { Metadata } from "next";
import Link from "next/link";

import { CompanyCard } from "@/components/company/company-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Card } from "@/components/ui/card";
import { formatDatum } from "@/lib/format";
import { ucitajNajvece } from "@/lib/kategorije";
import { ucitajDatumPreseka } from "@/lib/presek";
import { apsolutniUrl, BREND } from "@/lib/site";

export const revalidate = 2592000;

/** Prihod po zaposlenom je odložen za v2 — nije kolona, traži novi view. */
export const METRIKE = [
  {
    kljuc: "prihod" as const,
    naziv: "Po prihodu",
    opis: "Sto firmi sa najvećim ukupnim prihodom",
    upit: "prihodu",
  },
  {
    kljuc: "dobit" as const,
    naziv: "Po neto dobitku",
    opis: "Sto firmi sa najvećim neto dobitkom",
    upit: "neto dobitku",
  },
  {
    kljuc: "zaposleni" as const,
    naziv: "Po broju zaposlenih",
    opis: "Sto najvećih poslodavaca po broju zaposlenih",
    upit: "broju zaposlenih",
  },
];

const NASLOV = `Najveće firme u Srbiji po prihodu, dobitku i broju zaposlenih | ${BREND}`;
const OPIS =
  "Rang liste najvećih firmi u Srbiji po ukupnom prihodu, neto dobitku i broju zaposlenih. Iz poslednjeg preseka Agencije za privredne registre, sa novim podacima svakog meseca.";

export const metadata: Metadata = {
  title: NASLOV,
  description: OPIS,
  alternates: { canonical: apsolutniUrl("/najvece") },
  openGraph: { title: NASLOV, description: OPIS, url: apsolutniUrl("/najvece"), type: "website" },
};

export default async function NajveceHub() {
  const [top, datumPreseka] = await Promise.all([ucitajNajvece("prihod", 10), ucitajDatumPreseka()]);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs mrvice={[{ tekst: "Početna", href: "/" }, { tekst: "Najveće firme" }]} />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          Najveće firme u Srbiji
        </h1>
        <p className="mt-2 max-w-[720px] text-[15px] text-muted-foreground">
          Liste se prave iz poslednjeg APR preseka i osvežavaju svakog meseca. Novinske tabele
          po pravilu ostaju na podacima iz godine u kojoj su objavljene.
        </p>
        <p className="mt-3.5 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(datumPreseka)} · Izvor: Agencija za privredne registre
        </p>
      </header>

      <section className="grid gap-4 pb-8 sm:grid-cols-3">
        {METRIKE.map((m) => (
          <Link key={m.kljuc} href={`/najvece/${m.kljuc}`} className="no-underline">
            <Card hover className="h-full">
              <h2 className="text-[17px] font-bold tracking-[-0.01em] text-foreground">
                {m.naziv}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{m.opis}</p>
              <p className="mt-3 text-sm font-semibold text-accent-strong">Pogledaj listu →</p>
            </Card>
          </Link>
        ))}
      </section>

      <section className="pb-10">
        <div className="mb-3.5 flex items-baseline justify-between gap-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Deset najvećih po prihodu</h2>
          <Link
            href="/najvece/prihod"
            className="text-sm font-semibold whitespace-nowrap text-accent-strong no-underline hover:underline"
          >
            Cela lista →
          </Link>
        </div>

        <ol className="list-none space-y-3">
          {top.map((firma) => (
            <li key={firma.maticni_broj} className="flex gap-4">
              <span
                className="min-w-[30px] pt-1 text-right text-[15px] font-extrabold text-border-strong tabular-nums"
                aria-hidden
              >
                {firma.rang}
              </span>
              <div className="min-w-0 flex-1">
                <CompanyCard firma={firma} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ItemList ide samo ovde (SEO.md §4): košta nula, ali ne očekuj rich result. */}
      <JsonLd
        podaci={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Najveće firme u Srbiji po prihodu",
          numberOfItems: top.length,
          itemListElement: top.map((firma, i) => ({
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
