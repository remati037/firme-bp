import { ListaFirmi } from "@/components/category/lista-firmi";
import { Paginacija } from "@/components/category/paginacija";
import { StatTraka } from "@/components/category/stat-traka";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { formatBroj, formatDatum } from "@/lib/format";
import { proveriStranu, ucitajGradIliNotFound } from "@/lib/kategorije-strana";
import { ucitajDatumPreseka } from "@/lib/presek";

/** Telo stranice opštine; deli ga prva strana i /strana/[broj]. */
export async function PrikazOpstine({ slug, strana }: { slug: string; strana: number }) {
  const [podaci, datumPreseka] = await Promise.all([
    ucitajGradIliNotFound(slug, strana),
    ucitajDatumPreseka(),
  ]);

  const { stat, lista, naziv } = podaci;
  proveriStranu(strana, lista.stranicenje.brojStrana);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          { tekst: "Opštine", href: "/grad" },
          ...(strana > 1
            ? [{ tekst: naziv, href: `/grad/${slug}` }, { tekst: `Strana ${strana}` }]
            : [{ tekst: naziv }]),
        ]}
      />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          Najveće firme u opštini {naziv}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {formatBroj(stat?.broj_firmi, { nulaJePodatak: true })} registrovanih privrednih društava
          · rang lista po ukupnom prihodu
          {podaci.opstina.okrug ? ` · ${podaci.opstina.okrug}` : ""}
        </p>
        <p className="mt-3.5 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(datumPreseka)} · Izvor: Agencija za privredne registre
        </p>
      </header>

      <StatTraka
        brojFirmi={stat?.broj_firmi}
        brojAktivnih={stat?.broj_aktivnih}
        brojSaIzvestajem={stat?.broj_sa_izvestajem}
        ukupanPrihod={stat?.ukupan_prihod}
        ukupnoZaposlenih={stat?.ukupno_zaposlenih}
        medijanPrihoda={stat?.medijan_prihoda}
        medijanMarze={stat?.medijan_marze}
        medijanPrihodaPoZaposlenom={stat?.medijan_prihoda_po_zaposlenom}
      />

      <section className="pt-6 pb-10">
        <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">
          Firme u opštini {naziv}
          {lista.stranicenje.brojStrana > 1 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              strana {formatBroj(strana)} od {formatBroj(lista.stranicenje.brojStrana)}
            </span>
          ) : null}
        </h2>

        <ListaFirmi
          firme={lista.firme}
          redniBrojOd={(strana - 1) * lista.stranicenje.poStrani + 1}
        />

        <Paginacija
          osnova={`/grad/${slug}`}
          strana={strana}
          brojStrana={lista.stranicenje.brojStrana}
        />
      </section>
    </main>
  );
}
