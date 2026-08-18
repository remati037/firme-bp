import type { RacunRed } from "@/lib/queries";

/**
 * Bankovni računi firme kao PRAVA HTML tabela sa `<caption>` i `<th scope>`
 * (isti pristup kao FinancialTable — SEO.md §7: tabela je format koji i čitač
 * ekrana i LLM čitaju bez greške).
 *
 * Kod firmi sa mnogo računa (npr. EPS — 50 računa) prvi redovi su vidljivi,
 * ostatak ide u nativni `<details>` — bez JS-a, sadržaj je u početnom HTML-u.
 *
 * Izvor: NBS Jedinstveni registar računa (migracija 008).
 */
export function RacuniLista({ racuni }: { racuni: RacunRed[] }) {
  if (racuni.length === 0) return null;

  const VIDNO = 8;
  const vidljivi = racuni.slice(0, VIDNO);
  const sakriveni = racuni.slice(VIDNO);

  const red = (r: RacunRed) => (
    <tr key={r.broj_racuna ?? r.banka ?? ""}>
      <th
        scope="row"
        className="border-b border-border px-5 py-[11px] text-left font-medium"
      >
        {r.banka ?? "—"}
      </th>
      <td className="border-b border-border px-5 py-[11px] text-right font-mono text-[13px] text-muted-foreground tabular-nums">
        {r.broj_racuna ?? "—"}
      </td>
    </tr>
  );

  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="px-5 pt-3.5 pb-1.5 text-left text-[13px] text-muted-foreground">
          Bankovni računi iz NBS Jedinstvenog registra računa
          {racuni.length > 1 ? ` · ${racuni.length} računa` : ""}
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground"
            >
              Banka
            </th>
            <th
              scope="col"
              className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground"
            >
              Broj računa
            </th>
          </tr>
        </thead>
        <tbody>{vidljivi.map(red)}</tbody>
      </table>

      {sakriveni.length > 0 ? (
        <details className="group [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between border-t border-border px-5 py-3 text-[13.5px] font-semibold text-accent-strong [&::marker]:content-['']">
            Prikaži još {sakriveni.length} računa
            <span
              className="text-base text-muted-foreground transition-transform duration-150 group-open:rotate-45"
              aria-hidden
            >
              +
            </span>
          </summary>
          <table className="w-full border-collapse border-t border-border text-sm">
            <tbody>{sakriveni.map(red)}</tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}
