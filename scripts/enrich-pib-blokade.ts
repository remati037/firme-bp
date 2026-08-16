/**
 * enrich-pib-blokade.ts — dopunjuje PIB (companies.pib) i blokade (tabela blokade)
 * iz NBS javne pretrage dužnika u prinudnoj naplati.
 *
 * Zašto: APR open data nema PIB ni blokade (CLAUDE.md). NBS javna pretraga
 * (webappcenter.nbs.rs/PnWebApp/EnforcedCollectionDebtor) vraća po matičnom
 * broju: PIB, ukupan iznos blokade, periode blokade u 5 godina i datum zabrane
 * prenosa — bez registracije i bez captche.
 *
 * Upotreba:
 *   npx tsx scripts/enrich-pib-blokade.ts                 # top 5000 po prihodu
 *   npx tsx scripts/enrich-pib-blokade.ts --limit=0       # sve firme
 *   npx tsx scripts/enrich-pib-blokade.ts --konkurentnost=10
 *
 * Nastavljivost: završeni matični brojevi se čuvaju u scripts/data/nbs-zavrseno.json
 * (piše se svakih 100 obrada i pri SIGINT-u), pa se prekinut prolaz nastavlja
 * preskačući već obrađene. Upsert je idempotentan.
 *
 * Ako tabela blokade još nije primenjena (migracija 006), skripta upozorava i
 * upisuje blokade u scripts/data/nbs-blokade.json umesto u bazu — PIB se i
 * tada upisuje u companies.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "../lib/supabase";
import { NbsKlijent, imaBlokadu, type NbsPodaci, type PeriodBlokade } from "./lib/nbs-client";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Env može biti već postavljen u okolini; .env.local nije obavezan.
}

const LIMIT = brojArgumenta("--limit", 5000); // 0 = sve firme
const KONKURENTNOST = brojArgumenta("--konkurentnost", 6);
const PUT_PROGRESA = "scripts/data/nbs-zavrseno.json";
const PUT_BLOKADE_FALLBACK = "scripts/data/nbs-blokade.json";

function brojArgumenta(ime: string, podrazumevano: number): number {
  // Podržano: `--ime=123` i `--ime 123`.
  const saJednako = process.argv.find((a) => a.startsWith(`${ime}=`));
  if (saJednako) {
    const v = Number.parseInt(saJednako.slice(ime.length + 1), 10);
    if (!Number.isFinite(v) || v < 0) throw new Error(`${ime} mora biti ceo broj >= 0`);
    return v;
  }
  const i = process.argv.indexOf(ime);
  if (i === -1) return podrazumevano;
  const v = Number.parseInt(process.argv[i + 1] ?? "", 10);
  if (!Number.isFinite(v) || v < 0) throw new Error(`${ime} mora biti ceo broj >= 0`);
  return v;
}

function ucitajJson<T>(put: string, prazno: T): T {
  if (!existsSync(put)) return prazno;
  try {
    return JSON.parse(readFileSync(put, "utf8")) as T;
  } catch {
    return prazno;
  }
}

/** Čita ciljne matične brojeve: top N po prihodu (iz mv_company_ranks). */
async function ciljniMaticniBrojevi(supabase: SupabaseClient): Promise<string[]> {
  const svi: string[] = [];
  const korak = 1000; // PostgREST podrazumevano ograničava redove, pa idemo po komadima
  let pocetak = 0;
  const cilj = LIMIT > 0 ? LIMIT : Number.POSITIVE_INFINITY;

  while (pocetak < cilj) {
    const doKraja = Math.min(pocetak + korak, cilj) - 1;
    const { data, error } = await supabase
      .from("mv_company_ranks")
      .select("maticni_broj")
      .order("ukupni_prihodi", { ascending: false, nullsFirst: false })
      // maticni_broj je jedinstven tiebreaker: bez njega Postgres ne garantuje
      // stabilan redosled redova sa NULL prihodom, pa paginacija preskače
      // firme (otkriveno na punom prolazu: ~13k firmi je ostalo neobrađeno).
      .order("maticni_broj")
      .range(pocetak, doKraja);
    if (error) throw new Error(`Čitanje mv_company_ranks: ${error.message}`);
    if (!data || data.length === 0) break;
    svi.push(...data.map((r) => r.maticni_broj));
    if (data.length < korak) break;
    pocetak += korak;
  }
  return svi;
}

/** Postoji li tabela blokade (migracija 006 primenjena)? */
async function tabelaBlokadePostoji(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("blokade").select("maticni_broj").limit(1);
  return !error || !/could not find the table/i.test(error.message);
}

async function upisiPib(supabase: SupabaseClient, redovi: { mb: string; pib: string }[]): Promise<void> {
  await Promise.all(
    redovi.map((r) =>
      supabase.from("companies").update({ pib: r.pib }).eq("maticni_broj", r.mb).select("maticni_broj"),
    ),
  );
}

async function upisiBlokade(
  supabase: SupabaseClient,
  redovi: BlokadaRed[],
  fallback: BlokadaRed[],
  tabelaPostoji: boolean,
): Promise<void> {
  if (tabelaPostoji) {
    await supabase.from("blokade").upsert(redovi, { onConflict: "maticni_broj" });
  } else {
    fallback.push(...redovi);
    writeFileSync(PUT_BLOKADE_FALLBACK, JSON.stringify(fallback, null, 2));
  }
}

