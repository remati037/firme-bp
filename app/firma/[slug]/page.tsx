import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { CompanyBadge } from "@/components/company/company-badge";
import { CompanyCard } from "@/components/company/company-card";
import { CopyButton } from "@/components/company/copy-button";
import { Delta } from "@/components/company/delta";
import { FaqList } from "@/components/company/faq-list";
import { FinancialTable } from "@/components/company/financial-table";
import { MetricBar, MetricRow } from "@/components/company/metric-bar";
import { RankChip } from "@/components/company/rank-chip";
import { RacuniLista } from "@/components/company/racuni-lista";
import { SaveButton } from "@/components/company/save-button";
import { ShareButton } from "@/components/company/share-button";
import { SignalList } from "@/components/company/signal-list";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { bezPraznih, JsonLd } from "@/components/seo/json-ld";
import { Card } from "@/components/ui/card";
import { Novac } from "@/components/ui/novac";
import { cirilicniOblikIliNista, naslovnoCirilica } from "@/lib/cirilica";
import { ucitajFirmu, type PodaciFirme } from "@/lib/firma-podaci";
import {
  formatBroj,
  formatDatum,
  formatProcenat,
  formatRSD,
  formatStarost,
  NEMA_PODATAKA,
  pluralSrpski,
} from "@/lib/format";
import { faqZaFirmu } from "@/lib/faq";
import { narativ } from "@/lib/narrative";
import { izracunajPokazatelje, pozicijaNaTraci, pozicijaZaPoene } from "@/lib/pokazatelji";
import { imeOpstine, kratkoIme, nazivDelatnosti, slugOpstine } from "@/lib/prikaz";
import { izracunajSignale, porukaBezSignala } from "@/lib/signali";
import { apsolutniUrl } from "@/lib/site";

/** 30 dana, koliko traje i presek podataka (CLAUDE.md). */
export const revalidate = 2592000;

type Props = { params: Promise<{ slug: string }> };

/**
 * `cache()` spaja `generateMetadata` i render u jedno učitavanje podataka —
 * bez toga bi svaka stranica firme dvaput pitala bazu za isto.
 */
