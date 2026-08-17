import type { Metadata } from "next";
import Link from "next/link";

import { KarticaClanka } from "@/components/blog/kartica-clanka";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { KATEGORIJE, NAZIV_KATEGORIJE, sviClanci, type Kategorija } from "@/lib/blog";
import { formatDatum } from "@/lib/format";
import { apsolutniUrl, BREND } from "@/lib/site";

/**
 * `/blog` — spisak članaka.
 *
 * Filtriranje po kategoriji je `?kategorija=X` i radi bez ijedne linije JS-a:
 * čipovi su obični linkovi, strana je serverska. Isto važi i za paginaciju.
 *
 * Članci se čitaju sa diska u vreme builda; nova objava je commit, pa strana
 * ne mora da se osvežava češće od deploy-a.
 */

export const revalidate = 2592000;

const NASLOV = `Blog — priče iz APR podataka | ${BREND}`;
const OPIS =
  "Analize i priče o srpskim firmama, pisane isključivo iz zvaničnih podataka Agencije za privredne registre. Svaki tekst vodi ka stranicama firmi, gde brojke možeš sam da proveriš.";

export const metadata: Metadata = {
  title: NASLOV,
  description: OPIS,
  alternates: { canonical: apsolutniUrl("/blog") },
  openGraph: { title: NASLOV, description: OPIS, url: apsolutniUrl("/blog"), type: "website" },
};

/** Koliko članaka po strani; izdvojeni se ne računa. */
const PO_STRANI = 9;

function jeKategorija(v: string | undefined): v is Kategorija {
  return typeof v === "string" && (KATEGORIJE as readonly string[]).includes(v);
}

export default async function Blog({
  searchParams,
}: {
  searchParams: Promise<{ kategorija?: string; strana?: string }>;
}) {
  const { kategorija: trazena, strana: trazenaStrana } = await searchParams;
  const kategorija = jeKategorija(trazena) ? trazena : null;

  const svi = sviClanci();
  const filtrirani = kategorija ? svi.filter((c) => c.kategorija === kategorija) : svi;

  // Izdvojeni je najnoviji članak, i to samo na prvoj strani bez filtera —
  // inače bi se isti tekst pojavio dvaput na istoj strani.
  const bezFiltera = !kategorija;
  const strana = Math.max(1, Number(trazenaStrana) || 1);
  const izdvojeni = bezFiltera && strana === 1 ? (filtrirani[0] ?? null) : null;
  const zaMrezu = izdvojeni ? filtrirani.slice(1) : filtrirani;

  const ukupnoStrana = Math.max(1, Math.ceil(zaMrezu.length / PO_STRANI));
  const naStrani = zaMrezu.slice((strana - 1) * PO_STRANI, strana * PO_STRANI);

  const veza = (izmene: { kategorija?: Kategorija | null; strana?: number }) => {
    const p = new URLSearchParams();
    const k = izmene.kategorija === undefined ? kategorija : izmene.kategorija;
    const s = izmene.strana ?? 1;
    if (k) p.set("kategorija", k);
    if (s > 1) p.set("strana", String(s));
    const q = p.toString();
    return q ? `/blog?${q}` : "/blog";
  };

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs mrvice={[{ tekst: "Početna", href: "/" }, { tekst: "Blog" }]} />

      <section className="max-w-[720px] pb-2 pt-8">
        <h1 className="text-[clamp(28px,4.4vw,40px)] font-extrabold leading-[1.15] tracking-[-0.03em]">
          Priče koje pričaju <span className="text-primary">brojke</span> iz APR-a
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{OPIS}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={veza({ kategorija: null })}
            className={`rounded-full border px-3 py-1.5 text-[13.5px] no-underline ${
              kategorija === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-border-strong"
            }`}
          >
            Sve
          </Link>
          {KATEGORIJE.map((k) => (
            <Link
              key={k}
              href={veza({ kategorija: k })}
              className={`rounded-full border px-3 py-1.5 text-[13.5px] no-underline ${
                kategorija === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-border-strong"
              }`}
            >
              {NAZIV_KATEGORIJE[k]}
            </Link>
          ))}
        </div>
      </section>

      {izdvojeni ? (
        <section className="py-6">
          <article className="grid gap-5 rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)] md:grid-cols-[1fr_240px]">
            <div>
              <div className="text-[12.5px] text-muted-foreground">
                <span className="font-semibold text-primary">
                  {NAZIV_KATEGORIJE[izdvojeni.kategorija]}
                </span>{" "}
                · {formatDatum(izdvojeni.datum)} · {izdvojeni.minutaCitanja} min čitanja
              </div>
              <h2 className="mt-3 text-[clamp(20px,2.6vw,26px)] font-bold leading-snug tracking-[-0.02em]">
                <Link href={`/blog/${izdvojeni.slug}`} className="no-underline hover:text-primary">
                  {izdvojeni.naslov}
                </Link>
              </h2>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
                {izdvojeni.excerpt}
              </p>
              <Link
                href={`/blog/${izdvojeni.slug}`}
                className="mt-4 inline-block text-[14px] font-semibold text-primary no-underline"
              >
                Pročitaj članak →
              </Link>
            </div>
            <div
              className="hidden items-center justify-center rounded-[10px] bg-muted text-[34px] font-extrabold tracking-tight text-muted-foreground md:flex"
              aria-hidden
            >
              {izdvojeni.glif}
            </div>
          </article>
        </section>
      ) : null}

      <section className="py-4">
        {naStrani.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {naStrani.map((c) => (
              <KarticaClanka key={c.slug} clanak={c} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-muted-foreground">
            U ovoj kategoriji još nema članaka. <Link href="/blog">Pogledaj sve</Link>.
          </p>
        )}

        {ukupnoStrana > 1 ? (
          <nav aria-label="Stranice" className="mt-8 flex flex-wrap items-center gap-2">
            {Array.from({ length: ukupnoStrana }, (_, i) => i + 1).map((b) =>
              b === strana ? (
                <span
                  key={b}
                  aria-current="page"
                  className="rounded-[var(--radius-ui)] border border-primary bg-primary px-3 py-1.5 text-[14px] text-primary-foreground"
                >
                  {b}
                </span>
              ) : (
                <Link
                  key={b}
                  href={veza({ strana: b })}
                  className="rounded-[var(--radius-ui)] border border-border px-3 py-1.5 text-[14px] no-underline hover:border-border-strong"
                >
                  {b}
                </Link>
              ),
            )}
          </nav>
        ) : null}
      </section>

      {/* Prijava je statična u v1; slanje se uvodi kad postoji lista. */}
      <section className="py-8">
        <div className="rounded-[var(--radius-card)] border border-border bg-muted/40 p-6">
          <h2 className="text-[19px] font-bold">Jednom mesečno — najbolje priče iz podataka</h2>
          <p className="mt-2 max-w-[520px] text-[14.5px] leading-relaxed text-muted-foreground">
            Novi APR presek, najzanimljivije analize i firme koje vredi pratiti. Prijava stiže uz
            sledeći presek.
          </p>
        </div>
      </section>

      <JsonLd
        podaci={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: `Blog — ${BREND}`,
          description: OPIS,
          url: apsolutniUrl("/blog"),
          blogPost: svi.slice(0, 10).map((c) => ({
            "@type": "BlogPosting",
            headline: c.naslov,
            datePublished: c.datum,
            url: apsolutniUrl(`/blog/${c.slug}`),
          })),
        }}
      />
    </main>
  );
}
