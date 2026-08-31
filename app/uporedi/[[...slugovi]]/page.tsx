import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Novac } from "@/components/ui/novac";
import { IzborFirme } from "@/components/uporedi/izbor-firme";
import { MerenjePrikaza } from "@/components/uporedi/merenje-prikaza";
import { TabelaPoredjenja } from "@/components/uporedi/tabela-poredjenja";
import { formatBroj, formatDatum } from "@/lib/format";
import { imeOpstine, kratkoIme } from "@/lib/prikaz";
import type { KarticaFirme } from "@/lib/queries";
import { apsolutniUrl } from "@/lib/site";
import {
  kanonskiRedosled,
  MAX_FIRMI,
  MIN_FIRMI,
  naslovPoredjenja,
  redoviPoredjenja,
  smeUIndeks,
  zakljucciPoredjenja,
} from "@/lib/uporedi";
import { ucitajJednuStranu, ucitajPoredjenje } from "@/lib/uporedi-podaci";

/** 30 dana, koliko traje i presek podataka (CLAUDE.md) — isto kao stranica firme. */
export const revalidate = 2592000;

type Props = { params: Promise<{ slugovi?: string[] }> };

/**
 * Poređenje dve do četiri firme.
 *
 * Ruta je opciona catch-all, pa jedna datoteka pokriva tri stanja:
 *   /uporedi              → biranje prve firme
 *   /uporedi/[a]          → prva izabrana, bira se druga
 *   /uporedi/[a]/[b]/…    → poređenje, do `MAX_FIRMI` firmi
 *
 * INDEKSIRANJE: kombinacija ima previše (133.634² samo za parove), pa je
 * `noindex` podrazumevano stanje. U indeks ide samo uzak skup parova koji
 * prolazi `smeUIndeks`; trojke i četvorke nikad — to je alat, ne stranica za
 * pretragu. Te stranice zasad NISU u sitemapu, dodaju se tek kad se odluči
 * koliko ih se pušta odjednom, da se ne potroši crawl budžet na račun stranica
 * firmi (SEO.md §6).
 */

const poredjenje = cache(ucitajPoredjenje);
const jedna = cache(ucitajJednuStranu);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slugovi = [] } = await params;

  if (slugovi.length >= MIN_FIRMI && slugovi.length <= MAX_FIRMI) {
    const podaci = await poredjenje(slugovi);
    if (!podaci) return { title: "Poređenje firmi | Biznis priče" };

    const { strane, datumPreseka } = podaci;
    const imena = strane.map((s) => s.strana.ime);
    const naslov = naslovPoredjenja(imena);
    const kanonski = kanonskiRedosled(strane.map((s) => s.strana.firma.slug));
    const url = apsolutniUrl(`/uporedi/${kanonski.join("/")}`);

    const title =
      strane.length === 2
        ? `${naslov} - poređenje firmi | Biznis priče`
        : `Poređenje firmi: ${naslov} | Biznis priče`;
    const description = `Poređenje firmi ${naslov}: prihod, neto rezultat, kapital, broj zaposlenih, neto marža i blokade računa. Podaci iz APR, presek ${formatDatum(datumPreseka)}`;

    return {
      title,
      description,
      // Kanonski je uvek abecedni redosled, da permutacije ne budu zasebni URL-ovi.
      alternates: { canonical: url },
      robots: smeUIndeks(strane.map((s) => s.strana)) ? undefined : { index: false, follow: true },
      openGraph: { title, description, url, type: "website" },
    };
  }

  if (slugovi.length === 1) {
    const podaci = await jedna(slugovi[0]);
    const ime = podaci?.a.strana.ime;
    return {
      title: ime ? `Uporedi ${ime} sa drugom firmom | Biznis priče` : "Poređenje firmi | Biznis priče",
      // Pola poređenja nije sadržaj — to je korak u biranju.
      robots: { index: false, follow: true },
    };
  }

  const title = "Poređenje firmi - uporedite do četiri firme po finansijama | Biznis priče";
  const description =
    "Uporedite do četiri srpske firme po prihodu, neto rezultatu, kapitalu, broju zaposlenih i blokadama računa. Besplatno, bez registracije, podaci iz APR.";

  return {
    title,
    description,
    alternates: { canonical: apsolutniUrl("/uporedi") },
    openGraph: { title, description, url: apsolutniUrl("/uporedi"), type: "website" },
  };
}

