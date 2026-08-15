import Link from "next/link";

import { NAZIV_KATEGORIJE, type Clanak } from "@/lib/blog";
import { formatDatum } from "@/lib/format";

/**
 * Kartica članka. Ista se koristi u mreži na `/blog` i u "Srodni članci" na
 * strani članka, da se dva prikaza ne raziđu.
 *
 * Cover je tipografski, bez slika: 7 članaka ne opravdava pipeline za obradu
 * slika, a glif iz frontmatter-a (npr. "NS", "4690") nosi isto prepoznavanje
 * uz nula kilobajta.
 */

const BOJE: Record<string, string> = {
  "c-teal": "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  "c-slate": "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  "c-rose": "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  "c-amber": "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  "c-indigo": "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
  "c-sky": "bg-sky-500/12 text-sky-700 dark:text-sky-300",
};

export function KarticaClanka({ clanak, sazeto = false }: { clanak: Clanak; sazeto?: boolean }) {
  const boja = BOJE[clanak.boja] ?? BOJE["c-indigo"];

  return (
    <Link
      href={`/blog/${clanak.slug}`}
      className="flex flex-col gap-2.5 rounded-[var(--radius-card)] border border-border bg-card p-3 no-underline shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
    >
      <div
        className={`relative flex h-32 items-center justify-center rounded-[10px] ${boja}`}
        aria-hidden
      >
        <span className="absolute left-2.5 top-2.5 rounded-full bg-background/75 px-2 py-0.5 text-[11.5px] font-semibold">
          {NAZIV_KATEGORIJE[clanak.kategorija]}
        </span>
        <span className="text-[30px] font-extrabold tracking-tight">{clanak.glif}</span>
      </div>

      <div className="text-[15.5px] font-semibold leading-snug text-foreground">{clanak.naslov}</div>

      {sazeto ? null : (
        <div className="text-[13.5px] leading-relaxed text-muted-foreground">{clanak.excerpt}</div>
      )}

      <div className="mt-auto pt-2 text-[12.5px] text-muted-foreground">
        {formatDatum(clanak.datum)} · {clanak.minutaCitanja} min
      </div>
    </Link>
  );
}