const ucitaj = cache(async (slug: string): Promise<PodaciFirme> => {
  const podaci = await ucitajFirmu(slug);

  // Nepostojeći ili neispravan matični broj → 404, nikad 200 (SEO.md §1.3).
  if (!podaci) notFound();

  // Validan matični broj, ali slug nije kanonski → trajni redirect.
  // Next šalje 308; Google 308 i 301 tretira isto (oba su trajna).
  if (podaci.firma.slug !== slug) permanentRedirect(`/firma/${podaci.firma.slug}`);

  return podaci;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const podaci = await ucitaj(slug);
  const { firma, poslednjaFinansija: fi } = podaci;

  const ime = kratkoIme(firma);
  const opstina = imeOpstine(firma.opstina);
  const godina = fi?.godina;
  const prihodi = fi?.ukupni_prihodi ?? 0;
  const identifikatori = firma.pib
    ? `PIB ${firma.pib}, matični broj ${firma.maticni_broj}.`
    : `Matični broj ${firma.maticni_broj}.`;

  // Šabloni iz SEO.md §3. Brend "| Biznis priče" NE ide u title stranice firme.
  const title =
    prihodi > 0 && godina
      ? `${ime} - PIB, matični broj, prihod ${godina}`
      : `${ime} - PIB, matični broj, podaci iz APR`;

  const description =
    prihodi > 0 && godina
      ? `${ime}, ${opstina}. ${identifikatori} Prihod ${formatRSD(prihodi)} u ${godina}, ${formatBroj(
          fi?.prosecan_broj_zaposlenih,
          { praznoKao: "nepoznato" },
        )} zaposlenih. Osnovana ${formatDatum(firma.datum_osnivanja)} Besplatni podaci iz APR.`
      : `${ime}, ${opstina}. ${identifikatori} Osnovana ${formatDatum(firma.datum_osnivanja)} ${
          firma.pravna_forma ?? ""
        }. Finansijski izveštaj${godina ? ` za ${godina}.` : ""} nije predat. Besplatni podaci iz APR.`;

  const url = apsolutniUrl(`/firma/${firma.slug}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

/**
 * Bez prerendera po difoltu: stranice se prave na zahtev i keširaju ISR-om.
 * Produkcijski build podiže broj na top 45.000 po prihodu (SEO.md §6) preko
 * `PRERENDER_FIRMI`, kad se odluči cena build vremena.
 */
export async function generateStaticParams() {
  return [];
}

export default async function StranicaFirme({ params }: Props) {
  const { slug } = await params;
  const podaci = await ucitaj(slug);
  const {
    firma,
    finansije,
    poslednjaFinansija: fi,
    rang,
    statDelatnosti,
    nace,
    opstinaRed,
    aiSazetak,
    datumPreseka,
    promene,
    racuni,
    slicneDelatnost,
    slicneOpstina,
  } = podaci;

  const ime = kratkoIme(firma);
  const opstina = imeOpstine(firma.opstina);
  const opstinaSlug = slugOpstine(firma.opstina);
  const delatnost = nazivDelatnosti(firma.sifra_delatnosti, nace?.naziv);
  const p = izracunajPokazatelje(fi, statDelatnosti);
  const imaFinansije = (fi?.ukupni_prihodi ?? 0) > 0;

  const recenice = narativ({
    ime,
    pokazatelji: p,
    godina: fi?.godina ?? null,
    sifraDelatnosti: firma.sifra_delatnosti,
    nazivDelatnosti: nace?.naziv ?? null,
    medijanPrihodaPoZaposlenom: statDelatnosti?.medijan_prihoda_po_zaposlenom ?? null,
    medijanPrihoda: statDelatnosti?.medijan_prihoda ?? null,
    brojFirmiUDelatnosti: statDelatnosti?.broj_firmi ?? null,
    rangDelatnost: rang.delatnost,
    ukupnoDelatnost: rang.ukupnoDelatnost,
    rangOpstina: rang.opstina,
    ukupnoOpstina: rang.ukupnoOpstina,
    opstina,
  });

  const signali = izracunajSignale(firma, fi, datumPreseka, podaci.blokada, podaci.zabrane);
  const pitanja = faqZaFirmu({ firma, ime, fi, datumPreseka });
  const cirilica = cirilicniOblikIliNista(firma.poslovno_ime);
  const netoRezultat = p.netoRezultat ?? 0;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6">
      <Breadcrumbs
        mrvice={[
          { tekst: "Početna", href: "/" },
          ...(firma.sifra_delatnosti
            ? [
                {
                  tekst: nace?.naziv ?? `Delatnost ${firma.sifra_delatnosti}`,
                  href: `/delatnost/${firma.sifra_delatnosti}`,
                },
              ]
            : []),
          { tekst: ime },
        ]}
      />

      {/* ===== 1. ZAGLAVLJE ===== */}
      <section className="pt-7 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">{ime}</h1>
          <CompanyBadge status={firma.status} statusAktivan={firma.status_aktivan} />
          <RankChip
            rang={rang.delatnost}
            ukupno={rang.ukupnoDelatnost}
            gde="u delatnosti"
          />
          <SaveButton slug={firma.slug} ime={ime} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-4.5 text-[13.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            Matični broj
            <code className="rounded-md border border-border bg-muted px-2 py-px text-[13px] text-foreground tabular-nums">
              {firma.maticni_broj}
            </code>
            <CopyButton vrednost={firma.maticni_broj} naziv="matični broj" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            PIB
            {firma.pib ? (
              <>
                <code className="rounded-md border border-border bg-muted px-2 py-px text-[13px] text-foreground tabular-nums">
                  {firma.pib}
                </code>
                <CopyButton vrednost={firma.pib} naziv="PIB" />
              </>
            ) : (
              <span className="text-neutral italic">nije u NBS registru računa</span>
            )}
          </span>
          <ShareButton naslov={ime} url={apsolutniUrl(`/firma/${firma.slug}`)} />
        </div>

        {cirilica ? (
          <p className="mt-2.5 text-[13px] text-muted-foreground">
            <b className="font-medium text-foreground">Ćirilica:</b> {cirilica}
            {opstinaRed?.naziv_cir ? `, ${naslovnoCirilica(opstinaRed.naziv_cir)}` : ""}
          </p>
        ) : null}

        <div className="mt-3.5 flex flex-wrap gap-2">
          {firma.sifra_delatnosti ? (
            <TagLink href={`/delatnost/${firma.sifra_delatnosti}`}>Delatnost: {delatnost}</TagLink>
          ) : null}
          {opstinaSlug ? <TagLink href={`/grad/${opstinaSlug}`}>Opština: {opstina}</TagLink> : null}
          {firma.sifra_delatnosti && opstinaSlug ? (
            <TagLink href={`/delatnost/${firma.sifra_delatnosti}/${opstinaSlug}`}>
              {nace?.naziv ?? `Delatnost ${firma.sifra_delatnosti}`} u opštini {opstina} →
            </TagLink>
          ) : null}
        </div>

        {/* ===== 2. PRESEK PODATAKA, VIDLJIV NA VRHU (SEO.md §7) ===== */}
        <p className="mt-3.5 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] text-muted-foreground">
          Presek podataka: {formatDatum(datumPreseka)} · Izvor: Agencija za privredne registre
        </p>

        {promene ? (
          <p className="mt-2.5 ml-0 inline-block rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12px] text-muted-foreground sm:ml-2">
            Brojevi se porede sa presekom od {formatDatum(promene.prethodniPresek)} iz naše arhive
            mesečnih APR preuzimanja
          </p>
        ) : null}

        {/* D4: jedna rečenica koja odgovara na "da li je sve u redu sa firmom". */}
        <p
          className={`mt-3.5 flex w-fit items-center gap-2 rounded-ui border px-3.5 py-2 text-sm font-semibold ${
            signali.length
              ? "border-[#fde68a] bg-[#fffbeb] text-[#92400e] dark:border-[#3d3113] dark:bg-[#1e180c] dark:text-[#fcd34d]"
              : "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46] dark:border-[#123528] dark:bg-[#0c1f17] dark:text-[#6ee7b7]"
          }`}
        >
          <span aria-hidden>{signali.length ? "!" : "✓"}</span>
          {brzaOcena({ firma, fi, brojSignala: signali.length })}
        </p>
      </section>

      {/* ===== 3. KLJUČNI BROJEVI ===== */}
      <section className="mt-5 mb-2 grid gap-4 sm:grid-cols-3">
        <Card className="border-accent-ring bg-accent-soft">
          <KpiLabel>Prihod{fi?.godina ? ` · ${fi.godina}` : ""}</KpiLabel>
          <p className="mt-1 text-[clamp(22px,3.4vw,30px)] leading-[1.15] font-extrabold tracking-[-0.02em] text-accent-strong tabular-nums">
            <Novac hiljade={fi?.ukupni_prihodi} />
          </p>
          {promene ? <Delta promena={promene.prihodi} prethodniPresek={promene.prethodniPresek} /> : null}
          <KpiOpis>Ukupan prihod iz poslednjeg izveštaja</KpiOpis>
        </Card>
        <Card>
          <KpiLabel>Neto rezultat{fi?.godina ? ` · ${fi.godina}` : ""}</KpiLabel>
          <p
            className={`mt-1 text-[clamp(22px,3.4vw,30px)] leading-[1.15] font-extrabold tracking-[-0.02em] tabular-nums ${
              netoRezultat > 0 ? "text-success" : netoRezultat < 0 ? "text-danger" : ""
            }`}
          >
            {netoRezultat === 0 ? NEMA_PODATAKA : <Novac hiljade={Math.abs(netoRezultat)} />}
          </p>
          {promene ? (
            <Delta promena={promene.netoRezultat} prethodniPresek={promene.prethodniPresek} />
          ) : null}
          <KpiOpis>
            {netoRezultat > 0
              ? "Neto dobitak"
              : netoRezultat < 0
                ? "Neto gubitak"
                : "Izveštaj nije predat"}
          </KpiOpis>
        </Card>
        <Card>
          <KpiLabel>Zaposleni{fi?.godina ? ` · ${fi.godina}` : ""}</KpiLabel>
          <p className="mt-1 text-[clamp(22px,3.4vw,30px)] leading-[1.15] font-extrabold tracking-[-0.02em] tabular-nums">
            {formatBroj(fi?.prosecan_broj_zaposlenih)}
          </p>
          {promene ? (
            <Delta promena={promene.zaposleni} prethodniPresek={promene.prethodniPresek} />
          ) : null}
          <KpiOpis>Prosek u toku poslovne godine</KpiOpis>
        </Card>
      </section>

      {/* ===== 4. OSNOVNI PODACI ===== */}
      <section className="pt-6">
        <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">Osnovni podaci</h2>
        <div className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          <InfoCelija naziv="Puno poslovno ime" sirok>
            {firma.poslovno_ime}
          </InfoCelija>
          <InfoCelija naziv="Datum osnivanja">
            {formatDatum(firma.datum_osnivanja)}{" "}
            <span className="font-normal text-muted-foreground">
              ({formatStarost(firma.datum_osnivanja, datumPreseka)})
            </span>
          </InfoCelija>
          <InfoCelija naziv="Pravna forma">{firma.pravna_forma ?? NEMA_PODATAKA}</InfoCelija>
          <InfoCelija naziv="Opština">
            {opstinaSlug ? (
              <Link href={`/grad/${opstinaSlug}`} className="text-accent-strong">
                {opstina}
              </Link>
            ) : (
              NEMA_PODATAKA
            )}
          </InfoCelija>
          <InfoCelija naziv="Adresa">{firma.adresa ?? NEMA_PODATAKA}</InfoCelija>
          <InfoCelija naziv="Delatnost">
            {firma.sifra_delatnosti ? (
              <Link href={`/delatnost/${firma.sifra_delatnosti}`} className="text-accent-strong">
                {delatnost}
              </Link>
            ) : (
              NEMA_PODATAKA
            )}
          </InfoCelija>
          <InfoCelija naziv="Status">{firma.status ?? NEMA_PODATAKA}</InfoCelija>
        </div>

        <RacuniLista racuni={racuni} />
      </section>

      {/* ===== 5. FINANSIJE ===== */}
      <section className="pt-8">
        <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">Finansijski izveštaji</h2>
        {finansije.length > 0 && imaFinansije ? (
          <FinancialTable redovi={finansije} />
        ) : (
          // Tanak sadržaj: bez praznih tabela, sa kontekstom (SEO.md §1.4).
          <Card>
            <p className="text-[15px]">
              {ime} nije predala finansijski izveštaj
              {fi?.godina ? ` za ${fi.godina}. godinu` : ""}, pa za nju nema podataka o prihodu,
              rezultatu ni broju zaposlenih.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {statDelatnosti?.broj_firmi
                ? `Za poređenje: u delatnosti ${delatnost} registrovano je ${formatBroj(statDelatnosti.broj_firmi)} firmi, izveštaj je predalo ${formatBroj(
                    statDelatnosti.broj_sa_izvestajem,
                  )}, a medijan prihoda iznosi ${formatRSD(statDelatnosti.medijan_prihoda)}.`
                : "U APR otvorenim podacima za ovu firmu ne postoji finansijski izveštaj."}
            </p>
          </Card>
        )}
      </section>

      {/* ===== 6. ANALIZA ===== */}
      <section className="pt-8">
        <h2 className="text-[19px] font-bold tracking-[-0.01em]">Analiza</h2>
        <p className="mt-1.5 mb-3.5 text-[13px] text-muted-foreground">
          Sve vrednosti su izračunate iz APR izveštaja
          {firma.sifra_delatnosti ? `, uz poređenje sa medijanom delatnosti ${firma.sifra_delatnosti}` : ""}
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
              Šta brojevi kažu
            </h3>
            <p className="text-[14.5px] leading-[1.7]">{recenice.join(" ")}</p>

            {aiSazetak?.summary ? (
              <p className="mt-2.5 border-l-[3px] border-primary pl-3 text-[14.5px] leading-[1.7] text-muted-foreground">
                <b className="font-bold text-foreground">AI sažetak · </b>
                {aiSazetak.summary}
              </p>
            ) : null}
          </Card>

          <Card>
            <h3 className="mb-3 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
              Pokazatelji
            </h3>
            <div className="space-y-2.5">
              <MetricRow
                labela="Prihod / zaposlenom"
                vrednost={<Novac hiljade={p.prihodPoZaposlenom} />}
              />
              <MetricRow labela="Neto marža" vrednost={formatProcenat(p.netoMarza)} />
              <MetricRow
                labela="Kapital / imovina"
                vrednost={formatProcenat(p.kapitalPremaImovini)}
              />
              <MetricRow
                labela="Rang u delatnosti"
                vrednost={
                  rang.delatnost
                    ? `${formatBroj(rang.delatnost)} / ${formatBroj(rang.ukupnoDelatnost)}`
                    : NEMA_PODATAKA
                }
              />
              <MetricRow
                labela="Rang u opštini"
                vrednost={
                  rang.opstina
                    ? `${formatBroj(rang.opstina)} / ${formatBroj(rang.ukupnoOpstina)}`
                    : NEMA_PODATAKA
                }
              />
            </div>

            {p.odstupanjePrihodaPoZaposlenom !== null || p.odstupanjeMarze !== null ? (
              <>
                <h3 className="mt-5 mb-2.5 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
                  Poređenje sa medijanom delatnosti
                </h3>
                <div className="space-y-2.5">
                  <MetricBar
                    labela="Prihod / zaposlenom"
                    pozicija={pozicijaNaTraci(p.odstupanjePrihodaPoZaposlenom)}
                    opis={opisOdstupanja(p.odstupanjePrihodaPoZaposlenom, "odsto")}
                  />
                  <MetricBar
                    labela="Neto marža"
                    pozicija={pozicijaZaPoene(p.odstupanjeMarze)}
                    opis={opisOdstupanja(p.odstupanjeMarze, "p.p.")}
                  />
                </div>
              </>
            ) : null}
          </Card>
        </div>
      </section>

      {/* ===== 7. SIGNALI ===== */}
      <section className="pt-8">
        <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">Signali</h2>
        <SignalList signali={signali.length ? signali : [porukaBezSignala(fi)]} />
      </section>

      {/* ===== 8. SLIČNE FIRME ===== */}
      {slicneDelatnost.length || slicneOpstina.length ? (
        <section className="pt-8">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Slične firme</h2>
          <p className="mt-1 mb-3.5 text-[13px] text-muted-foreground">
            Po tri firme iz iste delatnosti i iste opštine, sa najbližim prihodom
          </p>

          {slicneDelatnost.length ? (
            <>
              <h3 className="mb-2.5 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
                Iz delatnosti {firma.sifra_delatnosti}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {slicneDelatnost.map((f) => (
                  <CompanyCard key={f.maticni_broj} firma={f} />
                ))}
              </div>
            </>
          ) : null}

          {slicneOpstina.length ? (
            <>
              <h3 className="mt-6 mb-2.5 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
                Iz opštine {opstina}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {slicneOpstina.map((f) => (
                  <CompanyCard key={f.maticni_broj} firma={f} />
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {/* ===== 9. ČESTA PITANJA ===== */}
      <section className="pt-8">
        <h2 className="mb-3.5 text-[19px] font-bold tracking-[-0.01em]">Česta pitanja</h2>
        <FaqList pitanja={pitanja} />
      </section>

      <JsonLd
        podaci={bezPraznih({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: ime,
          legalName: firma.poslovno_ime,
          alternateName: cirilica ?? undefined,
          identifier: firma.maticni_broj,
          taxID: firma.pib ?? undefined,
          foundingDate: firma.datum_osnivanja ?? undefined,
          url: apsolutniUrl(`/firma/${firma.slug}`),
          naics: firma.sifra_delatnosti ?? undefined,
          address:
            opstina || firma.adresa
              ? {
                  "@type": "PostalAddress",
                  addressLocality: opstina ?? undefined,
                  streetAddress: firma.adresa ?? undefined,
                  addressCountry: "RS",
                }
              : undefined,
          numberOfEmployees: fi?.prosecan_broj_zaposlenih
            ? { "@type": "QuantitativeValue", value: fi.prosecan_broj_zaposlenih }
            : undefined,
        })}
      />

      <JsonLd
        podaci={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: pitanja.map((p) => ({
            "@type": "Question",
            name: p.pitanje,
            acceptedAnswer: { "@type": "Answer", text: p.odgovor },
          })),
        }}
      />
    </main>
  );
}

/** D4: „Aktivna firma · predala izveštaj za 2025. · bez upozoravajućih signala". */
function brzaOcena({
  firma,
  fi,
  brojSignala,
}: {
  firma: { status: string | null; status_aktivan: boolean | null };
  fi: { godina: number; ukupni_prihodi: number | null } | null | undefined;
  brojSignala: number;
}): string {
  const delovi: string[] = [];

  delovi.push(firma.status_aktivan ? "Aktivna firma" : (firma.status ?? "Status nepoznat"));

  delovi.push(
    fi && (fi.ukupni_prihodi ?? 0) > 0
      ? `predala izveštaj za ${fi.godina}.`
      : "nema predat finansijski izveštaj",
  );

  delovi.push(
    brojSignala === 0
      ? "bez upozoravajućih signala"
      : `${formatBroj(brojSignala)} ${pluralSrpski(brojSignala, "upozoravajući signal", "upozoravajuća signala", "upozoravajućih signala")}`,
  );

  return delovi.join(" · ");
}

function opisOdstupanja(vrednost: number | null, jedinica: "odsto" | "p.p."): string {
  if (vrednost === null) return NEMA_PODATAKA;
  const razlika = Math.round(Math.abs(vrednost));
  if (razlika === 0) return "na nivou medijane";
  const smer = vrednost >= 0 ? "iznad" : "ispod";
  return `${vrednost >= 0 ? "+" : "−"}${formatBroj(razlika)} ${jedinica} ${smer} medijane`;
}

function TagLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:border-accent-ring hover:bg-accent-soft hover:text-primary"
    >
      {children}
    </Link>
  );
}

function KpiLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12.5px] font-semibold tracking-[0.02em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function KpiOpis({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[12.5px] text-muted-foreground">{children}</p>;
}

function InfoCelija({
  naziv,
  children,
  sirok = false,
}: {
  naziv: string;
  children: React.ReactNode;
  sirok?: boolean;
}) {
  return (
    <div className={`bg-card px-4 py-3.5 ${sirok ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <p className="text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {naziv}
      </p>
      <p className="mt-0.5 text-[14.5px] font-semibold">{children}</p>
    </div>
  );
}
