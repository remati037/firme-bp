"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Kopiranje matičnog broja i PIB-a jednim klikom.
 *
 * Klijentska je samo ova dugmad — sam podatak (broj) je u serverskom HTML-u
 * pored nje, pa crawler vidi vrednost i kad JS ne radi (SEO.md §1.5).
 */
export function CopyButton({ vrednost, naziv }: { vrednost: string; naziv: string }) {
  const [kopirano, setKopirano] = useState(false);
  const tajmer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (tajmer.current && clearTimeout(tajmer.current)), []);

  async function kopiraj() {
    try {
      await navigator.clipboard.writeText(vrednost);
      setKopirano(true);
      if (tajmer.current) clearTimeout(tajmer.current);
      tajmer.current = setTimeout(() => setKopirano(false), 1500);
    } catch {
      // Bez dozvole za clipboard nema šta da se uradi; vrednost je vidljiva na stranici.
    }
  }

  return (
    <button
      type="button"
      onClick={kopiraj}
      aria-label={`Kopiraj ${naziv}`}
      title={`Kopiraj ${naziv}`}
      className={`inline-flex items-center rounded-[5px] px-1 py-0.5 transition-colors ${
        kopirano ? "text-success" : "text-muted-foreground hover:bg-accent-soft hover:text-primary"
      }`}
    >
      {kopirano ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      <span className="sr-only" role="status">
        {kopirano ? `${naziv} je kopiran` : ""}
      </span>
    </button>
  );
}
