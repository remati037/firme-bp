/**
 * enrich-pib-rir.ts — drugi prolaz za PIB preko NBS Jedinstvenog registra računa.
 *
 * Zašto: evidencija prinudne naplate (enrich-pib-blokade.ts) vraća PIB samo za
 * firme koje su bile u prinudnoj naplati u poslednjih 5 godina (~80%). JRR
 * (registar računa) pokriva SVE firme sa računom, pa ovaj prolaz popunjava
 * companies.pib za preostale.
 *
 * Upotreba:
 *   npx tsx scripts/enrich-pib-rir.ts [--konkurentnost=8]
 *
 * Pokreće se POSLE enrich-pib-blokade.ts — cilja samo firme koje još nemaju PIB.
 * Nastavljiv: završeni matični brojevi idu u scripts/data/nbs-rir-zavrseno.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "../lib/supabase";
import { NbsRirKlijent } from "./lib/nbs-client";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Env može biti već postavljen u okolini; .env.local nije obavezan.
}

const KONKURENTNOST = brojArgumenta("--konkurentnost", 8);
const PUT_PROGRESA = "scripts/data/nbs-rir-zavrseno.json";

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

/** Čita firme bez PIB-a (straničeno, po 1000). */
async function firmeBezPiba(supabase: SupabaseClient): Promise<string[]> {
  const svi: string[] = [];
  let pocetak = 0;
  const korak = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("maticni_broj")
      .is("pib", null)
      // maticni_broj je jedinstven tiebreaker: bez ORDER BY paginacija vraća
      // duplikate i preskače firme (otkriveno na RIR prolazu: ~19.5k preskočeno).
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

async function glavna(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const ciljni = await firmeBezPiba(supabase);
  console.log(`Firmi bez PIB-a: ${ciljni.length}, konkurentnost ${KONKURENTNOST}.`);

  const zavrseno = new Set<string>(ucitajJson<string[]>(PUT_PROGRESA, []));
  let indeks = 0;
  let obradjeno = 0;
  let popunjeno = 0;
  let bezRegistra = 0;
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
      `[${obradjeno}/${ciljni.length}] ${procenat}% | PIB: ${popunjeno} | van JRR: ${bezRegistra} | ` +
        `greške: ${greske} | ETA ~${Math.round(preostalo / 60)} min`,
    );
  }

  async function radnik(): Promise<void> {
    const klijent = new NbsRirKlijent();
    let redovi: { mb: string; pib: string }[] = [];

    const flush = async (): Promise<void> => {
      if (redovi.length === 0) return;
      await Promise.all(
        redovi.map((r) =>
          supabase.from("companies").update({ pib: r.pib }).eq("maticni_broj", r.mb),
        ),
      );
      redovi = [];
    };

    try {
      while (true) {
        const i = indeks++;
        if (i >= ciljni.length) break;
        const mb = ciljni[i];
        if (zavrseno.has(mb)) continue;

        try {
          const pib = await klijent.pibZaMaticniBroj(mb);
          if (pib) {
            redovi.push({ mb, pib });
            popunjeno++;
          } else {
            bezRegistra++;
          }
          zavrseno.add(mb);
          obradjeno++;
          odPoslednjegZapisa++;

          if (redovi.length >= 25) await flush();
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
  console.log(`Gotovo. PIB popunjen: ${popunjeno}, van JRR: ${bezRegistra}, greške: ${greske}.`);
}

glavna().catch((greska) => {
  console.error("\n" + (greska instanceof Error ? greska.message : String(greska)));
  process.exit(1);
});
