import Link from "next/link";

import { CompanyBadge } from "@/components/company/company-badge";
import { Novac } from "@/components/ui/novac";
import { formatBroj, formatProcenat, NEMA_PODATAKA } from "@/lib/format";
import { imeOpstine, nazivDelatnosti } from "@/lib/prikaz";
import { MIN_FIRMI, type RedPoredjenja } from "@/lib/uporedi";

import { LinkSaMerenjem } from "./link-sa-merenjem";
import type { StranaSaKontekstom } from "@/lib/uporedi-podaci";

/**
 * Tabela poređenja dve do četiri firme.
 *
 * Prava HTML tabela sa `<th scope>` — isti razlog kao kod `FinancialTable`
 * (SEO.md §7): format koji i čitač ekrana i jezički model čitaju bez greške.
 *
 * Povoljnija vrednost je označena i bojom i znakom, nikad samo bojom. Kad dve
 * firme dele najbolju vrednost, obe nose oznaku — poređenje ne izmišlja
 * pobednika tamo gde ga nema.
 */
export function TabelaPoredjenja({
  strane,
  redovi,
}: {
  strane: StranaSaKontekstom[];
  redovi: RedPoredjenja[];
}) {
  const slugovi = strane.map((s) => s.strana.firma.slug);

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        {/*
          Natpis je kratak namerno: `<caption>` je širok koliko i tabela, a
          tabela na telefonu ide preko ekrana — duži tekst bi se sekao i tražio
          horizontalno skrolovanje da bi se pročitao. Objašnjenje oznake ✓ stoji
          ispod tabele, izvan skrol-kontejnera.
        */}
        <caption className="px-5 pt-3.5 pb-1.5 text-left text-[13px] text-muted-foreground">
          Poslednji predati izveštaji, u dinarima.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="min-w-[150px] border-b border-border px-5 py-3 text-left text-[13px] font-medium text-muted-foreground"
            >
              Pokazatelj
            </th>
            {strane.map((strana, i) => (
              <ZaglavljeFirme
                key={strana.strana.firma.maticni_broj}
                strana={strana}
                putanjaBez={
                  strane.length > MIN_FIRMI
                    ? `/uporedi/${slugovi.filter((_, j) => j !== i).join("/")}`
                    : null
                }
                ostajeFirmi={strane.length - 1}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {redovi.map((red) => (
            <tr key={red.naziv} className="hover:bg-muted">
              <th
                scope="row"
                className="border-b border-border px-5 py-[11px] text-left font-medium"
              >
                {red.naziv}
              </th>
              {strane.map((strana, i) => (
                <Celija key={strana.strana.firma.maticni_broj} red={red} indeks={i} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ZaglavljeFirme({
  strana,
  putanjaBez,
  ostajeFirmi,
}: {
  strana: StranaSaKontekstom;
  /** Poređenje bez ove firme; null kad bi uklanjanje spustilo broj ispod dva. */
  putanjaBez: string | null;
  ostajeFirmi: number;
}) {
  const { firma, ime } = strana.strana;

  return (
    <th scope="col" className="min-w-[190px] border-b border-border px-5 py-3 text-left align-top">
      <span className="flex items-start justify-between gap-2">
        <Link href={`/firma/${firma.slug}`} className="text-[15px] font-bold text-accent-strong">
          {ime}
        </Link>
        {putanjaBez ? (
          <LinkSaMerenjem
            href={putanjaBez}
            dogadjajIme="poredjenje_izbacena_firma"
            parametri={{ ukupno_firmi: ostajeFirmi }}
            title={`Izbaci ${ime} iz poređenja`}
            ariaLabel={`Izbaci ${ime} iz poređenja`}
            className="shrink-0 rounded-full border border-border px-1.5 text-[13px] leading-[1.5] font-normal text-muted-foreground no-underline hover:border-danger hover:text-danger"
          >
            ×
          </LinkSaMerenjem>
        ) : null}
      </span>
      <span className="mt-1.5 block">
        <CompanyBadge status={firma.status} statusAktivan={firma.status_aktivan} />
      </span>
      <span className="mt-1.5 block text-[12px] font-normal text-muted-foreground">
        {[imeOpstine(firma.opstina), nazivDelatnosti(firma.sifra_delatnosti, strana.nace?.naziv)]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </th>
  );
}

function Celija({ red, indeks }: { red: RedPoredjenja; indeks: number }) {
  const vrednost = red.vrednosti[indeks] ?? null;
  const najbolji = red.najbolji.includes(indeks);

  return (
    <td
      className={`border-b border-border px-5 py-[11px] tabular-nums ${
        najbolji ? "font-bold text-accent-strong" : ""
      }`}
    >
      {najbolji ? (
        <span className="mr-1.5 text-success" aria-hidden>
          ✓
        </span>
      ) : null}
      <Vrednost red={red} vrednost={vrednost} />
      {najbolji ? <span className="sr-only"> (povoljnija vrednost)</span> : null}
    </td>
  );
}

function Vrednost({ red, vrednost }: { red: RedPoredjenja; vrednost: number | null }) {
  if (vrednost === null) return <span className="text-muted-foreground">{NEMA_PODATAKA}</span>;

  switch (red.vrsta) {
    case "novac":
      return <Novac hiljade={vrednost} nulaJePodatak={red.nulaJePodatak} />;
    case "procenat":
      return <>{formatProcenat(vrednost)}</>;
    case "rang":
      return <>{formatBroj(vrednost)}.</>;
    default:
      return <>{formatBroj(vrednost, { nulaJePodatak: red.nulaJePodatak })}</>;
  }
}
