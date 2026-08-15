"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { primeniNaDom, upisiValutu, useValuta } from "./valuta";

/**
 * Prebacivanje prikaza RSD ↔ EUR.
 *
 * Server renderuje iznose u dinarima i uz svaki stavi `data-dinara` sa tačnom
 * vrednošću (`components/ui/novac.tsx`). Ovde se samo menja tekst tih čvorova:
 * nema drugog URL-a, nema server re-rendera, JSON-LD i canonical ostaju u
 * dinarima (odluka 15.08.2026).
 *
 * Prepisivanje se ponavlja i posle klijentske navigacije, jer nova stranica
 * stiže sa serverskim RSD tekstom.
 */
export function CurrencyToggle() {
  const putanja = usePathname();
  const valuta = useValuta();

  useEffect(() => {
    primeniNaDom(valuta);
  }, [valuta, putanja]);

  return (
    <div
      role="group"
      aria-label="Valuta prikaza"
      className="inline-flex items-center gap-0.5 rounded-ui border border-border bg-card p-[3px]"
    >
      {(["RSD", "EUR"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => upisiValutu(v)}
          aria-pressed={valuta === v}
          className={`rounded-[7px] px-2.5 py-1 text-[12.5px] font-bold transition-colors ${
            valuta === v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
