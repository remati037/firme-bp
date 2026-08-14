import { cn } from "@/lib/utils";
import { vrstaStatusa, type VrstaStatusa } from "@/lib/prikaz";

/**
 * Status firme kao badge. Boje su fiksne u obe teme (dizajn tokeni):
 * aktivan zeleno, likvidacija žuto, stečaj crveno, ostalo sivo sa ivicom.
 */
const STILOVI: Record<VrstaStatusa, string> = {
  aktivan: "bg-success text-white",
  likvidacija: "bg-warning text-warning-foreground",
  stecaj: "bg-danger text-white",
  neutralno: "border border-border-strong text-neutral",
};

export function CompanyBadge({
  status,
  statusAktivan,
  className,
}: {
  status: string | null | undefined;
  statusAktivan?: boolean | null;
  className?: string;
}) {
  const vrsta = vrstaStatusa(status, statusAktivan);
  const tekst = status?.trim() || (statusAktivan ? "Aktivan" : "Nepoznat status");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-[11px] py-[3px] text-[12.5px] font-semibold whitespace-nowrap",
        STILOVI[vrsta],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {tekst}
    </span>
  );
}
