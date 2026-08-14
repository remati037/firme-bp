import type { SupabaseClient } from "@supabase/supabase-js";
import type { RedFinansija, RedFirme } from "./map-apr";

const BATCH = 1000;
const STRANA = 1000; // supabase-js podrazumevano vraća najviše 1000 redova po upitu

/**
 * Čita celu tabelu kroz stranice. Bez ovoga bi se dobilo prvih 1000 redova,
 * pa bi 132.634 firme izgledale kao nove i slug bi im se regenerisao.
 */
async function ucitajSve<T>(
  supabase: SupabaseClient,
  tabela: string,
  kolone: string,
  poredak: string[],
): Promise<T[]> {
  const sve: T[] = [];

  for (let od = 0; ; od += STRANA) {
    // Poredak mora da pokrije ceo primarni ključ. Ako dve vrste dele vrednost
    // po kojoj se sortira, njihov međusobni redosled nije definisan i stranica
    // može da preskoči ili udvoji red.
    let upit = supabase.from(tabela).select(kolone);
    for (const kolona of poredak) upit = upit.order(kolona, { ascending: true });

    const { data, error } = await upit.range(od, od + STRANA - 1);

    if (error) throw new Error(`Čitanje ${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;

    sve.push(...(data as T[]));
    if (data.length < STRANA) break;
  }

  return sve;
}

export async function ucitajPostojeceFirme(
  supabase: SupabaseClient,
): Promise<Map<string, RedFirme>> {
  const redovi = await ucitajSve<RedFirme>(
    supabase,
    "companies",
    "maticni_broj, slug, poslovno_ime, poslovno_ime_norm, sifra_opstine, opstina, status, status_aktivan, datum_osnivanja, pravna_forma, sifra_delatnosti",
    ["maticni_broj"],
  );

  return new Map(redovi.map((red) => [red.maticni_broj, red]));
}

export async function ucitajPostojeceFinansije(
  supabase: SupabaseClient,
): Promise<Map<string, RedFinansija>> {
  const redovi = await ucitajSve<RedFinansija>(
    supabase,
    "financials",
    "maticni_broj, godina, poslovna_imovina, kapital, gubitak, ukupni_prihodi, neto_dobitak, neto_gubitak, prosecan_broj_zaposlenih",
    ["maticni_broj", "godina"],
  );

  return new Map(redovi.map((red) => [`${red.maticni_broj}:${red.godina}`, red]));
}

export async function upsertUBatchevima<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  tabela: string,
  redovi: T[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < redovi.length; i += BATCH) {
    const deo = redovi.slice(i, i + BATCH);
    // Kasting je neophodan: bez poznatog tipa baze (Database generic), postgrest-js
    // ne ume da izvede tip kolone za proizvoljnu tabelu prosleđenu kao string.
    const { error } = await supabase.from(tabela).upsert(deo as Record<string, unknown>[], { onConflict });

    if (error) {
      throw new Error(
        `Upsert u ${tabela} pao na redovima ${i}-${i + deo.length - 1}: ${error.message}`,
      );
    }

    if ((i / BATCH) % 20 === 0 && i > 0) {
      console.log(`    ${tabela}: ${i} / ${redovi.length}`);
    }
  }
}

/**
 * Čist insert, bez on conflict. Za financials_history, koja je append only i čiji je
 * ključ bigserial: redovi se šalju bez id-a, pa upsert ovde ne bi imao smisla.
 */
export async function insertUBatchevima<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  tabela: string,
  redovi: T[],
): Promise<void> {
  for (let i = 0; i < redovi.length; i += BATCH) {
    const deo = redovi.slice(i, i + BATCH);
    // Isti razlog za kasting kao u upsertUBatchevima.
    const { error } = await supabase.from(tabela).insert(deo as Record<string, unknown>[]);

    if (error) {
      throw new Error(
        `Insert u ${tabela} pao na redovima ${i}-${i + deo.length - 1}: ${error.message}`,
      );
    }
  }
}

/** Jedini dozvoljen delete: ponovna obrada istog preseka uz --force. */
export async function obrisiIstorijuZaPresek(
  supabase: SupabaseClient,
  datumPreseka: string,
): Promise<number> {
  const { error, count } = await supabase
    .from("financials_history")
    .delete({ count: "exact" })
    .eq("datum_preseka", datumPreseka);

  if (error) throw new Error(`Brisanje istorije za ${datumPreseka}: ${error.message}`);

  return count ?? 0;
}
