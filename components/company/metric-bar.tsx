/**
 * Poređenje sa medijanom delatnosti, inline SVG.
 *
 * Bez biblioteka za grafikone (CLAUDE.md): jedan SVG od 40 bajtova markupa
 * koji se renderuje na serveru i ne pravi layout shift.
 *
 * Sredina trake je medijana delatnosti; oznaka levo od sredine znači ispod
 * medijane, desno iznad.
 */
export function MetricBar({
  labela,
  pozicija,
  opis,
}: {
  labela: string;
  /** 0–100, gde je 50 medijana delatnosti. */
  pozicija: number | null;
  opis: string;
}) {
  if (pozicija === null) return null;

  return (
    <div className="flex items-center gap-3.5">
      <span className="min-w-[92px] max-sm:min-w-0 text-[13.5px] text-muted-foreground">{labela}</span>
      <svg
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        className="h-4 min-w-0 flex-1"
        role="img"
        aria-label={`${labela}: ${opis}`}
      >
        <rect x="0" y="6" width="200" height="4" rx="2" fill="var(--border)" />
        <rect x="99" y="2" width="2" height="12" fill="var(--border-strong)" />
        <circle
          cx={(pozicija / 100) * 200}
          cy="8"
          r="6"
          fill="var(--primary)"
          stroke="var(--background)"
          strokeWidth="2.5"
        />
      </svg>
      <span className="min-w-[150px] max-sm:min-w-0 text-right text-[13.5px] font-semibold">{opis}</span>
    </div>
  );
}

/** Red pokazatelja bez trake: labela levo, vrednost desno. */
export function MetricRow({
  labela,
  vrednost,
}: {
  labela: string;
  /** Može da bude i `<Novac>`, koji nosi `data-dinara` za prebacivanje u evre. */
  vrednost: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="min-w-0 text-[13.5px] text-muted-foreground">{labela}</span>
      <span className="min-w-0 text-right text-[13.5px] font-semibold tabular-nums">{vrednost}</span>
    </div>
  );
}
