"use client";

import { useRouter } from "next/navigation";

import { useSacuvane } from "@/components/company/sacuvane-store";
import { SearchBox } from "@/components/search/search-box";

/**
 * Biranje firme za poređenje.
 *
 * Isti `SearchBox` koji stoji na početnoj — samo mu izbor ne otvara stranicu
 * firme, nego sastavlja URL poređenja. `osnova` su firme koje su već izabrane;
 * nova se dodaje na kraj putanje.
 *
 * Sačuvane firme (localStorage, D2) se nude kao prečica: ko je već sačuvao
 * nekoliko firmi, najčešće njih i poredi.
 */
export function IzborFirme({
  osnova = [],
  autoFokus = false,
}: {
  osnova?: string[];
  autoFokus?: boolean;
}) {
  const router = useRouter();
  // Firma koja je već u poređenju ne nudi se ponovo.
  const sacuvane = useSacuvane().filter((f) => !osnova.includes(f.slug));

  function izaberi(slug: string) {
    if (osnova.includes(slug)) return;
    router.push(`/uporedi/${[...osnova, slug].join("/")}`);
  }

  return (
    <div>
      <SearchBox
        autoFokus={autoFokus}
        naIzbor={(firma) => izaberi(firma.slug)}
        placeholderTekst={
          osnova.length ? "Naziv sledeće firme, matični broj ili PIB…" : "Naziv firme, matični broj ili PIB…"
        }
      />

      {sacuvane.length ? (
        <div className="mt-3.5">
          <p className="text-[12.5px] text-muted-foreground">Iz vaših sačuvanih firmi:</p>
          <ul className="mt-2 flex list-none flex-wrap gap-2">
            {sacuvane.map((firma) => (
              <li key={firma.slug}>
                <button
                  type="button"
                  onClick={() => izaberi(firma.slug)}
                  className="rounded-ui border border-border bg-card px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-primary hover:text-primary"
                >
                  {firma.ime}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
