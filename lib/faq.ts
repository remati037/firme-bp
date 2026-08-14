/**
 * Šest pitanja sa stranice firme (SEO.md §4.3).
 *
 * Isti izvor koristi i vidljivi `<details>` blok i FAQPage JSON-LD, da se
 * odgovor u markupu nikad ne razlikuje od onog na stranici (Google to traži).
 *
 * Odgovori su samostalne rečenice: moraju da imaju smisla izvučene iz
 * konteksta, jer je to format koji LLM najlakše citira.
 */

import { formatBroj, formatDatum, formatRSD } from "./format";
import type { Finansije, Firma } from "./queries";

export type Pitanje = { pitanje: string; odgovor: string };

export function faqZaFirmu({
  firma,
  ime,
  fi,
  datumPreseka,
}: {
  firma: Firma;
  ime: string;
  fi: Finansije | null | undefined;
  datumPreseka: string;
}): Pitanje[] {
  const godina = fi?.godina;
  const prihodi = fi?.ukupni_prihodi ?? 0;
  const zaposleni = fi?.prosecan_broj_zaposlenih ?? 0;

  return [
    {
      pitanje: `Koji je PIB firme ${ime}?`,
      odgovor: firma.pib
        ? `PIB firme ${ime} je ${firma.pib}.`
        : // APR open data set nema PIB; dolazi iz NBS registra (CLAUDE.md, faza 2).
          `PIB firme ${ime} nije dostupan u APR open data setu, pa se na ovoj stranici ne prikazuje. Firma se u registrima može pronaći po matičnom broju ${firma.maticni_broj}.`,
    },
    {
      pitanje: `Koji je matični broj firme ${ime}?`,
      odgovor: `Matični broj firme ${ime} je ${firma.maticni_broj}.`,
    },
    {
      pitanje: `Koliki je prihod firme ${ime}${godina ? ` u ${godina}` : ""}?`,
      odgovor:
        prihodi > 0 && godina
          ? `Ukupan prihod firme ${ime} u ${godina}. godini iznosio je ${formatRSD(prihodi)}.`
          : `Firma ${ime} nema prijavljen prihod u poslednjem finansijskom izveštaju iz APR podataka.`,
    },
    {
      pitanje: `Koliko zaposlenih ima ${ime}?`,
      odgovor:
        zaposleni > 0 && godina
          ? `Firma ${ime} je u ${godina}. godini prijavila prosečno ${formatBroj(zaposleni)} zaposlenih.`
          : `Za firmu ${ime} u poslednjem APR preseku nema podatka o broju zaposlenih.`,
    },
    {
      pitanje: `Da li je ${ime} aktivna firma?`,
      odgovor: firma.status_aktivan
        ? `Da, firma ${ime} je aktivna prema APR preseku podataka od ${formatDatum(datumPreseka)}`
        : `Ne, firma ${ime} nije u statusu „Aktivan"${firma.status ? `, već „${firma.status}"` : ""}, prema APR preseku podataka od ${formatDatum(datumPreseka)}`,
    },
    {
      pitanje: `Kada je osnovana ${ime}?`,
      odgovor: firma.datum_osnivanja
        ? `Firma ${ime} je osnovana ${formatDatum(firma.datum_osnivanja)} godine.`
        : `Za firmu ${ime} u APR podacima nema datuma osnivanja.`,
    },
  ];
}
