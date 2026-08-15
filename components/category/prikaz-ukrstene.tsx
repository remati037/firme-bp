import Link from "next/link";

import { ListaFirmi } from "@/components/category/lista-firmi";
import { Paginacija } from "@/components/category/paginacija";
import { PoredjenjeProvider } from "@/components/category/poredjenje";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { formatBroj, formatDatum } from "@/lib/format";
import { proveriStranu, ucitajUkrstenoIliNotFound } from "@/lib/kategorije-strana";
import { ucitajDatumPreseka } from "@/lib/presek";

/** Telo ukrštene stranice delatnost + opština (SEO.md §2.2). */
export async function PrikazUkrstene({
  sifra,
  slug,
  strana,
}: {
  sifra: string;
  slug: string;
  strana: number;
}) {
  const [podaci, datumPreseka] = await Promise.all([
    ucitajUkrstenoIliNotFound(sifra, slug, strana),
    ucitajDatumPreseka(),
  ]);

  const { lista, nazivOpstine } = podaci;
  proveriStranu(strana, lista.stranicenje.brojStrana);

  const naziv = podaci.nazivDelatnosti ?? `Delatnost ${sifra}`;
  const osnova = `/delatnost/${sifra}/${slug}`;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          { tekst: "Delatnosti", href: "/delatnost" },
          { tekst: naziv, href: `/delatnost/${sifra}` },
          ...(strana > 1
            ? [{ tekst: nazivOpstine, href: osnova }, { tekst: `Strana ${strana}` }]
            : [{ tekst: nazivOpstine }]),
        ]}
      />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          {naziv} u opštini {nazivOpstine}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {formatBroj(lista.stranicenje.ukupno)} firmi u delatnosti {sifra} registrovanih u opštini{" "}
          {nazivOpstine} · rang lista po ukupnom prihodu
        </p>
        <p className="mt-3.5 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(datumPreseka)} · Izvor: Agencija za privredne registre
        </p>
      </header>

      <div className="flex flex-wrap gap-2 pb-6">
        <Link
          href={`/delatnost/${sifra}`}
          className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:border-accent-ring hover:bg-accent-soft hover:text-primary"
        >
          Sve firme: {naziv} →
        </Link>
        <Link
          href={`/grad/${slug}`}
          className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:border-accent-ring hover:bg-accent-soft hover:text-primary"
        >
          Sve firme u opštini {nazivOpstine} →
        </Link>
      </div>

      <PoredjenjeProvider>
        <ListaFirmi firme={lista.firme} redniBrojOd={(strana - 1) * lista.stranicenje.poStrani + 1} />
      </PoredjenjeProvider>

      <Paginacija osnova={osnova} strana={strana} brojStrana={lista.stranicenje.brojStrana} />

      <div className="pb-10" />
    </main>
  );
}