type BlokadaRed = {
  maticni_broj: string;
  iznos: number | null;
  ukupno_dana: number | null;
  zabrana_prenosa: string | null;
  periodi: PeriodBlokade[] | null;
  provereno_at: string;
};

// ---------------------------------------------------------------------------
// Glavni tok
// ---------------------------------------------------------------------------

async function glavna(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const ciljni = await ciljniMaticniBrojevi(supabase);
  const tabelaPostoji = await tabelaBlokadePostoji(supabase);

  console.log(
    `Cilj: ${ciljni.length} firmi (top po prihodu${LIMIT > 0 ? `, limit ${LIMIT}` : ""}), ` +
      `konkurentnost ${KONKURENTNOST}, tabela blokade: ${tabelaPostoji ? "u bazi" : "NEDOSTAJE (fallback u JSON)"}`,
  );
  if (!tabelaPostoji) {
    console.warn("  Primeni supabase/migrations/006_blokade.sql da blokade idu u bazu.");
  }

  const zavrseno = new Set<string>(ucitajJson<string[]>(PUT_PROGRESA, []));
  const fallback = ucitajJson<BlokadaRed[]>(PUT_BLOKADE_FALLBACK, []);

  let indeks = 0;
  let obradjeno = 0;
  let pibPopunjen = 0;
  let saBlokadom = 0;
  let greske = 0;
  let odPoslednjegZapisa = 0;
  const pocetak = Date.now();

  function sacuvajProgres(): void {
    writeFileSync(PUT_PROGRESA, JSON.stringify([...zavrseno]));
  }

  function prikaziProgres(): void {
    const procenat = ((obradjeno / ciljni.length) * 100).toFixed(1);
    const proteklo = (Date.now() - pocetak) / 1000;
    const poSekundi = obradjeno / Math.max(proteklo, 0.001);
    const preostalo = poSekundi > 0 ? (ciljni.length - obradjeno) / poSekundi : 0;
    const etam = Math.round(preostalo / 60);
    console.log(
      `[${obradjeno}/${ciljni.length}] ${procenat}% | PIB: ${pibPopunjen} | blokade: ${saBlokadom} | ` +
        `greške: ${greske} | ETA ~${etam} min`,
    );
  }

  async function radnik(): Promise<void> {
    const klijent = new NbsKlijent();
    let pibRedovi: { mb: string; pib: string }[] = [];
    let blokadeRedovi: BlokadaRed[] = [];

    const flush = async (): Promise<void> => {
      if (pibRedovi.length > 0) {
        await upisiPib(supabase, pibRedovi);
        pibRedovi = [];
      }
      if (blokadeRedovi.length > 0) {
        await upisiBlokade(supabase, blokadeRedovi, fallback, tabelaPostoji);
        blokadeRedovi = [];
      }
    };

    try {
      while (true) {
        const i = indeks++;
        if (i >= ciljni.length) break;
        const mb = ciljni[i];
        if (zavrseno.has(mb)) continue;

        try {
          const podaci: NbsPodaci = await klijent.podaciZaMaticniBroj(mb);

          if (podaci.pib) {
            pibRedovi.push({ mb, pib: podaci.pib });
            pibPopunjen++;
          }
          if (imaBlokadu(podaci)) {
            blokadeRedovi.push({
              maticni_broj: mb,
              iznos: podaci.iznos,
              ukupno_dana: podaci.ukupnoDana,
              zabrana_prenosa: podaci.zabranaPrenosa,
              periodi: podaci.periodi.length > 0 ? podaci.periodi : null,
              provereno_at: new Date().toISOString(),
            });
            saBlokadom++;
          }

          zavrseno.add(mb);
          obradjeno++;
          odPoslednjegZapisa++;

          if (pibRedovi.length >= 25 || blokadeRedovi.length >= 100) await flush();
          if (odPoslednjegZapisa >= 100) {
            sacuvajProgres();
            odPoslednjegZapisa = 0;
            prikaziProgres();
          }
        } catch (greska) {
          greske++;
          console.warn(`  greška za ${mb}: ${greska instanceof Error ? greska.message : String(greska)}`);
        }
      }
    } finally {
      await flush();
    }
  }

  process.on("SIGINT", () => {
    sacuvajProgres();
    console.log("\nPrekinuto — progres sačuvan u", PUT_PROGRESA);
    process.exit(130);
  });

  const radnici = Array.from({ length: KONKURENTNOST }, () => radnik());
  await Promise.all(radnici);

  sacuvajProgres();
  prikaziProgres();
  console.log(
    `Gotovo. PIB popunjen: ${pibPopunjen}, firme sa blokadom: ${saBlokadom}, greške: ${greske}.`,
  );
  if (!tabelaPostoji) {
    console.log(`Blokade (fallback) u ${PUT_BLOKADE_FALLBACK}: ${fallback.length} redova.`);
  }
}

glavna().catch((greska) => {
  console.error("\n" + (greska instanceof Error ? greska.message : String(greska)));
  process.exit(1);
});
