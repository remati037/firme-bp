import { formatBroj, formatRSD, NEMA_PODATAKA } from "@/lib/format";
import type { Finansije } from "@/lib/queries";

/**
 * Finansije kao PRAVA HTML tabela sa `<caption>` i `<th scope>` (SEO.md §7).
 *
 * Ne div grid: tabela je format koji i čitač ekrana i LLM čitaju bez greške.
 * Vrednosti su pune, u dinarima (kartice koriste kompaktan zapis, tabele nikad).
 */
export function FinancialTable({ redovi }: { redovi: Finansije[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="px-5 pt-3.5 pb-1.5 text-left text-[13px] text-muted-foreground">
          Finansijski izveštaji, vrednosti u dinarima. Izvor: Agencija za privredne registre.
        </caption>
        <thead>
          <tr>
            <Th>Godina</Th>
            <Th>Prihodi</Th>
            <Th>Neto rezultat</Th>
            <Th>Kapital</Th>
            <Th>Poslovna imovina</Th>
            <Th>Zaposleni</Th>
          </tr>
        </thead>
        <tbody>
          {redovi.map((red) => {
            const netoRezultat = (red.neto_dobitak ?? 0) - (red.neto_gubitak ?? 0);
            return (
              <tr key={red.godina} className="hover:bg-muted">
                <th
                  scope="row"
                  className="border-b border-border px-5 py-[11px] text-left font-medium tabular-nums"
                >
                  {red.godina}
                </th>
                <Td>{formatRSD(red.ukupni_prihodi)}</Td>
                <Td
                  className={
                    netoRezultat > 0
                      ? "font-semibold text-success"
                      : netoRezultat < 0
                        ? "font-semibold text-danger"
                        : undefined
                  }
                >
                  {netoRezultat === 0 ? NEMA_PODATAKA : formatRSD(netoRezultat)}
                </Td>
                <Td>{formatRSD(red.kapital)}</Td>
                <Td>{formatRSD(red.poslovna_imovina)}</Td>
                <Td>{formatBroj(red.prosecan_broj_zaposlenih)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-border bg-muted px-5 py-2 text-right text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase first:text-left"
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  const jePrazno = children === NEMA_PODATAKA;
  return (
    <td
      className={`border-b border-border px-5 py-[11px] text-right tabular-nums ${
        jePrazno ? "text-neutral italic" : ""
      } ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
