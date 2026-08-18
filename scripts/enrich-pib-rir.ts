/**
 * enrich-pib-rir.ts — NBS Jedinstveni registar računa (JRR) obogaćivanje.
 *
 * Dva režima:
 *
 *   1. PIB (podrazumevano): popunjava companies.pib za firme koje još nemaju
 *      PIB. Zašto: evidencija prinudne naplate (enrich-pib-blokade.ts) vraća
 *      PIB samo za firme koje su bile u prinudnoj naplati u poslednjih 5 godina
 *      (~80%). JRR pokriva SVE firme sa računom.
 *
 *   2. --adresa: popunjava companies.adresa i tabelu racuni (banka, broj
 *      računa, status, podleže blokadi, datum otvaranja) za firme koje još
 *      nemaju adresu. Isti NBS izvor koji koristi kompanije.co.rs za svoja
 *      polja "Adresa" i "Računi" (migracija 008, odobreno 17.08.2026).
 *
 * Upotreba:
 *   npx tsx scripts/enrich-pib-rir.ts [--konkurentnost=8]
 *   npx tsx scripts/enrich-pib-rir.ts --adresa [--konkurentnost=8] [--limit=1000]
 *
 * Nastavljiv: završeni matični brojevi idu u scripts/data/nbs-rir-zavrseno.json
 * (PIB režim) ili scripts/data/nbs-rir-adresa-zavrseno.json (--adresa režim).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "../lib/supabase";
import { NbsRirKlijent, type RirRacun } from "./lib/nbs-client";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Env može biti već postavljen u okolini; .env.local nije obavezan.
}

const ADRESA_REZIM = process.argv.includes("--adresa");
const KONKURENTNOST = brojArgumenta("--konkurentnost", 8);
const LIMIT = brojArgumenta("--limit", 0);
const PUT_PROGRESA = ADRESA_REZIM
  ? "scripts/data/nbs-rir-adresa-zavrseno.json"
  : "scripts/data/nbs-rir-zavrseno.json";

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

/**
 * Čita matične brojeve gde je kolona NULL (straničeno, po 1000).
 * maticni_broj je jedinstven tiebreaker: bez ORDER BY paginacija vraća
 * duplikate i preskače firme (otkriveno na RIR prolazu: ~19.5k preskočeno).
 */
async function firmeBezVrednosti(supabase: SupabaseClient, kolona: "pib" | "adresa"): Promise<string[]> {
  // --limit=N: jedna stranica, bez paginacije.
  if (LIMIT > 0) {
    const { data, error } = await supabase
      .from("companies")
      .select("maticni_broj")
      .is(kolona, null)
      .order("maticni_broj")
      .limit(LIMIT);
    if (error) throw new Error(`Čitanje companies: ${error.message}`);
    return (data ?? []).map((r) => r.maticni_broj);
  }

  const svi: string[] = [];
  let pocetak = 0;
  const korak = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("maticni_broj")
      .is(kolona, null)
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
  const kolona: "pib" | "adresa" = ADRESA_REZIM ? "adresa" : "pib";
  const ciljni = await firmeBezVrednosti(supabase, kolona);
  console.log(
    `Režim: ${ADRESA_REZIM ? "adresa+računi" : "PIB"}. Firmi bez ${kolona}: ${ciljni.length}, ` +
      `konkurentnost ${KONKURENTNOST}.`,
  );

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
      `[${obradjeno}/${ciljni.length}] ${procenat}% | popunjeno: ${popunjeno} | van JRR: ${bezRegistra} | ` +
        `greške: ${greske} | ETA ~${Math.round(preostalo / 60)} min`,
    );
  }

  async function radnik(): Promise<void> {
    const klijent = new NbsRirKlijent();
    let redovi: { mb: string; pib: string | null; adresa: string | null; racuni: RirRacun[] }[] = [];

    const flush = async (): Promise<void> => {
      if (redovi.length === 0) return;
      await Promise.all(
        redovi.map((r) => {
          if (ADRESA_REZIM) {
            const poslovi: unknown[] = [];
            if (r.adresa) {
              // updated_at se diže jer se sadržaj stranice stvarno menja —
              // lastmod u sitemapu mora ostati "consistently and verifiably
              // accurate" (SEO.md §5.2).
              poslovi.push(
                supabase
                  .from("companies")
                  .update({ adresa: r.adresa, updated_at: new Date().toISOString() })
                  .eq("maticni_broj", r.mb),
              );
            }
            if (r.racuni.length > 0) {
              poslovi.push(
                supabase
                  .from("racuni")
                  .upsert(
                    r.racuni.map((rk) => ({
                      maticni_broj: r.mb,
                      banka: rk.banka,
                      broj_racuna: rk.broj_racuna,
                      status: rk.status,
                      podleze_blokadi: rk.podleze_blokadi,
                      datum_otvaranja: rk.datum_otvaranja,
                    })),
                    { onConflict: "maticni_broj,broj_racuna" },
                  ),
              );
            }
            return Promise.all(poslovi);
          }
          return r.pib
            ? supabase.from("companies").update({ pib: r.pib }).eq("maticni_broj", r.mb)
            : Promise.resolve();
        }),
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
          const podaci = await klijent.podaciZaMaticniBroj(mb);
          if (ADRESA_REZIM) {
            if (podaci.adresa || podaci.racuni.length > 0) {
              redovi.push({ mb, pib: null, adresa: podaci.adresa, racuni: podaci.racuni });
              popunjeno++;
            } else {
              bezRegistra++;
            }
          } else if (podaci.pib) {
            redovi.push({ mb, pib: podaci.pib, adresa: null, racuni: [] });
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
  console.log(`Gotovo. Popunjeno: ${popunjeno}, van JRR: ${bezRegistra}, greške: ${greske}.`);
}

glavna().catch((greska) => {
  console.error("\n" + (greska instanceof Error ? greska.message : String(greska)));
  process.exit(1);
});
