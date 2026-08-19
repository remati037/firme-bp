/**
 * Choropleth mapa Srbije po okruzima — čist inline SVG, bez client biblioteka.
 *
 * Server-rendered: boja po okrugu se računa u React-u, hover tooltip je SVG
 * <title> (nativan, bez JS-a), legenda je HTML. Dark mode ide kroz CSS
 * varijable --map-0 … --map-4 (app/globals.css).
 */

import { formatBroj, formatRSD } from "@/lib/format";
import { SRBIJA_OKRUZI, VIEW_BOX } from "@/lib/geo/srbija-okruzi";
import { kvantilBucket, type OkrugStat } from "@/lib/mapa-srbije";

const BROJ_KORAKA = 5;

export function ChoropletSrbije({
  okruzi,
  vrednost,
  formatVrednost,
  nazivMetrike,
}: {
  okruzi: OkrugStat[];
  /** Vrednost metrike za okrug (npr. broj firmi ili prihod u hiljadama). */
  vrednost: (o: OkrugStat) => number;
  formatVrednost: (v: number) => string;
  nazivMetrike: string;
}) {
  const poIso = new Map(okruzi.map((o) => [o.iso, o]));
  const sveVrednosti = okruzi.map(vrednost);

  // Vrednosti po bucketima, za legenda etikete.
  const bucketVrednosti: number[][] = Array.from({ length: BROJ_KORAKA }, () => []);
  for (const o of okruzi) {
    bucketVrednosti[kvantilBucket(sveVrednosti, vrednost(o), BROJ_KORAKA)].push(vrednost(o));
  }

  return (
    <figure className="not-prose">
      <svg
        viewBox={VIEW_BOX}
        role="img"
        aria-label={`Mapa Srbije — ${nazivMetrike} po okruzima`}
        className="mapa-srbije h-auto w-full select-none"
      >
        {SRBIJA_OKRUZI.map((g) => {
          const stat = poIso.get(g.iso);
          const v = stat ? vrednost(stat) : 0;
          const bucket = stat ? kvantilBucket(sveVrednosti, v, BROJ_KORAKA) : null;
          return (
            <path
              key={g.iso}
              d={g.d}
              fill={bucket === null ? "var(--map-nula)" : `var(--map-${bucket})`}
              stroke="var(--map-stroke)"
              strokeWidth={1.4}
              strokeLinejoin="round"
              fillRule="evenodd"
              tabIndex={0}
            >
              <title>
                {stat
                  ? `${stat.naziv}\n${nazivMetrike}: ${formatVrednost(v)}\nFirmi: ${formatBroj(stat.brojFirmi)}`
                  : g.iso}
              </title>
            </path>
          );
        })}
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[12.5px] text-muted-foreground">{nazivMetrike} po okrugu</span>
        {bucketVrednosti.map((vrednosti, i) => {
          const bezNula = vrednosti.filter((x) => x > 0);
          const etiketa = bezNula.length
            ? `${formatVrednost(Math.min(...bezNula))} – ${formatVrednost(Math.max(...bezNula))}`
            : "nema podataka";
          return (
            <span key={i} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <span
                aria-hidden
                className="inline-block size-3 rounded-[3px] border border-black/10 dark:border-white/20"
                style={{ backgroundColor: `var(--map-${i})` }}
              />
              {etiketa}
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}

/** Vrednost u dinarima (prihod) za legenda etikete — hiljade → RSD. */
export function formatPrihodHiljade(v: number): string {
  return formatRSD(v);
}
