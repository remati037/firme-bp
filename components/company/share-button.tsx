"use client";

import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Deljenje stranice firme.
 *
 * Na telefonu otvara sistemski meni (Viber, WhatsApp), na desktopu kopira
 * link. Odluka se donosi u trenutku klika, ne pri renderu, da server i klijent
 * ispisu isti HTML.
 */
export function ShareButton({ naslov, url }: { naslov: string; url: string }) {
  const [kopirano, setKopirano] = useState(false);
  const tajmer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (tajmer.current && clearTimeout(tajmer.current)), []);

  async function podeli() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: naslov, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setKopirano(true);
      if (tajmer.current) clearTimeout(tajmer.current);
      tajmer.current = setTimeout(() => setKopirano(false), 1500);
    } catch {
      // Korisnik je otkazao deljenje ili nema dozvolu — nema šta da se prijavi.
    }
  }

  return (
    <button
      type="button"
      onClick={podeli}
      className="inline-flex items-center gap-1.5 rounded-ui border border-border px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:border-accent-ring hover:bg-accent-soft hover:text-primary"
    >
      {kopirano ? <Check size={14} aria-hidden /> : <Share2 size={14} aria-hidden />}
      {kopirano ? "Link kopiran" : "Podeli"}
    </button>
  );
}
