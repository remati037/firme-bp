import { getSupabaseServerClient } from "@/lib/supabase";
import { SEGMENTI, U_INDEKSU, type Segment, unosiZaSegment, xmlSitemap } from "@/lib/sitemap";

/**
 * Pojedinačni segment sitemapa: /sitemaps/firme-1.xml i ostali.
 *
 * Pri build-u se prerenderuju samo segmenti koji su u indeksu. Slojevi firmi
 * se prave na prvi zahtev i posle toga žive u ISR kešu: `firme-bez-fi` traži
 * 39.406 redova i meri 25 s, a `firme-1` i `firme-2` po 45 upita ka bazi.
 * Da se to radi pri svakom build-u, build bi trajao minutima, a ti fajlovi
 * ionako nisu u indeksu do lansiranja.
 */

export const revalidate = 86_400;

export function generateStaticParams(): { fajl: string }[] {
  return U_INDEKSU.map((segment) => ({ fajl: `${segment}.xml` }));
}

export async function GET(
  _zahtev: Request,
  { params }: { params: Promise<{ fajl: string }> },
): Promise<Response> {
  const { fajl } = await params;
  const segment = fajl.replace(/\.xml$/, "") as Segment;

  if (!SEGMENTI.includes(segment)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const unosi = await unosiZaSegment(getSupabaseServerClient(), segment);
    return new Response(xmlSitemap(unosi), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (greska) {
    // Prazan sitemap je gori od greške: Google bi zaključio da su stranice
    // nestale. Bolje 500 pa da pokuša ponovo.
    console.error(`sitemap ${segment}:`, greska instanceof Error ? greska.message : greska);
    return new Response("Greška pri generisanju sitemapa", { status: 500 });
  }
}
