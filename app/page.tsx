import type { Metadata } from "next";
import Link from "next/link";

import { CompanyBadge } from "@/components/company/company-badge";
import { SearchBox } from "@/components/search/search-box";
import { Card } from "@/components/ui/card";
import { formatBroj, formatDatum, formatRSDKompaktno } from "@/lib/format";
import { ucitajPocetnu, type Kategorija } from "@/lib/pocetna";
import { imeOpstine, kratkoIme } from "@/lib/prikaz";
import type { KarticaFirme } from "@/lib/queries";
import { apsolutniUrl, BREND } from "@/lib/site";

export const revalidate = 2592000;

const NASLOV = `Proveri firmu pre nego što posluješ s njom | ${BREND}`;
const OPIS =
  "Besplatna provera privrednih društava u Srbiji: prihod, broj zaposlenih, status i pokazatelji iz podataka Agencije za privredne registre. Bez naloga i registracije.";

export const metadata: Metadata = {
  title: NASLOV,
  description: OPIS,
  alternates: { canonical: apsolutniUrl("/") },
  openGraph: {
    title: NASLOV,
    description: OPIS,
    url: apsolutniUrl("/"),
    type: "website",
    siteName: BREND,
    locale: "sr_RS",
  },
};

export default async function Pocetna() {
  const podaci = await ucitajPocetnu();

  const predlozi = podaci.topPrihod.slice(0, 3).map((f) => ({
    slug: f.slug,
    ime: kratkoIme({ poslovno_ime: f.ime, poslovno_ime_kratko: f.imeKratko, opstina: f.opstina }),
  }));

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      {/* ===== HERO ===== */}
      <section className="pt-18 pb-14 text-center">
        <h1 className="mx-auto max-w-[760px] text-[clamp(30px,5vw,46px)] leading-[1.12] font-extrabold tracking-[-0.03em]">
          Proveri firmu pre nego što{" "}
          <em className="text-accent-strong not-italic">posluješ s njom</em>.
        </h1>
        <p className="mx-auto mt-4 max-w-[620px] text-[17px] text-muted-foreground">
          Podaci iz Agencije za privredne registre za sve registrovane firme u Srbiji — besplatno,
          bez naloga, bez registracije.
        </p>

        <div className="mx-auto mt-8 max-w-[640px] text-left">
          <SearchBox predlozi={predlozi} />
        </div>

        <p className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[13.5px] text-muted-foreground">
          <b className="font-semibold text-foreground tabular-nums">
            {formatBroj(podaci.brojFirmi)} firmi
          </b>
          <span className="text-border-strong">·</span>
          <span>presek {formatDatum(podaci.datumPreseka)}</span>
          <span className="text-border-strong">·</span>
          <span>izvor: APR</span>
          <span className="text-border-strong">·</span>
          <span>ažurira se mesečno</span>
        </p>
      </section>

      {/* ===== TOP LISTE ===== */}
      <section className="pt-2 pb-10">
        <SekcijaZaglavlje naslov="Najveće firme u Srbiji" href="/najvece" link="Sve liste →" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TopLista naslov="Po prihodu" firme={podaci.topPrihod} />
          <TopLista naslov="Po broju zaposlenih" firme={podaci.topZaposleni} />
          <TopLista naslov="Po neto dobitku" firme={podaci.topDobit} />
        </div>
      </section>

      {/* ===== KATEGORIJE ===== */}
      <section className="py-10">
        <SekcijaZaglavlje naslov="Delatnosti" href="/delatnost" link="Sve delatnosti →" />
        <MrezaKategorija stavke={podaci.delatnosti} />

        <div className="mt-9">
          <SekcijaZaglavlje naslov="Opštine" href="/grad" link="Sve opštine →" />
          <MrezaKategorija stavke={podaci.opstine} formatirajNaziv />
        </div>
      </section>

      {/* ===== SEO BLOK ===== */}
      <section className="py-10">
        <Card>
          <h2 className="mb-2.5 text-lg font-bold tracking-[-0.01em]">Šta je ovo?</h2>
          <p className="max-w-[760px] text-[14.5px] text-muted-foreground">
            Besplatna provera podataka o privrednim društvima registrovanim u Srbiji: finansijski
            izveštaji, broj zaposlenih, datum osnivanja, pravna forma i status — iz zvaničnih
            podataka Agencije za privredne registre (APR). Svaka stranica odgovara na pitanje{" "}
            <b className="font-semibold text-foreground">
              „šta znam o ovoj firmi pre nego što poslujem s njom”
            </b>
            : rang u delatnosti i opštini, poređenje sa medijanom, upozoravajući signali i slične
            firme. Podaci se ažuriraju mesečno, sa svakim novim APR presekom.
          </p>
          <Link
            href="/o-podacima"
            className="mt-3.5 inline-flex items-center gap-2 rounded-ui border border-accent-ring px-3 py-[7px] text-[13px] font-semibold text-accent-strong no-underline transition-colors hover:bg-accent-soft"
          >
            Kako koristiti podatke →
          </Link>
        </Card>
      </section>
    </main>
  );
}

