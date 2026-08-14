import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { formatBroj, formatRSD } from "@/lib/format";
import { imeOpstine, slugOpstine } from "@/lib/prikaz";
import { ucitajDatumPreseka } from "@/lib/presek";
import type { StatistikaOpstine } from "@/lib/queries";
import { apsolutniUrl, BREND } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase";

export const revalidate = 2592000;

const NASLOV = `Opštine u Srbiji — firme po opštinama | ${BREND}`;
const OPIS =
  "Sve opštine u Srbiji sa brojem registrovanih privrednih društava i medijanom prihoda. Podaci iz Agencije za privredne registre.";

export const metadata: Metadata = {
  title: NASLOV,
  description: OPIS,
  alternates: { canonical: apsolutniUrl("/grad") },
  openGraph: { title: NASLOV, description: OPIS, url: apsolutniUrl("/grad"), type: "website" },
};

export default async function SpisakOpstina() {
  const db = getSupabaseServerClient();

  const [{ data: statistike }, datumPreseka] = await Promise.all([
    db
      .from("mv_opstina_stats")
      .select(
        "sifra_opstine,opstina,godina,broj_firmi,broj_aktivnih,broj_sa_izvestajem,medijan_prihoda,medijan_marze,medijan_prihoda_po_zaposlenom",
      )
      .order("broj_firmi", { ascending: false })
      .returns<StatistikaOpstine[]>(),
    ucitajDatumPreseka(),
  ]);

  const redovi = statistike ?? [];

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs mrvice={[{ tekst: "Početna", href: "/" }, { tekst: "Opštine" }]} />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          Firme po opštinama
        </h1>
        <p className="mt-2 max-w-[720px] text-[15px] text-muted-foreground">
          {formatBroj(redovi.length)} opština, poređanih po broju registrovanih privrednih
          društava. Presek podataka: {datumPreseka}.
        </p>
      </header>

      <ul className="grid list-none gap-3 pb-10 sm:grid-cols-2 lg:grid-cols-4">
        {redovi.map((red) => (
          <li key={red.sifra_opstine}>
            <Link
              href={`/grad/${slugOpstine(red.opstina)}`}
              className="flex h-full items-center justify-between gap-3 rounded-ui border border-border bg-card px-4 py-3.5 no-underline transition duration-150 hover:-translate-y-px hover:border-accent-ring hover:bg-accent-soft"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {imeOpstine(red.opstina)}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground tabular-nums">
                  {formatBroj(red.broj_firmi, { nulaJePodatak: true })} firmi
                  {red.medijan_prihoda ? ` · medijan ${formatRSD(red.medijan_prihoda)}` : ""}
                </span>
              </span>
              <span className="font-bold text-accent-strong" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
