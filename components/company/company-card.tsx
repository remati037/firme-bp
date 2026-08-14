import Link from "next/link";

import { formatBroj, formatRSDKompaktno, NEMA_PODATAKA } from "@/lib/format";
import { imeOpstine, kratkoIme } from "@/lib/prikaz";
import type { KarticaFirme } from "@/lib/queries";

import { CompanyBadge } from "./company-badge";

/**
 * Kartica firme u listama. Ceo blok je jedan pravi `<a href>` — interni
 * linkovi su jedina poluga koja realno pomera indeksiranje 133k stranica
 * (SEO.md §2), pa nijedan ne sme da bude JS dugme.
 *
 * Brojevi su u kompaktnom zapisu ("238,4 mrd RSD"); pune vrednosti idu samo
 * u tabele.
 */
export function CompanyCard({ firma }: { firma: KarticaFirme }) {
  const ime = kratkoIme({
    poslovno_ime: firma.ime,
    poslovno_ime_kratko: firma.imeKratko,
    opstina: firma.opstina,
  });
  const opstina = imeOpstine(firma.opstina);

  return (
    <Link
      href={`/firma/${firma.slug}`}
      className="block rounded-card border border-border bg-card px-5 py-[18px] no-underline shadow-card transition duration-150 hover:-translate-y-px hover:border-accent-ring hover:shadow-pop"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] leading-[1.35] font-bold text-foreground">{ime}</div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {[opstina, firma.zaposleni ? `${formatBroj(firma.zaposleni)} zaposlenih` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15.5px] font-bold tabular-nums">
            {firma.vrednost !== undefined && firma.vrstaVrednosti === "broj"
              ? formatBroj(firma.vrednost)
              : formatRSDKompaktno(firma.vrednost ?? firma.ukupni_prihodi)}
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between border-t border-border pt-3">
        <CompanyBadge status={firma.status} statusAktivan={firma.status_aktivan} />
        <span className="text-xs text-muted-foreground">
          {firma.ukupni_prihodi && firma.godina ? `prihod ${firma.godina}.` : NEMA_PODATAKA}
        </span>
      </div>
    </Link>
  );
}