function TopLista({ naslov, firme }: { naslov: string; firme: KarticaFirme[] }) {
  return (
    <Card>
      <h3 className="mb-3 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
        {naslov}
      </h3>
      <ol className="list-none space-y-2.5">
        {firme.map((firma, i) => (
          <li key={firma.maticni_broj} className="flex items-start gap-3">
            <span
              className="min-w-[18px] text-right text-[15px] font-extrabold text-border-strong tabular-nums"
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <Link
                href={`/firma/${firma.slug}`}
                className="block truncate text-[14.5px] font-semibold text-foreground no-underline hover:text-primary"
              >
                {kratkoIme({
                  poslovno_ime: firma.ime,
                  poslovno_ime_kratko: firma.imeKratko,
                  opstina: firma.opstina,
                })}
              </Link>
              <span className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="truncate">{imeOpstine(firma.opstina)}</span>
                {firma.status_aktivan ? null : (
                  <CompanyBadge
                    status={firma.status}
                    statusAktivan={firma.status_aktivan}
                    className="px-2 py-0 text-[11px]"
                  />
                )}
              </span>
            </span>
            <span className="shrink-0 text-right text-[13.5px] font-bold tabular-nums">
              {firma.vrstaVrednosti === "broj"
                ? formatBroj(firma.vrednost)
                : formatRSDKompaktno(firma.vrednost ?? firma.ukupni_prihodi)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function SekcijaZaglavlje({
  naslov,
  href,
  link,
}: {
  naslov: string;
  href: string;
  link: string;
}) {
  return (
    <div className="mb-[18px] flex items-baseline justify-between gap-4">
      <h2 className="text-[21px] font-bold tracking-[-0.02em]">{naslov}</h2>
      <Link
        href={href}
        className="text-sm font-semibold whitespace-nowrap text-accent-strong no-underline hover:underline"
      >
        {link}
      </Link>
    </div>
  );
}

function MrezaKategorija({
  stavke,
  formatirajNaziv = false,
}: {
  stavke: Kategorija[];
  formatirajNaziv?: boolean;
}) {
  return (
    <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stavke.map((stavka) => (
        <li key={stavka.putanja}>
          <Link
            href={stavka.putanja}
            className="flex h-full items-center justify-between gap-2.5 rounded-ui border border-border bg-card px-4 py-[13px] no-underline transition duration-150 hover:-translate-y-px hover:border-accent-ring hover:bg-accent-soft"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {formatirajNaziv ? imeOpstine(stavka.naziv) : stavka.naziv}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground tabular-nums">
                {formatBroj(stavka.brojFirmi, { nulaJePodatak: true })} firmi
              </span>
            </span>
            <span className="font-bold text-accent-strong" aria-hidden>
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
