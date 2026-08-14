import Link from "next/link";

import { ListaFirmi } from "@/components/category/lista-firmi";
import { Paginacija } from "@/components/category/paginacija";
import { StatTraka } from "@/components/category/stat-traka";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { formatBroj, formatDatum } from "@/lib/format";
import { mapaOpstina } from "@/lib/kategorije";
import { proveriStranu, ucitajDelatnostIliNotFound } from "@/lib/kategorije-strana";
import { ucitajDatumPreseka } from "@/lib/presek";
import { imeOpstine, slugOpstine } from "@/lib/prikaz";

/** Telo stranice delatnosti; deli ga prva strana i /strana/[broj]. */
export async function PrikazDelatnosti({ sifra, strana }: { sifra: string; strana: number }) {
  const [podaci, datumPreseka] = await Promise.all([
    ucitajDelatnostIliNotFound(sifra, strana),
    ucitajDatumPreseka(),
  ]);

  const { stat, lista } = podaci;
  proveriStranu(strana, lista.stranicenje.brojStrana);

  const naziv = podaci.naziv ?? `Delatnost ${sifra}`;
  const opstine = await opstineSaStrane(lista.firme.map((f) => f.opstina));

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          { tekst: "Delatnosti", href: "/delatnost" },
          ...(strana > 1
            ? [{ tekst: naziv, href: `/delatnost/${sifra}` }, { tekst: `Strana ${strana}` }]
            : [{ tekst: naziv }]),
        ]}
      />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          Najveće firme: {naziv}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Šifra delatnosti {sifra} · {formatBroj(stat?.broj_firmi, { nulaJePodatak: true })}{" "}
          registrovanih firmi · rang lista po ukupnom prihodu
        </p>
        <p className="mt-3.5 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(datumPreseka)} · Izvor: Agencija za privredne registre
        </p>
      </header>

      <StatTraka
        brojFirmi={stat?.broj_firmi}
        brojAktivnih={stat?.broj_aktivnih}
        brojSaIzvestajem={stat?.broj_sa_izvestajem}
        medijanPrihoda={stat?.medijan_prihoda}
        medijanMarze={stat?.medijan_marze}
        medijanPrihodaPoZaposlenom={stat?.medijan_prihoda_po_zaposlenom}
      />

      {opstine.length ? (
        <section className="pt-6">
          <h2 className="mb-2.5 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
            Ista delatnost po opštinama
          </h2>
          <div className="flex flex-wrap gap-2">
            {opstine.map((o) => (
              <Link
                key={o.slug}
                href={`/delatnost/${sifra}/${o.slug}`}
                className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:border-accent-ring hover:bg-accent-soft hover:text-primary"
              >
                {o.naziv}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pt-6 pb-10">
        <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">
          Firme u delatnosti {sifra}
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
          osnova={`/delatnost/${sifra}`}
          strana={strana}
          brojStrana={lista.stranicenje.brojStrana}
        />
      </section>
    </main>
  );
}

/** Opštine firmi sa ove strane, bez ponavljanja, najviše šest. */
async function opstineSaStrane(
  opstineFirmi: (string | null)[],
): Promise<{ slug: string; naziv: string }[]> {
  const poznate = await mapaOpstina();
  const brojac = new Map<string, number>();

  for (const opstina of opstineFirmi) {
    const slug = slugOpstine(opstina);
    if (!slug || !poznate.has(slug)) continue;
    brojac.set(slug, (brojac.get(slug) ?? 0) + 1);
  }

  return [...brojac.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([slug]) => ({ slug, naziv: imeOpstine(poznate.get(slug)?.naziv_lat) }));
}
