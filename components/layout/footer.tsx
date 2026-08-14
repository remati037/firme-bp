import Link from "next/link";

import { formatDatum } from "@/lib/format";
import { ucitajDatumPreseka } from "@/lib/presek";
import { DISCLAIMER } from "@/lib/site";

/**
 * Futer sa obaveznim izvorom podataka.
 *
 * Tekst "Izvor podataka: Agencija za privredne registre. Presek podataka: {DatumPreseka}."
 * je obavezan na SVAKOJ stranici (CLAUDE.md), zajedno sa disclaimerom da podaci
 * nisu bonitetna ocena.
 */

const SEKCIJE = [
  {
    naslov: "Sajt",
    linkovi: [
      { href: "/", tekst: "Početna" },
      { href: "/najvece", tekst: "Najveće firme" },
      { href: "/blog", tekst: "Blog" },
      { href: "/o-podacima", tekst: "O podacima" },
    ],
  },
  {
    naslov: "Kategorije",
    linkovi: [
      { href: "/delatnost", tekst: "Delatnosti" },
      { href: "/grad", tekst: "Opštine" },
    ],
  },
];

export async function Footer() {
  const datumPreseka = await ucitajDatumPreseka();

  return (
    <footer className="mt-14 border-t border-border py-9 pb-12">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <div className="grid gap-8 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              className="flex items-center text-[19px] font-extrabold tracking-[-0.02em] text-foreground no-underline"
            >
              <span
                className="mr-2 inline-block h-[9px] w-[9px] -translate-y-px rounded-[3px] bg-primary"
                aria-hidden
              />
              Firme
            </Link>
            <p className="mt-2.5 max-w-[360px] text-[13.5px] text-muted-foreground">
              Besplatna provera srpskih firmi. Podaci iz Agencije za privredne registre,
              ažurirani mesečno. Deo brenda Biznis priče.
            </p>
          </div>

          {SEKCIJE.map((sekcija) => (
            <div key={sekcija.naslov}>
              <h2 className="mb-2.5 text-[13px] font-bold tracking-[0.03em] text-muted-foreground uppercase">
                {sekcija.naslov}
              </h2>
              <ul className="list-none">
                {sekcija.linkovi.map((link) => (
                  <li key={link.href + link.tekst} className="mb-[7px] text-sm">
                    <Link
                      href={link.href}
                      className="text-muted-foreground no-underline transition-colors hover:text-primary"
                    >
                      {link.tekst}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <SourceFooter datumPreseka={datumPreseka} />
      </div>
    </footer>
  );
}

/**
 * Obavezni blok o izvoru. Izdvojen je da bi mogao da stoji i samostalno,
 * npr. na stranici firme ispod sekcije "Signali".
 */
export function SourceFooter({ datumPreseka }: { datumPreseka: string }) {
  return (
    <div className="mt-7 border-t border-border pt-5 text-[12.5px] leading-[1.7] text-muted-foreground">
      {/* Rečenica ide kao jedan tekstualni čvor, da je crawler ne čita isečenu. */}
      <p>
        <b className="font-semibold text-foreground">Izvor podataka:</b>
        {` Agencija za privredne registre. Presek podataka: ${formatDatum(datumPreseka)}`}
      </p>
      <p>{DISCLAIMER}</p>
    </div>
  );
}
