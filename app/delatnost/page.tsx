import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { formatBroj, formatRSD } from "@/lib/format";
import { ucitajDatumPreseka } from "@/lib/presek";
import { upitNaceKodovi, type StatistikaDelatnosti } from "@/lib/queries";
import { apsolutniUrl, BREND } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase";

export const revalidate = 2592000;

const NASLOV = `Delatnosti u Srbiji — spisak sa brojem firmi | ${BREND}`;
const OPIS =
  "Sve delatnosti privrednih društava u Srbiji, sa brojem registrovanih firmi i medijanom prihoda. Podaci iz Agencije za privredne registre.";

export const metadata: Metadata = {
  title: NASLOV,
  description: OPIS,
  alternates: { canonical: apsolutniUrl("/delatnost") },
  openGraph: { title: NASLOV, description: OPIS, url: apsolutniUrl("/delatnost"), type: "website" },
};

export default async function SpisakDelatnosti() {
  const db = getSupabaseServerClient();

  const [{ data: statistike }, datumPreseka] = await Promise.all([
    db
      .from("mv_delatnost_stats")
      .select(
        "sifra_delatnosti,godina,broj_firmi,broj_aktivnih,broj_sa_izvestajem,medijan_prihoda,medijan_marze,medijan_prihoda_po_zaposlenom",
      )
      .order("broj_firmi", { ascending: false })
      .returns<StatistikaDelatnosti[]>(),
    ucitajDatumPreseka(),
  ]);

  const redovi = statistike ?? [];
  const { data: nazivi } = await upitNaceKodovi(
    db,
    redovi.map((r) => r.sifra_delatnosti),
  );
  const nazivPoSifri = new Map((nazivi ?? []).map((n) => [n.sifra, n.naziv]));

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs mrvice={[{ tekst: "Početna", href: "/" }, { tekst: "Delatnosti" }]} />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          Delatnosti u Srbiji
        </h1>
        <p className="mt-2 max-w-[720px] text-[15px] text-muted-foreground">
          {formatBroj(redovi.length)} delatnosti po šifarniku APR-a, poređanih po broju
          registrovanih firmi. Presek podataka: {datumPreseka}.
        </p>
      </header>

      <ul className="grid list-none gap-3 pb-10 sm:grid-cols-2 lg:grid-cols-3">
        {redovi.map((red) => (
          <li key={red.sifra_delatnosti}>
            <Link
              href={`/delatnost/${red.sifra_delatnosti}`}
              className="flex h-full items-center justify-between gap-3 rounded-ui border border-border bg-card px-4 py-3.5 no-underline transition duration-150 hover:-translate-y-px hover:border-accent-ring hover:bg-accent-soft"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {nazivPoSifri.get(red.sifra_delatnosti) ?? `Delatnost ${red.sifra_delatnosti}`}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground tabular-nums">
                  {red.sifra_delatnosti} · {formatBroj(red.broj_firmi, { nulaJePodatak: true })} firmi
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
