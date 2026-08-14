import { Card } from "@/components/ui/card";
import { formatBroj, formatProcenat, formatRSD } from "@/lib/format";

/**
 * Traka sa statistikom kategorije. Sve vrednosti dolaze iz materijalizovanih
 * view-ova (`mv_delatnost_stats`, `mv_opstina_stats`) — nijedna se ne računa
 * u runtime-u.
 *
 * Medijane, ne proseci: jedna Elektroprivreda povuče prosek delatnosti toliko
 * da broj prestane da opisuje bilo koju stvarnu firmu.
 */
export function StatTraka({
  brojFirmi,
  brojAktivnih,
  brojSaIzvestajem,
  medijanPrihoda,
  medijanMarze,
  medijanPrihodaPoZaposlenom,
}: {
  brojFirmi: number | null | undefined;
  brojAktivnih?: number | null;
  brojSaIzvestajem?: number | null;
  medijanPrihoda?: number | null;
  medijanMarze?: number | null;
  medijanPrihodaPoZaposlenom?: number | null;
}) {
  const stavke = [
    { naziv: "Firmi ukupno", vrednost: formatBroj(brojFirmi, { nulaJePodatak: true }) },
    { naziv: "Aktivnih", vrednost: formatBroj(brojAktivnih, { nulaJePodatak: true }) },
    { naziv: "Sa izveštajem", vrednost: formatBroj(brojSaIzvestajem, { nulaJePodatak: true }) },
    { naziv: "Medijan prihoda", vrednost: formatRSD(medijanPrihoda) },
    { naziv: "Medijan marže", vrednost: formatProcenat(medijanMarze) },
    { naziv: "Medijan prihoda po zaposlenom", vrednost: formatRSD(medijanPrihodaPoZaposlenom) },
  ];

  return (
    <Card className="p-0">
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
        {stavke.map((s) => (
          <div key={s.naziv} className="bg-card px-4 py-3.5">
            <dt className="text-[11.5px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
              {s.naziv}
            </dt>
            <dd className="mt-1 text-[15px] font-bold tabular-nums">{s.vrednost}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
