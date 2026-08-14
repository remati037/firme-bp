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
 * PRIVREMENO. Stranice firmi se ne puštaju u crawl dok kontrolna lista iz
 * SEO.md 11 ne prođe. Razlog je SEO.md 5.5: "Crawled - currently not indexed"
 * je signal kvaliteta koji se tehnikom ne popravlja kasnije, pa 133.634
 * poluzavršene stranice puštene odjednom rade protiv nas.
 *
 * Skida se jednom linijom pri lansiranju, zajedno sa slanjem prvog sitemapa.
 */
const JOS_NIJE_SPREMNO = ["/firma/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_PRETRAGA, allow: "/" },
      { userAgent: AI_TRENIRANJE, allow: "/" },
      {
        userAgent: "*",
        allow: "/",
        // Parametri za sortiranje prave duplikate, a oni najviše troše crawl budžet.
        disallow: ["/api/", "/*?sort=", "/*?order=", ...JOS_NIJE_SPREMNO],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
