import { U_INDEKSU, xmlIndeks } from "@/lib/sitemap";

/**
 * Sitemap indeks.
 *
 * Nabraja samo segmente koji su stvarno spremni za slanje. Slojevi firmi se
 * generišu i dostupni su na svojim adresama, ali ne ulaze u indeks dok
 * `robots.txt` drži `Disallow: /firma/` — poslati Google-u sitemap sa
 * adresama koje mu je crawl zabranjen je kontradiktoran signal.
 *
 * Pri lansiranju se skida zabrana iz `app/robots.ts` i proširi `U_INDEKSU`,
 * redosledom iz SEO.md §5.3 (Dan 0, Dan 14, Dan 30).
 */

// Sitemap se ne menja između mesečnih ingesta.
export const revalidate = 86_400;

export function GET(): Response {
  return new Response(xmlIndeks(U_INDEKSU), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
