import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "../lib/supabase";
import { trimMb } from "../lib/normalize";
import { APR_ENDPOINTI, preuzmiUFajl, procitajDatumPreseka } from "./lib/apr-client";
import { arhiviraj, osigurajBucket } from "./lib/archive";
import {
  finansijeIzmenjene,
  firmaIzmenjena,
  mapirajFinansije,
  mapirajFirmu,
  type RedFinansija,
  type RedFirme,
  type RedIstorije,
  type SirovaFirma,
  type SirovFi,
} from "./lib/map-apr";
import {
  insertUBatchevima,
  obrisiIstorijuZaPresek,
  ucitajPostojeceFinansije,
  ucitajPostojeceFirme,
  upsertUBatchevima,
} from "./lib/upsert";

const FORCE = process.argv.includes("--force");
const PRAG_ODSTUPANJA = 0.05; // 5%, po CLAUDE.md
const PRAG_PRESKOCENIH = 0.01; // 1%

type Sirov<T> = { DatumPreseka: string; Podaci: Record<string, T> };

function ucitajJson<T>(put: string): Sirov<T> {
  return JSON.parse(readFileSync(put, "utf8"));
}

function trajanje(od: number): string {
  return `${((Date.now() - od) / 1000).toFixed(1)} s`;
}

/** Prekida ingest ako bi pokvaren odgovor pregazio bazu. */
async function proveriOdstupanje(
  supabase: SupabaseClient,
  datumPreseka: string,
  brojFirmi: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("snapshots")
    .select("datum_preseka, broj_firmi")
    .order("datum_preseka", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Čitanje snapshots: ${error.message}`);

  const prethodni = data?.[0];
  if (!prethodni) return; // prvi ingest, nema sa čim da se poredi

  if (prethodni.datum_preseka >= datumPreseka && !FORCE) {
    throw new Error(
      `Presek ${datumPreseka} nije noviji od poslednjeg obrađenog (${prethodni.datum_preseka}). ` +
        "Pokreni sa --force ako je namerno.",
    );
  }

  const odstupanje = Math.abs(brojFirmi - prethodni.broj_firmi) / prethodni.broj_firmi;

  if (odstupanje > PRAG_ODSTUPANJA && !FORCE) {
    throw new Error(
      `Broj firmi odstupa ${(odstupanje * 100).toFixed(1)}% od preseka ` +
        `${prethodni.datum_preseka} (${prethodni.broj_firmi} -> ${brojFirmi}). ` +
        "Prag je 5%. Proveri izvor, pa pokreni sa --force ako je odstupanje stvarno.",
    );
  }
}

async function glavna(): Promise<void> {
  const pocetak = Date.now();

  try {
    process.loadEnvFile(".env.local");
  } catch {
    // U GitHub Actions fajla nema, vrednosti stižu iz secrets.
  }

  const supabase = getSupabaseServerClient();
  const radni = mkdtempSync(path.join(tmpdir(), "apr-ingest-"));

  try {
    // --- Korak 0: presek, uz 8 KB umesto 147 MB ---------------------------
    const datumPreseka = await procitajDatumPreseka(APR_ENDPOINTI[0].url);
    console.log(`Presek: ${datumPreseka}${FORCE ? " (--force)" : ""}`);

    const { data: postojeci, error: greskaSnapshota } = await supabase
      .from("snapshots")
      .select("datum_preseka")
      .eq("datum_preseka", datumPreseka)
      .maybeSingle();

    if (greskaSnapshota) throw new Error(`Čitanje snapshots: ${greskaSnapshota.message}`);

    if (postojeci && !FORCE) {
      console.log("presek već obrađen");
      return;
    }

    // --- Korak 1: povlačenje ---------------------------------------------
    console.log("\nPovlačenje:");
    const putanje: Record<string, string> = {};

    for (const endpoint of APR_ENDPOINTI) {
      const put = path.join(radni, endpoint.imeFajla);
      const bajtova = await preuzmiUFajl(endpoint.url, put);
      putanje[endpoint.kljuc] = put;
      console.log(`  ${endpoint.kljuc}: ${(bajtova / 1024 / 1024).toFixed(1)} MB`);
    }

    // --- Korak 2: arhiviranje --------------------------------------------
    console.log("\nArhiviranje:");
    await osigurajBucket(supabase);

    for (const endpoint of APR_ENDPOINTI) {
      const cilj = `${datumPreseka}/${endpoint.imeFajla}.gz`;
      const gzBajtova = await arhiviraj(supabase, putanje[endpoint.kljuc], cilj);
      console.log(`  ${cilj}: ${(gzBajtova / 1024 / 1024).toFixed(1)} MB`);
    }

    // --- Korak 3: companies ----------------------------------------------
    console.log("\nFirme:");
    const sirovFirme = ucitajJson<SirovaFirma>(putanje.companies);
    const unosiFirmi = Object.entries(sirovFirme.Podaci);

    await proveriOdstupanje(supabase, datumPreseka, unosiFirmi.length);

    // Rucni spisak skracenih imena. Nije obavezan; ako ga nema, radi algoritam.
    const putOverride = path.join(process.cwd(), "scripts/data/ime-override.json");
    const overrides: Record<string, string> = existsSync(putOverride)
      ? JSON.parse(readFileSync(putOverride, "utf8"))
      : {};
    if (Object.keys(overrides).length) {
      console.log(`  rucnih imena: ${Object.keys(overrides).length}`);
    }

    const postojeceFirme = await ucitajPostojeceFirme(supabase);

    // updated_at se stavlja na SVAKI red u ovom nizu, i nov i izmenjen. Niz i
    // sadrži samo nove i izmenjene, pa kolona i dalje ne laže da je red diran
    // svakog meseca.
    //
    // Mora na sve: postgrest-js racuna "columns" kao uniju kljuceva celog niza
    // i podrazumevano salje missing kao NULL. Da nov red nema updated_at, a
    // izmenjen ga ima, batch koji sadrzi oba upisao bi NULL u kolonu koja je
    // not null, i ceo ingest bi pukao. To se ne vidi pri prvom punjenju, jer su
    // tada svi redovi novi, nego tek na drugom stvarnom preseku.
    const sada = new Date().toISOString();
    const zaUpisFirme: (RedFirme & { updated_at: string })[] = [];
    const poznatiMb = new Set<string>();
    const preskoceneFirme: string[] = [];
    let novihFirmi = 0;

    for (const [kljuc, sirovo] of unosiFirmi) {
      const mb = trimMb(kljuc);
      if (!mb) {
        preskoceneFirme.push(kljuc);
        continue;
      }

      const staro = postojeceFirme.get(mb) ?? null;

      // mapirajFirmu baca na neispravan podatak umesto da ga tiho pretvori u
      // nulu. Red se preskače i broji, a prag od 1% niže prekida ingest ako
      // takvih bude mnogo.
      let novo: RedFirme;
      try {
        novo = mapirajFirmu(mb, sirovo, staro?.slug ?? null, overrides);
      } catch (greska) {
        preskoceneFirme.push(`${mb}: ${greska instanceof Error ? greska.message : greska}`);
        continue;
      }

      // Tek posle uspešnog mapiranja. Preskočena firma ne sme da važi za
      // poznatu, jer bi njen finansijski red onda prošao kao ne-siroče i pukao
      // na stranom ključu.
      poznatiMb.add(mb);

      if (!staro) {
        novihFirmi++;
        zaUpisFirme.push({ ...novo, updated_at: sada });
      } else if (firmaIzmenjena(novo, staro)) {
        zaUpisFirme.push({ ...novo, updated_at: sada });
      }
    }

    if (unosiFirmi.length === 0) {
      throw new Error("APR je vratio nula firmi. Izvor je pokvaren, ništa se ne upisuje.");
    }

    if (preskoceneFirme.length / unosiFirmi.length > PRAG_PRESKOCENIH) {
      throw new Error(
        `Preskočeno ${preskoceneFirme.length} od ${unosiFirmi.length} firmi zbog neispravnog ` +
          `matičnog broja, prag je 1%. Primeri: ${preskoceneFirme.slice(0, 10).join(", ")}`,
      );
    }

    console.log(`  ukupno ${unosiFirmi.length}, novih ${novihFirmi}, ` +
      `izmenjenih ${zaUpisFirme.length - novihFirmi}, preskočenih ${preskoceneFirme.length}`);
    await upsertUBatchevima(supabase, "companies", zaUpisFirme, "maticni_broj");

    // --- Korak 4 i 5: financials i istorija -------------------------------
    console.log("\nFinansije:");
    const sirovFi = ucitajJson<SirovFi>(putanje["financial-statements"]);
    const unosiFi = Object.entries(sirovFi.Podaci);

    if (sirovFi.DatumPreseka !== datumPreseka) {
      console.warn(
        `  Upozorenje: financial-statements ima presek ${sirovFi.DatumPreseka}, ` +
          `a companies ${datumPreseka}. Koristi se ${datumPreseka}.`,
      );
    }

    const postojeceFinansije = await ucitajPostojeceFinansije(supabase);
    const zaUpisFinansije: RedFinansija[] = [];
    const zaIstoriju: RedIstorije[] = [];
    const preskoceniFi: string[] = [];
    let siroca = 0;
    let novihFi = 0;

    for (const [kljuc, sirovo] of unosiFi) {
      const mb = trimMb(kljuc); // 11.099 ključeva ima razmak na kraju
      if (!mb) {
        preskoceniFi.push(kljuc);
        continue;
      }

      // Isto kao kod firmi: neispravan broj ili godina bacaju, red se preskače.
      // Godina je deo primarnog ključa, pa tiha nula ovde znači da bi dva
      // izveštaja iste firme pregazila jedan drugi.
      let red: RedFinansija;
      try {
        red = mapirajFinansije(mb, sirovo);
      } catch (greska) {
        preskoceniFi.push(`${mb}: ${greska instanceof Error ? greska.message : greska}`);
        continue;
      }

      zaIstoriju.push({ ...red, datum_preseka: datumPreseka });

      // Siročići nemaju firmu u companies, pa bi pukli na stranom ključu.
      // Ostaju samo u istoriji, koja nema FK.
      if (!poznatiMb.has(mb)) {
        siroca++;
        continue;
      }

      const staro = postojeceFinansije.get(`${mb}:${red.godina}`) ?? null;
      if (!staro) {
        novihFi++;
        zaUpisFinansije.push(red);
      } else if (finansijeIzmenjene(red, staro)) {
        zaUpisFinansije.push(red);
      }
    }

    if (unosiFi.length > 0 && preskoceniFi.length / unosiFi.length > PRAG_PRESKOCENIH) {
      throw new Error(
        `Preskočeno ${preskoceniFi.length} od ${unosiFi.length} finansijskih redova, prag je 1%. ` +
          `Primeri: ${preskoceniFi.slice(0, 10).join(", ")}`,
      );
    }

    console.log(`  ukupno ${unosiFi.length}, novih ${novihFi}, ` +
      `izmenjenih ${zaUpisFinansije.length - novihFi}, siročića ${siroca}, ` +
      `preskočenih ${preskoceniFi.length}`);
    await upsertUBatchevima(supabase, "financials", zaUpisFinansije, "maticni_broj,godina");

    // Uvek, ne samo uz --force. Red u snapshots se upisuje tek na kraju, pa
    // ingest prekinut u pola upisa istorije ostavlja deo redova bez ikakvog
    // traga. Sledeće pokretanje bi ih onda udvojilo. Brisanje je ograničeno na
    // tekući datum_preseka, dakle na tačno one redove koje upravo pišemo; pri
    // prvom uspešnom prolazu obriše nula redova.
    const obrisano = await obrisiIstorijuZaPresek(supabase, datumPreseka);
    if (obrisano > 0) {
      console.log(`  istorija: obrisano ${obrisano} redova iz ranijeg pokušaja za ovaj presek`);
    }

    await insertUBatchevima(supabase, "financials_history", zaIstoriju);
    console.log(`  istorija: upisano ${zaIstoriju.length} redova`);

    // --- Korak 6: zatvaranje ---------------------------------------------
    // Refresh ide PRE upisa u snapshots. Red u snapshots znači "presek u
    // potpunosti obrađen", a osvežena statistika je deo toga. Obrnut redosled
    // znači da pad refresha ostavlja presek označen kao gotov, pa svako
    // sledeće pokretanje kratko spaja na "presek već obrađen" i view-ovi
    // ostaju zastareli dok neko to ručno ne primeti.
    console.log("\nOsvežavanje statistike...");
    const { error: greskaRefresha } = await supabase.rpc("refresh_all_stats");
    if (greskaRefresha) throw new Error(`refresh_all_stats: ${greskaRefresha.message}`);

    const { error: greskaUpisa } = await supabase.from("snapshots").upsert(
      {
        datum_preseka: datumPreseka,
        storage_path: `${datumPreseka}/`,
        broj_firmi: unosiFirmi.length,
        broj_fi: unosiFi.length,
      },
      { onConflict: "datum_preseka" },
    );

    if (greskaUpisa) throw new Error(`Upis u snapshots: ${greskaUpisa.message}`);

    console.log(`\nGotovo za ${trajanje(pocetak)}.`);
  } finally {
    rmSync(radni, { recursive: true, force: true });
  }
}

glavna().catch((greska) => {
  console.error("\nIngest nije uspeo:", greska instanceof Error ? greska.message : greska);
  process.exit(1);
});
