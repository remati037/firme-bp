import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Card } from "@/components/ui/card";
import { formatBroj } from "@/lib/format";
import { ucitajDatumPreseka } from "@/lib/presek";
import { apsolutniUrl, BREND, DISCLAIMER } from "@/lib/site";

export const revalidate = 2592000;

const NASLOV = `O podacima: odakle dolaze i kako se koriste | ${BREND}`;
const OPIS =
  "Podaci dolaze iz otvorenih podataka Agencije za privredne registre. Šta set sadrži, šta ne sadrži, kako se računaju pokazatelji i kako prijaviti grešku.";

export const metadata: Metadata = {
  title: NASLOV,
  description: OPIS,
  alternates: { canonical: apsolutniUrl("/o-podacima") },
  openGraph: { title: NASLOV, description: OPIS, url: apsolutniUrl("/o-podacima"), type: "website" },
};

/** Brojevi su izmereni nad presekom, ne procenjeni. */
const IZMERENO = {
  firmi: 133_634,
  saIzvestajem: 116_847,
  saPrihodom: 94_228,
  bezUpotrebljivih: 39_406,
  delatnosti: 571,
  opstina: 192,
} as const;

const APR_ENDPOINTI = [
  "https://openapi.apr.gov.rs/api/opendata/companies",
  "https://openapi.apr.gov.rs/api/opendata/companies/financial-statements",
];

export default async function OPodacima() {
  const datumPreseka = await ucitajDatumPreseka();

  // Dataset schema, SEO.md §4.4. Daje prisustvo u Google Dataset Search i jak
  // signal o poreklu podataka, i za Google i za jezičke modele.
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Privredna društva u Srbiji, APR otvoreni podaci",
    description:
      "Registrovana privredna društva u Republici Srbiji sa osnovnim podacima i godišnjim finansijskim izveštajima, iz otvorenih podataka Agencije za privredne registre.",
    creator: {
      "@type": "Organization",
      name: "Agencija za privredne registre",
      url: "https://www.apr.gov.rs",
    },
    license: "https://data.gov.rs/sr/licenses/",
    isAccessibleForFree: true,
    temporalCoverage: datumPreseka,
    spatialCoverage: { "@type": "Country", name: "Srbija" },
    url: apsolutniUrl("/o-podacima"),
    distribution: APR_ENDPOINTI.map((url) => ({
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: url,
    })),
  };

  return (
    <main className="mx-auto w-full max-w-[860px] px-4 pb-16">
      <JsonLd podaci={dataset} />
      <Breadcrumbs mrvice={[{ tekst: "Početna", href: "/" }, { tekst: "O podacima" }]} />

      <header className="pt-7 pb-5">
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold tracking-[-0.025em]">
          O podacima
        </h1>
        <p className="mt-2 max-w-[720px] text-[15px] text-muted-foreground">
          Presek podataka: {datumPreseka}. Svi podaci na sajtu dolaze iz jednog izvora,
          otvorenih podataka Agencije za privredne registre.
        </p>
      </header>

      <div className="space-y-5">
        <Card>
          <h2 className="text-lg font-bold">Odakle podaci</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Agencija za privredne registre objavljuje otvorene podatke o privrednim društvima i
            njihovim finansijskim izveštajima. Podaci su besplatni i objavljeni pod Srpskom
            licencom za otvorene podatke, koja dozvoljava i komercijalnu upotrebu.
          </p>
          <ul className="mt-3 space-y-1 text-[14px] text-muted-foreground">
            {APR_ENDPOINTI.map((url) => (
              <li key={url} className="break-all font-mono text-[13px]">
                {url}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Podatke ne menjamo. Preuzimamo ih jednom mesečno, normalizujemo pismo i format, i
            prikazujemo uz datum preseka.
          </p>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Šta set sadrži</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[15px] sm:grid-cols-3">
            {[
              ["Privrednih društava", IZMERENO.firmi],
              ["Sa finansijskim izveštajem", IZMERENO.saIzvestajem],
              ["Sa prihodom većim od nule", IZMERENO.saPrihodom],
              ["Delatnosti", IZMERENO.delatnosti],
              ["Opština", IZMERENO.opstina],
            ].map(([tekst, broj]) => (
              <div key={String(tekst)}>
                <dt className="text-[13px] text-muted-foreground">{tekst}</dt>
                <dd className="font-bold tabular-nums">{formatBroj(Number(broj))}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Šta set ne sadrži</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Ovo je najvažniji deo stranice. Otvoreni set ima jasne granice i ne treba očekivati
            ono čega u njemu nema.
          </p>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Nema PIB-a.</strong> PIB nije deo APR otvorenog
              seta. Firmu jednoznačno određuje matični broj, koji stoji na svakoj stranici.
            </li>
            <li>
              <strong className="text-foreground">Nema preduzetnika.</strong> Set obuhvata samo
              privredna društva, ne i radnje i preduzetnike.
            </li>
            <li>
              <strong className="text-foreground">Nema vlasnika i zastupnika.</strong> Imena
              fizičkih lica se ne prikazuju.
            </li>
            <li>
              <strong className="text-foreground">Nema blokada računa</strong> ni podataka o
              likvidnosti.
            </li>
            <li>
              <strong className="text-foreground">
                {formatBroj(IZMERENO.bezUpotrebljivih)} firmi nema upotrebljive finansije.
              </strong>{" "}
              Ili nisu predale izveštaj, ili su ga predale sa nulom prihoda. Kod njih stoji
              „Nema podataka”, a ne nula dinara, jer to nije isto.
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Kako se računaju pokazatelji</h2>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Novčane vrednosti.</strong> APR ih objavljuje u
              hiljadama dinara. Na sajtu su prikazane u dinarima.
            </li>
            <li>
              <strong className="text-foreground">Medijana, ne prosek.</strong> Poređenja sa
              delatnošću i opštinom idu preko medijane, jer nekoliko velikih firmi pomera prosek
              toliko da prestaje da bude upotrebljiv.
            </li>
            <li>
              <strong className="text-foreground">Rang.</strong> Mesto po ukupnom prihodu unutar
              delatnosti i unutar opštine. Firme bez izveštaja nemaju rang i stoje na kraju liste.
            </li>
            <li>
              <strong className="text-foreground">Sve se računa iz brojeva.</strong> Pokazatelji i
              signali su izvedeni iz prikazanih vrednosti, bez procene i bez ocene poslovanja.
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Kako prijaviti grešku</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Razlikuju se dve vrste grešaka, i ne rešavaju se na istom mestu.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Netačan podatak o firmi</strong> (ime, status,
            delatnost, iznosi. Te podatke ne unosimo i ne možemo da ih menjamo; oni dolaze iz
            registra. Ispravka ide kroz Agenciju za privredne registre, a ovde se vidi pri
            sledećem mesečnom preseku.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Greška u prikazu</strong> (pogrešno skraćeno ime,
            pokvarena stranica, pogrešan izračun. To je naša greška i nju popravljamo. Javite se
            preko{" "}
            <Link
              href="https://biznisprice.com"
              className="font-medium text-accent underline underline-offset-2"
            >
              biznisprice.com
            </Link>
            , uz matični broj firme.
          </p>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Ograničenje odgovornosti</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
        </Card>
      </div>
    </main>
  );
}
