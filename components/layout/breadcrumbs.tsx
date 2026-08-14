import Link from "next/link";

import { apsolutniUrl } from "@/lib/site";

import { JsonLd } from "../seo/json-ld";

export type Mrvica = { tekst: string; href?: string };

/**
 * Hlebne mrvice + BreadcrumbList JSON-LD.
 *
 * BreadcrumbList je jedini rich result koji se zaista pojavljuje u SERP-u
 * (SEO.md §4.1), pa markup i vidljiva putanja uvek idu zajedno — nikad jedno
 * bez drugog.
 */
export function Breadcrumbs({ mrvice }: { mrvice: Mrvica[] }) {
  const stavke = mrvice.map((m, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: m.tekst,
    ...(m.href ? { item: apsolutniUrl(m.href) } : {}),
  }));

  return (
    <>
      <nav aria-label="Putanja" className="pt-4.5 text-[13.5px] text-muted-foreground">
        <ol className="flex list-none flex-wrap gap-1.5">
          {mrvice.map((m, i) => (
            <li key={`${m.tekst}-${i}`} className="flex items-center gap-1.5">
              {i > 0 ? (
                <span className="text-border-strong" aria-hidden>
                  /
                </span>
              ) : null}
              {m.href ? (
                <Link href={m.href} className="text-muted-foreground no-underline hover:text-primary">
                  {m.tekst}
                </Link>
              ) : (
                <span className="font-medium text-foreground" aria-current="page">
                  {m.tekst}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <JsonLd
        podaci={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: stavke,
        }}
      />
    </>
  );
}
