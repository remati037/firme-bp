import type { Pitanje } from "@/lib/faq";

/**
 * Česta pitanja kao nativni `<details>` — bez JS-a, pa je odgovor u početnom
 * HTML-u i kad crawler ne izvršava skripte (SEO.md §1.5).
 * Isti sadržaj ide i u FAQPage JSON-LD.
 */
export function FaqList({ pitanja }: { pitanja: Pitanje[] }) {
  return (
    <div className="space-y-2">
      {pitanja.map((p) => (
        <details
          key={p.pitanje}
          className="group rounded-ui border border-border bg-card [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-[14.5px] font-semibold [&::marker]:content-['']">
            <h3 className="text-[14.5px] font-semibold">{p.pitanje}</h3>
            <span
              className="text-lg text-muted-foreground transition-transform duration-150 group-open:rotate-45"
              aria-hidden
            >
              +
            </span>
          </summary>
          <div className="px-4 pb-3.5 text-sm text-muted-foreground">{p.odgovor}</div>
        </details>
      ))}
    </div>
  );
}
