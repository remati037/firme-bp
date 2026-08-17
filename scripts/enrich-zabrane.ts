/**
 * enrich-zabrane.ts — privremena ograničenja prava iz APR Centralne evidencije
 * (crp.apr.gov.rs) u tabelu `zabrane` (migracija 007).
 *
 * Za svaku firmu: pretraga aktivnih mera po MB (bez captche), pa za svaku meru
 * detalji (vrsta, šifra, početak važenja, izbrisanost, opis). Upsert po
 * izvor_id — idempotentno i nastavljivo (progress u
 * scripts/data/nbs-zabrane-zavrseno.json).
 *
 * Upotreba:
 *   npx tsx scripts/enrich-zabrane.ts               # sve firme
 *   npx tsx scripts/enrich-zabrane.ts --konkurentnost=8
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "../lib/supabase";
import { CrpKlijent } from "./lib/crp-client";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Env može biti već postavljen u okolini.
}

const KONKURENTNOST = brojArgumenta("--konkurentnost", 8);
/** --dopuna: cilj su samo firme koje već imaju barem jednu meru (nakon popravke parsera). */
const DOPUNA = process.argv.includes("--dopuna");
/** --sve-ponovo: ignoriše progress fajl i ponovo obrađuje SVE ciljne firme (idempotentno). */
const SVE_PONOVO = process.argv.includes("--sve-ponovo");
/**
 * --aktivne: RestrictionIsActive=1 — samo mere NA SNAZI. Prazan filter (bez
 * ovog flag-a) vraća u praksi samo neaktivne/izbrisane mere, pa je ovaj prolaz
 * neophodan za aktuelna ograničenja. Cilja sve firme.
 */
const AKTIVNE = process.argv.includes("--aktivne");
const PUT_PROGRESA = AKTIVNE
  ? "scripts/data/nbs-zabrane-aktivne-zavrseno.json"
  : DOPUNA
    ? "scripts/data/nbs-zabrane-dopuna-zavrseno.json"
    : "scripts/data/nbs-zabrane-zavrseno.json";

function brojArgumenta(ime: string, podrazumevano: number): number {
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

/** Svi matični brojevi (stabilna paginacija, maticni_broj kao tiebreaker). */
async function sviMaticniBrojevi(supabase: SupabaseClient): Promise<string[]> {
  const svi: string[] = [];
  let pocetak = 0;
  const korak = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("maticni_broj")
      .order("maticni_broj")
      .range(pocetak, pocetak + korak - 1);
    if (error) throw new Error(`Čitanje companies: ${error.message}`);
    if (!data || data.length === 0) break;
    svi.push(...data.map((r) => r.maticni_broj));
    if (data.length < korak) break;
    pocetak += korak;
  }
  return svi;
}

/**
 * Dopuna: firme koje već imaju barem jednu meru u tabeli. Nakon popravke
 * parsera (više mera po redu), ponovni prolaz dodaje preskočene mere.
 */
async function firmeSaMerama(supabase: SupabaseClient): Promise<string[]> {
  const svi: string[] = [];
  let pocetak = 0;
  const korak = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("zabrane")
      .select("maticni_broj")
      .order("maticni_broj")
      .range(pocetak, pocetak + korak - 1);
    if (error) throw new Error(`Čitanje zabrane: ${error.message}`);
    if (!data || data.length === 0) break;
    svi.push(...data.map((r) => r.maticni_broj));
    if (data.length < korak) break;
    pocetak += korak;
  }
  return [...new Set(svi)];
}

type ZabranaRed = {
  maticni_broj: string;
  izvor_id: string;
  referenca: string | null;
  vrsta: string | null;
  sifra: string | null;
  pocetak_vazenja: string | null;
  izbrisana: boolean | null;
  opis: string | null;
  provereno_at: string;
};

async function glavna(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const ciljni = AKTIVNE
    ? await sviMaticniBrojevi(supabase)
    : DOPUNA
      ? await firmeSaMerama(supabase)
      : await sviMaticniBrojevi(supabase);
  console.log(
    `Firmi: ${ciljni.length} (${
      AKTIVNE ? "aktivne mere — sve firme" : DOPUNA ? "dopuna — samo sa merama" : "sve"
    }), konkurentnost ${KONKURENTNOST}.`,
  );

  const zavrseno = SVE_PONOVO
    ? new Set<string>()
    : new Set<string>(ucitajJson<string[]>(PUT_PROGRESA, []));
  let indeks = 0;
  let obradjeno = 0;
  let saMerama = 0;
  let meraUkupno = 0;
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
    console.log(
      `[${obradjeno}/${ciljni.length}] ${procenat}% | sa merama: ${saMerama} | mera: ${meraUkupno} | ` +
        `greške: ${greske} | ETA ~${Math.round(preostalo / 60)} min`,
    );
  }

  async function radnik(): Promise<void> {
    const klijent = new CrpKlijent();
    let redovi: ZabranaRed[] = [];

    const flush = async (): Promise<void> => {
      if (redovi.length === 0) return;
      // Ista mera (izvor_id) može da se pojavi dva puta u odgovoru za jednu
      // firmu — bez dedupa upsert u istom batch-u puca sa
      // "ON CONFLICT DO UPDATE command cannot affect row a second time".
      const bezDuplikata = [...new Map(redovi.map((r) => [r.izvor_id, r])).values()];
      redovi = [];
      const { error } = await supabase.from("zabrane").upsert(bezDuplikata, { onConflict: "izvor_id" });
      if (error) console.warn(`  upsert zabrane: ${error.message}`);
    };

    try {
      while (true) {
        const i = indeks++;
        if (i >= ciljni.length) break;
        const mb = ciljni[i];
        if (zavrseno.has(mb)) continue;

        try {
          const mere = await klijent.mereZaMaticniBroj(mb, AKTIVNE);
          if (mere.length > 0) {
            saMerama++;
            for (const m of mere) {
              const d = await klijent.detaljiMere(m.izvorId);
              redovi.push({
                maticni_broj: mb,
                izvor_id: m.izvorId,
                referenca: m.referenca ?? d.referenca,
                vrsta: d.vrsta,
                sifra: d.sifra,
                pocetak_vazenja: d.pocetakVazenja,
                izbrisana: d.izbrisana,
                opis: d.opis,
                provereno_at: new Date().toISOString(),
              });
              meraUkupno++;
            }
          }

          zavrseno.add(mb);
          obradjeno++;
          odPoslednjegZapisa++;

          if (redovi.length >= 50) await flush();
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

  await Promise.all(Array.from({ length: KONKURENTNOST }, () => radnik()));

  sacuvajProgres();
  prikaziProgres();
  console.log(`Gotovo. Sa merama: ${saMerama}, mera ukupno: ${meraUkupno}, greške: ${greske}.`);
}

glavna().catch((greska) => {
  console.error("\n" + (greska instanceof Error ? greska.message : String(greska)));
  process.exit(1);
});
