import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KarticaClanka } from "@/components/blog/kartica-clanka";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import {
  clanakPoSlugu,
  NAZIV_KATEGORIJE,
  razdvojLead,
  srodniClanci,
  sviClanci,
  uHtml,
} from "@/lib/blog";
import { formatDatum } from "@/lib/format";
import { apsolutniUrl, BREND } from "@/lib/site";

/**
 * `/blog/[slug]` — strana članka.
 *
 * Za razliku od stranica firmi, ovde brend IDE u `title`: članak je autorski
 * sadržaj i "Biznis priče" je tu signal izvora, a ne trošenje prostora.
 *
 * Svi članci su poznati u vreme builda, pa su sve strane statične i nijedan
 * poziv ka bazi ne postoji na ovoj ruti.
 */

export const revalidate = 2592000;
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return sviClanci().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const clanak = clanakPoSlugu(slug);
  if (!clanak) return {};

  const naslov = `${clanak.naslov} | ${BREND}`;
  const url = apsolutniUrl(`/blog/${clanak.slug}`);

  return {
    title: naslov,
    description: clanak.excerpt,
    alternates: { canonical: url },
    openGraph: {
      title: naslov,
      description: clanak.excerpt,
      url,
      type: "article",
      publishedTime: clanak.datum,
    },
  };
}

export default async function StranaClanka({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clanak = clanakPoSlugu(slug);
  if (!clanak) notFound();

  const { lead, ostatak } = razdvojLead(clanak.telo);
  const telo = uHtml(ostatak);
  const srodni = srodniClanci(clanak);
  const url = apsolutniUrl(`/blog/${clanak.slug}`);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          { tekst: "Blog", href: "/blog" },
          { tekst: clanak.naslov },
        ]}
      />

      <article className="mx-auto max-w-[760px] pt-8">
        <header>
          <div className="text-[12.5px] text-muted-foreground">
            <Link
              href={`/blog?kategorija=${clanak.kategorija}`}
              className="font-semibold text-primary no-underline"
            >
              {NAZIV_KATEGORIJE[clanak.kategorija]}
            </Link>{" "}
            · {formatDatum(clanak.datum)} · {clanak.minutaCitanja} min čitanja
          </div>

          <h1 className="mt-3 text-[clamp(26px,4vw,38px)] font-extrabold leading-[1.15] tracking-[-0.03em]">
            {clanak.naslov}
          </h1>

          {lead ? (
            <p className="mt-4 text-[18px] leading-relaxed text-muted-foreground">{lead}</p>
          ) : null}
        </header>

        {/* HTML dolazi iz našeg Markdown-a u repou, ne iz korisničkog unosa. */}
        <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: telo }} />

        <div className="mt-10 flex items-center gap-3 border-t border-border pt-5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold"
            aria-hidden
          >
            BP
          </div>
          <div>
            <div className="text-[14.5px] font-semibold">{clanak.autor}</div>
            <div className="text-[13px] text-muted-foreground">
              Analize zasnovane isključivo na javnim podacima APR-a · tekst se ažurira sa svakim
              novim presekom
            </div>
          </div>
        </div>
      </article>

      {srodni.length ? (
        <section className="mx-auto max-w-[760px] py-10">
          <h2 className="mb-3.5 text-[19px] font-bold">Srodni članci</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {srodni.map((c) => (
              <KarticaClanka key={c.slug} clanak={c} sazeto />
            ))}
          </div>
        </section>
      ) : null}

      <JsonLd
        podaci={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: clanak.naslov,
          description: clanak.excerpt,
          datePublished: clanak.datum,
          dateModified: clanak.datum,
          inLanguage: "sr-Latn-RS",
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          author: { "@type": "Organization", name: clanak.autor },
          publisher: { "@type": "Organization", name: BREND, url: apsolutniUrl("/") },
        }}
      />
    </main>
  );
}
