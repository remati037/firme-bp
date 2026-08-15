"use client";

import { prebaciSacuvanu, useSacuvane, type SacuvanaFirma } from "./sacuvane-store";

/**
 * „Sačuvaj firmu" bez naloga (D2).
 *
 * v1 nema registraciju (CLAUDE.md), a korisnik ipak dobija razlog da se vrati.
 * Lista živi na uređaju; kasniji nalozi mogu da preuzmu isti oblik: {slug, ime}.
 */
export function SaveButton({ slug, ime }: SacuvanaFirma) {
  const sacuvane = useSacuvane();
  const sacuvana = sacuvane.some((f) => f.slug === slug);

  return (
    <button
      type="button"
      onClick={() => prebaciSacuvanu({ slug, ime })}
      aria-pressed={sacuvana}
      title="Sačuvaj firmu u svoju listu (bez naloga)"
      className={`inline-flex items-center gap-[7px] rounded-ui border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
        sacuvana
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
      }`}
    >
      <span className="text-[15px] leading-none" aria-hidden>
        {sacuvana ? "★" : "☆"}
      </span>
      {sacuvana ? "Sačuvano" : "Sačuvaj"}
    </button>
  );
}
