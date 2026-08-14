import type { Metadata } from "next";
import Link from "next/link";

import { SearchBox } from "@/components/search/search-box";
import { Card } from "@/components/ui/card";
import { formatBroj, formatDatum } from "@/lib/format";
import { apsolutniUrl, BREND, BROJ_FIRMI, DATUM_PRESEKA } from "@/lib/site";

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

/** Filteri iz prototipa. Postaju aktivni uz pretragu (Faza C). */
const FILTERI = ["Samo aktivne", "Sa izveštajem", "Po opštini"];

const TOP_LISTE = [
  { naslov: "Po prihodu", href: "/najvece/prihod" },
  { naslov: "Po broju zaposlenih", href: "/najvece/zaposleni" },
  { naslov: "Po neto dobitku", href: "/najvece/dobit" },
];

/** Deterministične širine, da placeholder ne izgleda kao nasumičan šum. */
const SIRINE_REDOVA = ["86%", "72%", "78%", "64%", "70%"];

export default function Pocetna() {
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
          <SearchBox napomena="Pretraga se uključuje sa prvim uvozom podataka." />
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {FILTERI.map((filter) => (
            <span
              key={filter}
              className="inline-flex items-center rounded-full border border-border bg-card px-[13px] py-1.5 text-[13px] text-muted-foreground select-none"
            >
              {filter}
            </span>
          ))}
        </div>

        <p className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[13.5px] text-muted-foreground">
          <b className="font-semibold text-foreground tabular-nums">
            {formatBroj(BROJ_FIRMI)} firmi
          </b>
          <span className="text-border-strong">·</span>
          <span>presek {formatDatum(DATUM_PRESEKA)}</span>
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
          {TOP_LISTE.map((lista) => (
            <Card key={lista.href}>
              <h3 className="mb-3 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
                {lista.naslov}
              </h3>
              <ol className="space-y-2.5" aria-hidden>
                {SIRINE_REDOVA.map((sirina, i) => (
                  <li key={sirina} className="flex items-center gap-4">
                    <span className="min-w-[26px] text-right text-[15px] font-extrabold text-border-strong tabular-nums">
                      {i + 1}
                    </span>
                    <span
                      className="block h-3 rounded-full bg-muted"
                      style={{ width: sirina }}
                    />
                  </li>
                ))}
              </ol>
              <p className="mt-3.5 border-t border-border pt-3 text-xs text-muted-foreground">
                Uskoro — lista se pravi iz APR preseka.
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ===== KATEGORIJE ===== */}
      <section className="py-10">
        <SekcijaZaglavlje naslov="Delatnosti" href="/delatnost" link="Sve delatnosti →" />
        <PlaceholderMreza broj={8} />

        <div className="mt-9">
          <SekcijaZaglavlje naslov="Opštine" href="/grad" link="Sve opštine →" />
          <PlaceholderMreza broj={8} />
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

/** Struktura mreže kategorija bez podataka — puni se u Fazi C. */
function PlaceholderMreza({ broj }: { broj: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: broj }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2.5 rounded-ui border border-border bg-card px-4 py-[13px]"
        >
          <span className="flex flex-col gap-2">
            <span className="block h-3 w-[132px] rounded-full bg-muted" />
            <span className="block h-2.5 w-[64px] rounded-full bg-muted" />
          </span>
          <span className="font-bold text-border-strong">→</span>
        </div>
      ))}
    </div>
  );
}
