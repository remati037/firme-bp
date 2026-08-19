/**
 * Stranica mape — sadržaj za /mapa/[metrika] (PoC).
 *
 * Server komponenta: podaci se učitavaju kroz `ucitajPodatkeMape` (react cache)
 * i stranica je statična sa ISR-om, kao i ostale liste na sajtu. Metrika živi
 * u putanji (/mapa/firme, /mapa/prihod, /mapa/zaposleni), ne u query stringu —
 * tako svaka varijanta ima svoj statički URL, bez runtime renderovanja.
 */

import Link from "next/link";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Novac } from "@/components/ui/novac";
import { formatBroj, formatDatum } from "@/lib/format";
import {
  kvantilBucket,
  ucitajPodatkeMape,
  type OkrugStat,
} from "@/lib/mapa-srbije";

import { ChoropletSrbije, formatPrihodHiljade } from "./choroplet-srbije";

export const METRIKE = {
  firme: {
    naslov: "Broj firmi",
    opis: "Koliko je privrednih društava registrovano u svakom okrugu",
    vrednost: (o: OkrugStat) => o.brojFirmi,
    format: (v: number) => formatBroj(v, { nulaJePodatak: true }),
  },
  prihod: {
    naslov: "Ukupan prihod",
    opis: "Zbir ukupnih prihoda svih firmi u okrugu, u dinarima",
    vrednost: (o: OkrugStat) => o.ukupanPrihod,
    format: formatPrihodHiljade,
  },
  zaposleni: {
    naslov: "Broj zaposlenih",
    opis: "Ukupan broj zaposlenih u firmama okruga, iz poslednjih izveštaja",
    vrednost: (o: OkrugStat) => o.zaposleni,
    format: (v: number) => formatBroj(v, { nulaJePodatak: true }),
  },
} as const;

export type MetrikaMape = keyof typeof METRIKE;

export async function MapaStranica({ metrika }: { metrika: MetrikaMape }) {
  const podaci = await ucitajPodatkeMape();
  const m = METRIKE[metrika];

  const sortirani = [...podaci.okruzi].sort((a, b) => m.vrednost(b) - m.vrednost(a));
  const vrednosti = podaci.okruzi.map(m.vrednost);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs mrvice={[{ tekst: "Početna", href: "/" }, { tekst: "Mapa okruga" }]} />

      <header className="pt-7 pb-5">
        <p className="mb-2 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          PoC — probna stranica. Ideja: interaktivne mape i grafikoni iz APR podataka.
        </p>
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          {m.naslov} po okruzima
        </h1>
        <p className="mt-2 max-w-[720px] text-[15px] text-muted-foreground">{m.opis}</p>
        <p className="mt-3.5 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(podaci.datumPreseka)} · {formatBroj(podaci.brojFirmiUkupno)}{" "}
          firmi · Izvor: Agencija za privredne registre
        </p>
      </header>

      <nav aria-label="Metrika mape" className="mb-5 flex flex-wrap gap-2">
        {(Object.keys(METRIKE) as MetrikaMape[]).map((kljuc) => {
          const aktivan = kljuc === metrika;
          return (
            <Link
              key={kljuc}
              href={`/mapa/${kljuc}`}
              aria-current={aktivan ? "page" : undefined}
              className={
                aktivan
                  ? "rounded-ui border border-accent-ring bg-accent-soft px-3.5 py-[7px] text-[13px] font-semibold text-accent-strong no-underline"
                  : "rounded-ui border border-border px-3.5 py-[7px] text-[13px] font-semibold text-muted-foreground no-underline hover:border-accent-ring hover:text-foreground"
              }
            >
              {METRIKE[kljuc].naslov}
            </Link>
          );
        })}
      </nav>

      <section className="grid gap-4 pb-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <ChoropletSrbije
            okruzi={podaci.okruzi}
            vrednost={m.vrednost}
            formatVrednost={m.format}
            nazivMetrike={m.naslov}
          />
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
            Okruzi po {m.naslov.toLowerCase()}
          </h2>
          <ol className="list-none space-y-2.5">
            {sortirani.slice(0, 10).map((o, i) => (
              <li key={o.iso} className="flex items-baseline gap-3">
                <span className="min-w-[18px] text-right text-[15px] font-extrabold text-border-strong tabular-nums" aria-hidden>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{o.naziv}</span>
                <span className="shrink-0 text-[13.5px] font-bold tabular-nums">
                  {metrika === "prihod" ? (
                    <Novac hiljade={m.vrednost(o)} kompaktno />
                  ) : (
                    m.format(m.vrednost(o))
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {podaci.kosovo && podaci.kosovo.brojFirmi > 0 ? (
        <p className="pb-6 text-[13px] text-muted-foreground">
          APR sadrži i {formatBroj(podaci.kosovo.brojFirmi)} firmi registrovanih u{" "}
          {podaci.kosovo.brojOpstina} opština na teritoriji Kosova i Metohije; na mapi nisu
          prikazane jer izvor geometrije ne pokriva taj deo teritorije.
        </p>
      ) : null}

      <p className="pb-10 text-[12px] text-muted-foreground">
        Mapa: © OpenStreetMap saradnici, preko{" "}
        <a
          href="https://www.geoboundaries.org/api/current/gbOpen/SRB/ADM1/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground underline decoration-border-strong underline-offset-2 hover:text-primary"
        >
          geoBoundaries
        </a>{" "}
        (ODbL).
      </p>
    </main>
  );
}
