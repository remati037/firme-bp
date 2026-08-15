import { formatProcenat } from "@/lib/format";

/**
 * Kružić sa medijanom marže u kategoriji (odluka 15.08.2026).
 *
 * MEDIJANA, ne prosek — projektno pravilo, i prosek bi tražio novu kolonu u
 * view-u. Vrednost dolazi iz `mv_delatnost_stats` / `mv_opstina_stats`.
 *
 * Skala: pun krug je marža od 25 odsto. Marže privrednih društava se u ovom
 * setu drže u jednocifrenom opsegu, pa bi skala 0–100 svela svaki luk na
 * nevidljivu crticu. Negativna medijana daje prazan krug, ne obrnut luk.
 */
const R = 26;
const OBIM = 2 * Math.PI * R;
const PUNA_SKALA = 25;

export function MarginRing({ marza }: { marza: number | null | undefined }) {
  if (marza === null || marza === undefined || Number.isNaN(marza)) return null;

  const udeo = Math.min(1, Math.max(0, marza / PUNA_SKALA));
  const luk = udeo * OBIM;

  return (
    <div className="ml-4 inline-flex shrink-0 flex-col items-center gap-0.5">
      <div
        className="relative h-16 w-16"
        title="Medijana marže u kategoriji, iz APR izveštaja"
      >
        <svg width="64" height="64" viewBox="0 0 64 64" className="block -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" stroke="var(--border)" strokeWidth="7" />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${luk.toFixed(1)} ${(OBIM - luk).toFixed(1)}`}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[13.5px] font-extrabold tracking-[-0.01em] tabular-nums">
          {formatProcenat(marza)}
        </span>
      </div>
      <span className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        medijana marže
      </span>
    </div>
  );
}
