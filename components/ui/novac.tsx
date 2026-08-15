import { formatNovac, jePrazno, NEMA_PODATAKA, type Broj } from "@/lib/format";

/**
 * Novčani iznos, serverski renderovan u dinarima.
 *
 * Zašto ovako: server UVEK šalje RSD (odluka 15.08.2026) — JSON-LD, canonical i
 * indeksirani tekst ostaju u dinarima, i nema `?valuta=` URL-ova ni duplikata.
 * Prebacivanje u evre je čisto klijentsko: `CurrencyToggle` prolazi kroz sve
 * `[data-novac]` čvorove i menja im tekst iz `data-dinara`.
 *
 * Zato ovde stoji tačan iznos u dinarima kao atribut — klijent ne parsira
 * formatirani tekst, nego računa iz izvorne vrednosti.
 */
export function Novac({
  hiljade,
  dinara,
  kompaktno = false,
  nulaJePodatak = false,
  praznoKao = NEMA_PODATAKA,
  className,
}: {
  /** Vrednost kako je u bazi, u hiljadama dinara (APR format). */
  hiljade?: Broj;
  /** Vrednost već u dinarima, za slučajeve gde je množenje već obavljeno. */
  dinara?: Broj;
  kompaktno?: boolean;
  nulaJePodatak?: boolean;
  praznoKao?: string;
  className?: string;
}) {
  const uDinarima =
    dinara !== undefined ? dinara : hiljade === null || hiljade === undefined ? hiljade : hiljade * 1000;

  if (jePrazno(uDinarima, nulaJePodatak)) {
    return <span className={className}>{praznoKao}</span>;
  }

  return (
    <span
      className={className}
      data-novac=""
      data-dinara={String(uDinarima)}
      data-kompaktno={kompaktno ? "1" : undefined}
    >
      {formatNovac(uDinarima, "RSD", { kompaktno, nulaJePodatak })}
    </span>
  );
}
