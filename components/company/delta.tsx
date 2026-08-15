import { formatBroj, formatDatum } from "@/lib/format";
import type { Promena } from "@/lib/promena";

/**
 * Strelica i procenat u odnosu na prethodni mesečni presek (D1).
 *
 * Ne prikazuje se ako preseka za poređenje nema — prvi delta stiže tek sa
 * drugim mesečnim ingestom. Prazan prostor je bolji od izmišljene nule.
 */
export function Delta({
  promena,
  prethodniPresek,
}: {
  promena: Promena | null | undefined;
  prethodniPresek: string;
}) {
  if (!promena || promena.procenat === null) return null;

  const gore = promena.smer === "gore";
  const isto = promena.smer === "isto";
  const boja = isto ? "text-muted-foreground" : gore ? "text-success" : "text-danger";
  const strelica = isto ? "=" : gore ? "▲" : "▼";

  const kratakDatum = formatDatum(prethodniPresek).slice(0, 6); // "30.06."

  return (
    <p className={`mt-1.5 text-[12.5px] font-semibold tabular-nums ${boja}`}>
      <span aria-hidden>{strelica}</span>{" "}
      {formatBroj(Math.round(Math.abs(promena.procenat)), { nulaJePodatak: true })}%{" "}
      <span className="font-normal text-muted-foreground">
        u odnosu na prethodni presek ({kratakDatum})
      </span>
    </p>
  );
}