export default async function StranicaPoredjenja({ params }: Props) {
  const { slugovi = [] } = await params;
  if (slugovi.length > MAX_FIRMI) notFound();

  // Ista firma dvaput nije poređenje; višak se izbacuje pre učitavanja.
  const jedinstveni = [...new Set(slugovi)];
  if (jedinstveni.length !== slugovi.length) permanentRedirect(`/uporedi/${jedinstveni.join("/")}`);

  if (slugovi.length >= MIN_FIRMI) return <Poredjenje slugovi={slugovi} />;
  if (slugovi.length === 1) return <PolaPoredjenja slug={slugovi[0]} />;
  return <Pocetak />;
}

// =============================================================================
// /uporedi/[a]/[b]/…
// =============================================================================

async function Poredjenje({ slugovi }: { slugovi: string[] }) {
  const podaci = await poredjenje(slugovi);
  if (!podaci) notFound();

  const { strane, datumPreseka } = podaci;
  const kanonskiSlugovi = strane.map((s) => s.strana.firma.slug);

  // Neispravan slug uz ispravan matični broj → trajni redirect, kao na stranici
  // firme (SEO.md §1.2). Bez ovoga bi svaki stari slug pravio duplikat.
  if (kanonskiSlugovi.some((slug, i) => slug !== slugovi[i])) {
    permanentRedirect(`/uporedi/${kanonskiSlugovi.join("/")}`);
  }

  const bezKonteksta = strane.map((s) => s.strana);
  const redovi = redoviPoredjenja(bezKonteksta, datumPreseka);
  const zakljucci = zakljucciPoredjenja(bezKonteksta);
  const imena = strane.map((s) => s.strana.ime);
  const naslov = naslovPoredjenja(imena);
  const imaMesta = strane.length < MAX_FIRMI;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <MerenjePrikaza brojFirmi={strane.length} kljuc={kanonskiSlugovi.join("/")} />

      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          { tekst: "Poređenje firmi", href: "/uporedi" },
          // „A i B“ za par, „A, B i C“ za više — ne „A i B i C“.
          { tekst: imena.length === 2 ? imena.join(" i ") : naslovPoredjenja(imena) },
        ]}
      />

      <section className="pt-7">
        <h1 className="text-[clamp(24px,3.6vw,34px)] font-extrabold tracking-[-0.025em]">
          {naslov}
        </h1>

        <p className="mt-3 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(datumPreseka)} · Izvor: Agencija za privredne registre
        </p>

        {zakljucci.length ? (
          <Card className="mt-4 border-accent-ring bg-accent-soft">
            <ul className="list-none space-y-1.5 text-[14.5px] leading-[1.5]">
              {zakljucci.map((recenica) => (
                <li key={recenica} className="flex gap-2">
                  <span className="text-accent-strong" aria-hidden>
                    ·
                  </span>
                  {recenica}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">Poređenje pokazatelja</h2>
        <TabelaPoredjenja strane={strane} redovi={redovi} />
        <p className="mt-3 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-foreground">
          Oznaka ✓ stoji uz povoljniju vrednost po tom pokazatelju i nije ocena poslovanja.
          Poređenje se odnosi na poslednji predati izveštaj i nema karakter bonitetne ocene.
          Stranice firmi:{" "}
          {strane.map((strana, i) => (
            <span key={strana.strana.firma.maticni_broj}>
              {i > 0 ? ", " : ""}
              <Link href={`/firma/${strana.strana.firma.slug}`} className="text-accent-strong">
                {strana.strana.ime}
              </Link>
            </span>
          ))}
          .
        </p>
      </section>

      <section className="mt-8 pb-4">
        {imaMesta ? (
          <>
            <h2 className="mb-3 text-[17px] font-bold tracking-[-0.01em]">
              Dodaj još jednu firmu u poređenje
            </h2>
            <div className="max-w-[640px]">
              <IzborFirme osnova={kanonskiSlugovi} />
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Poređenje prima najviše {MAX_FIRMI} firme. Izbacite jednu znakom × u zaglavlju kolone
            da biste dodali drugu.
          </p>
        )}
      </section>
    </main>
  );
}

// =============================================================================
// /uporedi/[a]
// =============================================================================

async function PolaPoredjenja({ slug }: { slug: string }) {
  const podaci = await jedna(slug);
  if (!podaci) notFound();

  const { a, predlozi } = podaci;
  if (a.strana.firma.slug !== slug) permanentRedirect(`/uporedi/${a.strana.firma.slug}`);

  const ime = a.strana.ime;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          { tekst: "Poređenje firmi", href: "/uporedi" },
          { tekst: ime },
        ]}
      />

      <section className="pt-7">
        <h1 className="text-[clamp(24px,3.6vw,34px)] font-extrabold tracking-[-0.025em]">
          Uporedi {ime} sa drugom firmom
        </h1>
        <p className="mt-2.5 max-w-[62ch] text-[15px] leading-[1.6] text-muted-foreground">
          Izaberite drugu firmu i dobićete uporedni pregled prihoda, neto rezultata, kapitala,
          broja zaposlenih, marže i blokada računa. Kasnije možete dodati još firmi, do ukupno{" "}
          {MAX_FIRMI}. Bez naloga i bez registracije.
        </p>

        <div className="mt-5 max-w-[640px]">
          <IzborFirme osnova={[a.strana.firma.slug]} autoFokus />
        </div>
      </section>

      {predlozi.length ? (
        <section className="mt-8 pb-4">
          <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">
            Firme sličnog obima, jednim klikom
          </h2>
          <ul className="grid list-none gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {predlozi.map((firma) => (
              <li key={firma.maticni_broj}>
                <PredlogKartica osnova={a.strana.firma.slug} firma={firma} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function PredlogKartica({ osnova, firma }: { osnova: string; firma: KarticaFirme }) {
  const ime = kratkoIme({
    poslovno_ime: firma.ime,
    poslovno_ime_kratko: firma.imeKratko,
    opstina: firma.opstina,
  });

  return (
    <Link
      href={`/uporedi/${osnova}/${firma.slug}`}
      className="block h-full rounded-card border border-border bg-card px-4 py-3.5 no-underline shadow-card transition duration-150 hover:-translate-y-px hover:border-accent-ring hover:shadow-pop"
    >
      <span className="block text-[14.5px] leading-[1.35] font-bold text-foreground">{ime}</span>
      <span className="mt-1 block text-[12.5px] text-muted-foreground">
        {[
          imeOpstine(firma.opstina),
          firma.zaposleni ? `${formatBroj(firma.zaposleni)} zaposlenih` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <span className="mt-1.5 block text-[13px] font-semibold text-accent-strong">
        <Novac hiljade={firma.ukupni_prihodi} kompaktno /> prihoda →
      </span>
    </Link>
  );
}

// =============================================================================
// /uporedi
// =============================================================================

function Pocetak() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs mrvice={[{ tekst: "Početna", href: "/" }, { tekst: "Poređenje firmi" }]} />

      <section className="pt-7 pb-4">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          Poređenje firmi
        </h1>
        <p className="mt-2.5 max-w-[62ch] text-[15px] leading-[1.6] text-muted-foreground">
          Izaberite do {MAX_FIRMI} firme i uporedite ih po prihodu, neto rezultatu, kapitalu,
          poslovnoj imovini, broju zaposlenih, prihodu po zaposlenom, neto marži i blokadama
          računa. Podaci dolaze iz Agencije za privredne registre i Narodne banke Srbije.
          Besplatno, bez naloga.
        </p>

        <div className="mt-5 max-w-[640px]">
          <IzborFirme autoFokus />
        </div>

        <p className="mt-6 max-w-[62ch] text-[13px] leading-[1.6] text-muted-foreground">
          Poređenje prikazuje poslednji predati finansijski izveštaj svake firme. Nema karakter
          bonitetne ocene niti poslovnog saveta.
        </p>
      </section>
    </main>
  );
}
