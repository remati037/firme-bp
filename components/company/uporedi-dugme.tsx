"use client";

import Link from "next/link";

import { dogadjaj } from "@/lib/analitika";

/**
 * „Uporedi" na stranici firme.
 *
 * Klijentska komponenta je samo zbog merenja — u HTML-u ostaje običan
 * `<a href>`, pa radi bez JS-a, prima srednji klik i ne pomera raspored.
 * Ciljna stranica je `noindex` i zatvorena u robots.txt, pa ne troši crawl
 * budžet stranica firmi.
 *
 * Događaj `uporedi_klik` je jedini način da se sazna da li poređenje ikoga
 * zanima pre nego što se na njega naslanja bilo šta veće (nalozi, praćenje).
 */
export function UporediDugme({ slug }: { slug: string }) {
  return (
    <Link
      href={`/uporedi/${slug}`}
      onClick={() => dogadjaj("uporedi_klik", { slug_firme: slug })}
      className="inline-flex items-center gap-[7px] rounded-ui border border-border bg-card px-3.5 py-2 text-[13.5px] font-semibold text-foreground no-underline transition-colors hover:border-primary hover:text-primary"
      title="Uporedite ovu firmu sa drugom, bez naloga i registracije"
    >
      <span className="text-[15px] leading-none" aria-hidden>
        ⇄
      </span>
      Uporedi
    </Link>
  );
}
