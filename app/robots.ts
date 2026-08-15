import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * robots.txt po SEO.md, sekcija 1.9.
 *
 * Ključno: svaki AI vendor ima ODVOJENE botove za treniranje i za pretragu.
 * Blokiranje pogrešnog izbacuje sajt iz citata u ChatGPT i Claude pretrazi,
 * pa su botovi za pretragu izričito dozvoljeni, imenom.
 *
 * Napomena o Google-Extended: kontroliše samo Gemini treniranje i ne utiče
 * ni na Google Search ni na AI Overviews.
 */

/** AI botovi za pretragu i citiranje. Ovi moraju da prolaze. */
const AI_PRETRAGA = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
];

/**
 * Botovi za treniranje modela. Poslovna odluka, u SEO.md preporuka je dozvoliti:
 * podaci su javni pod otvorenom licencom, a prisustvo u korpusu gradi asocijaciju
 * brenda Biznis priče sa temom srpskih firmi.
 */
const AI_TRENIRANJE = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot"];

/**
 * Zabrana crawl-a nad `/firma/` je SKINUTA 15.08.2026, odlukom vlasnika.
 *
 * Stajala je dok stranice firmi nisu bile gotove, jer je "Crawled - currently
 * not indexed" (SEO.md 5.5) signal kvaliteta koji se tehnikom ne popravlja
 * kasnije. Skinuta je zajedno sa uvođenjem `firme-1` u sitemap indeks — to
 * dvoje mora da se menja u istom potezu, jer je sitemap sa adresama koje su
 * botu zabranjene kontradiktoran signal.
 *
 * Ako ikada zatreba vraćanje, vraća se i `U_INDEKSU` u `lib/sitemap.ts`.
 */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_PRETRAGA, allow: "/" },
      { userAgent: AI_TRENIRANJE, allow: "/" },
      {
        userAgent: "*",
        allow: "/",
        // Parametri za sortiranje prave duplikate, a oni najviše troše crawl budžet.
        disallow: ["/api/", "/*?sort=", "/*?order="],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
