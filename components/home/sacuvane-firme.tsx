"use client";

import Link from "next/link";

import { useSacuvane } from "@/components/company/sacuvane-store";

/**
 * „Sačuvane firme" na početnoj (D2).
 *
 * Sekcija ne postoji dok korisnik nema nijednu sačuvanu firmu — ni u HTML-u,
 * pa nema praznog prostora ni za posetioca ni za crawlera. Nije SEO sadržaj;
 * svrha je povratna poseta.
 */
export function SacuvaneFirme() {
  const firme = useSacuvane();

  if (!firme.length) return null;

  return (
    <section className="pt-8">
      <div className="mb-[18px] flex items-baseline justify-between gap-4">
        <h2 className="text-[21px] font-bold tracking-[-0.02em]">Sačuvane firme</h2>
        <span className="text-[12.5px] text-muted-foreground">
          čuvaju se na ovom uređaju, bez naloga
        </span>
      </div>

      <ul className="grid list-none gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {firme.map((firma) => (
          <li key={firma.slug}>
            <Link
              href={`/firma/${firma.slug}`}
              className="flex h-full items-center justify-between gap-3 rounded-ui border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline transition duration-150 hover:-translate-y-px hover:border-accent-ring hover:bg-accent-soft"
            >
              <span className="min-w-0 truncate">{firma.ime}</span>
              <span className="text-accent-strong" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
