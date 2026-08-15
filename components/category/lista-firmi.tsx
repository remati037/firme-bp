import { CompanyCard } from "@/components/company/company-card";
import { CmpCheckbox } from "@/components/category/poredjenje";
import { formatBroj } from "@/lib/format";
import type { KarticaFirme } from "@/lib/queries";

/**
 * Numerisana lista firmi na kategorijskoj stranici.
 *
 * Redni broj je rang iz view-a, ne pozicija na strani — tako se na strani 4
 * vide brojevi 151 i dalje, a firme bez izveštaja (koje ranga nemaju) idu na
 * kraj liste sa crticom umesto broja.
 */
export function ListaFirmi({ firme, redniBrojOd }: { firme: KarticaFirme[]; redniBrojOd?: number }) {
  if (!firme.length) {
    return (
      <p className="rounded-card border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        Na ovoj strani nema firmi.
      </p>
    );
  }

  return (
    <ol className="list-none space-y-3">
      {firme.map((firma, i) => (
        <li key={firma.maticni_broj} className="flex gap-3">
          <CmpCheckbox firma={firma} />
          <span
            className="min-w-[30px] pt-1 text-right text-[15px] font-extrabold text-border-strong tabular-nums"
            aria-hidden
          >
            {firma.rang ? formatBroj(firma.rang) : redniBrojOd ? formatBroj(redniBrojOd + i) : "—"}
          </span>
          <div className="min-w-0 flex-1">
            <CompanyCard firma={firma} />
          </div>
        </li>
      ))}
    </ol>
  );
}
