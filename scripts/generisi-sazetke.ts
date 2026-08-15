import { getSupabaseServerClient } from "../lib/supabase";
import { izracunajPokazatelje } from "../lib/pokazatelji";
import { izracunajSignale } from "../lib/signali";
import type { Finansije, Firma, StatistikaDelatnosti } from "../lib/queries";
import { upsertUBatchevima } from "./lib/upsert";
import {
  cenaSada,
  formatUSD,
  jePeak,
  nadjiModel,
  sledeciOffPeak,
  trosak,
  type Provajder,
} from "./lib/ai/modeli";
import { napraviKlijenta, podrazumevaniModel } from "./lib/ai/provajder";
import {
  imaUpotrebljiveFinansije,
  korisnickiPrompt,
  SISTEMSKI_PROMPT,
  type PodaciZaSazetak,
} from "./lib/ai/prompt";

/**
 * Generisanje AI sažetaka u tabelu `ai_summaries` (SEO.md §1.6).
 *
 * Sažetak se pravi JEDNOM po firmi po datumu preseka, upisuje u bazu i odatle
 * renderuje serverski. Posetilac stranice ne pokreće nijedan AI poziv, pa
 * saobraćaj ne košta ništa — ceo trošak je ovde.
 *
 * Provajder se bira pri pokretanju, ne u kodu:
 *   npx tsx scripts/generisi-sazetke.ts --limit=20
 *   npx tsx scripts/generisi-sazetke.ts --limit=20 --potvrdi
 *   npx tsx scripts/generisi-sazetke.ts --limit=5000 --model=claude-haiku-4-5 --potvrdi
 *
 * BEZ `--potvrdi` skripta ne šalje nijedan zahtev i ne troši ništa. To je
 * podrazumevano stanje namerno: prolaz kroz ceo set je trošak od nekoliko
 * hiljada dinara i ne sme da se desi zabunom.
 *
 * Zastavice:
 *   --limit=N       najviše N firmi, redom po prihodu opadajuće (top N)
 *   --provajder=X   deepseek | anthropic (podrazumevano deepseek)
 *   --model=X       konkretan model; nadjačava --provajder
 *   --paralelno=N   koliko zahteva u letu (podrazumevano 6)
 *   --potvrdi       stvarno šalje zahteve i upisuje u bazu
 *   --ponovo        regeneriše i firme koje već imaju sažetak za ovaj presek
 *   --svejedno      dozvoljava rad u skupom (peak) prozoru kod DeepSeek-a
 */

const arg = (ime: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${ime}=`))?.split("=")[1];

const zastavica = (ime: string): boolean => process.argv.includes(`--${ime}`);

const POTVRDA = zastavica("potvrdi");
const PONOVO = zastavica("ponovo");
const SVEJEDNO = zastavica("svejedno");
const LIMIT = Number(arg("limit") ?? "0") || Number.POSITIVE_INFINITY;
const PARALELNO = Math.max(1, Number(arg("paralelno") ?? "6"));
const MAX_TOKENA = 400;
const STRANA = 1000;
/** Upis na svakih toliko sažetaka, da prekid ne poništi ceo prolaz. */
const UPIS_NA = 200;

type FinansijeRed = Finansije & {
  neto_dobitak: number | null;
  neto_gubitak: number | null;
  kapital: number | null;
  poslovna_imovina: number | null;
  gubitak: number | null;
  companies: Firma & { poslovno_ime_kratko: string | null };
};

type Rang = {
  maticni_broj: string;
  rang_delatnost: number | null;
  ukupno_delatnost: number | null;
  rang_opstina: number | null;
  ukupno_opstina: number | null;
};

type Db = ReturnType<typeof getSupabaseServerClient>;

function odrediModel(): string {
  const izricit = arg("model");
  if (izricit) return izricit;

  const provajder = (arg("provajder") ?? process.env.AI_PROVAJDER ?? "deepseek") as Provajder;
  if (provajder !== "deepseek" && provajder !== "anthropic") {
    throw new Error(`Nepoznat provajder "${provajder}". Dozvoljeno: deepseek, anthropic.`);
  }
  return process.env.AI_MODEL ?? podrazumevaniModel(provajder);
}

/** Poslednji presek iz `snapshots`; ne koristi se `lib/presek.ts` da skripta ne zavisi od Next keša. */
async function poslednjiPresek(db: Db): Promise<string> {
  const { data, error } = await db
    .from("snapshots")
    .select("datum_preseka")
    .order("datum_preseka", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Čitanje snapshots: ${error.message}`);
  if (!data?.datum_preseka) throw new Error("Nema nijednog preseka u tabeli snapshots.");
  return data.datum_preseka as string;
}

/**
 * Firme sa prihodom, opadajuće. Redosled nije kozmetika: `--limit` tako znači
 * "top N po prihodu", što je i strategija objavljivanja — prvo stranice koje
 * realno hvataju saobraćaj, pa tek onda rep.
 */
async function ucitajKandidate(db: Db, koliko: number): Promise<FinansijeRed[]> {
  const kolone =
    "maticni_broj,godina,ukupni_prihodi,neto_dobitak,neto_gubitak,kapital,poslovna_imovina,gubitak,prosecan_broj_zaposlenih," +
    "companies!inner(maticni_broj,slug,poslovno_ime,poslovno_ime_kratko,opstina,sifra_opstine,sifra_delatnosti,pravna_forma,status,status_aktivan,datum_osnivanja,pib)";

  const skup: FinansijeRed[] = [];

  for (let od = 0; skup.length < koliko; od += STRANA) {
    const { data, error } = await db
      .from("financials")
      .select(kolone)
      .gt("ukupni_prihodi", 0)
      .order("ukupni_prihodi", { ascending: false })
      .order("maticni_broj", { ascending: true })
      .range(od, od + STRANA - 1);

    if (error) throw new Error(`Čitanje financials: ${error.message}`);
    if (!data?.length) break;

    skup.push(...(data as unknown as FinansijeRed[]));
    if (data.length < STRANA) break;
  }

  return skup.slice(0, koliko === Number.POSITIVE_INFINITY ? undefined : koliko);
}

/**
 * Učitava redove samo za date matične brojeve, u komadima.
 *
 * Bez ovoga bi `--limit=20` povuklo svih 133.634 redova iz `mv_company_ranks`
 * kroz 134 zaokreta ka bazi, pa bi proba na 20 firmi trajala duže od samog
 * generisanja. Iznad praga se ipak isplati jedan sekvencijalni prolaz.
 */
const PRAG_ZA_IN = 5000;
const KOMAD = 500;

async function ucitajZaMaticne<T>(
  db: Db,
  tabela: string,
  kolone: string,
  maticniBrojevi: string[],
): Promise<T[]> {
  const skup: T[] = [];
  for (let i = 0; i < maticniBrojevi.length; i += KOMAD) {
    const { data, error } = await db
      .from(tabela)
      .select(kolone)
      .in("maticni_broj", maticniBrojevi.slice(i, i + KOMAD));

    if (error) throw new Error(`Čitanje ${tabela}: ${error.message}`);
    skup.push(...((data ?? []) as T[]));
  }
  return skup;
}

async function ucitajSve<T>(db: Db, tabela: string, kolone: string, poredak: string): Promise<T[]> {
  const skup: T[] = [];
  for (let od = 0; ; od += STRANA) {
    const { data, error } = await db
      .from(tabela)
      .select(kolone)
      .order(poredak, { ascending: true })
      .range(od, od + STRANA - 1);

    if (error) throw new Error(`Čitanje ${tabela}: ${error.message}`);
    if (!data?.length) break;
    skup.push(...(data as T[]));
    if (data.length < STRANA) break;
  }
  return skup;
}

function starostUGodinama(datumOsnivanja: string | null): number | null {
  if (!datumOsnivanja) return null;
  const osnovana = new Date(datumOsnivanja);
  if (Number.isNaN(osnovana.getTime())) return null;
  return Math.floor((Date.now() - osnovana.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function sklopiPodatke(
  red: FinansijeRed,
  stat: StatistikaDelatnosti | null,
  nazivDelatnosti: string | null,
  rang: Rang | null,
  datumPreseka: string,
): PodaciZaSazetak {
  const firma = red.companies;
  const p = izracunajPokazatelje(red, stat);
  const signali = izracunajSignale(firma, red, datumPreseka);

  return {
    ime: firma.poslovno_ime_kratko ?? firma.poslovno_ime,
    opstina: firma.opstina,
    sifraDelatnosti: firma.sifra_delatnosti,
    nazivDelatnosti,
    pravnaForma: firma.pravna_forma,
    status: firma.status,
    datumOsnivanja: firma.datum_osnivanja,
    starostGodina: starostUGodinama(firma.datum_osnivanja),

    godina: p.godina,
    prihodi: p.prihodi,
    netoRezultat: p.netoRezultat,
    kapital: p.kapital,
    imovina: p.imovina,
    zaposleni: p.zaposleni,

    prihodPoZaposlenom: p.prihodPoZaposlenom,
    netoMarza: p.netoMarza,
    medijanPrihodaDelatnosti: stat?.medijan_prihoda ?? null,
    medijanPrihodaPoZaposlenom: stat?.medijan_prihoda_po_zaposlenom ?? null,
    rangDelatnost: rang?.rang_delatnost ?? null,
    ukupnoDelatnost: rang?.ukupno_delatnost ?? null,
    rangOpstina: rang?.rang_opstina ?? null,
    ukupnoOpstina: rang?.ukupno_opstina ?? null,

    signali: signali.map((s) => s.naslov),
  };
}

/** Radnici uzimaju posao iz zajedničkog reda; brža firma ne čeka sporiju. */
async function uParaleli<T>(
  stavke: T[],
  koliko: number,
  posao: (stavka: T, indeks: number) => Promise<void>,
): Promise<void> {
  let sledeci = 0;
  const radnik = async () => {
    for (;;) {
      const i = sledeci++;
      if (i >= stavke.length) return;
      await posao(stavke[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(koliko, stavke.length) }, radnik));
}

async function glavna(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // U CI-ju vrednosti stižu iz secrets.
  }

  const nazivModela = odrediModel();
  const model = nadjiModel(nazivModela);
  const sada = new Date();

  console.log(`Model:     ${nazivModela} (${model.provajder})`);
  const cena = cenaSada(model, sada);
  console.log(
    `Tarifa:    ${model.cenaPeak ? (jePeak(sada) ? "PEAK" : "off-peak") : "jedinstvena"} — ` +
      `$${cena.ulaz}/1M ulaz, $${cena.izlaz}/1M izlaz`,
  );

  // Skupi prozor kod DeepSeek-a je duplo skuplji. Zaustavljanje je jeftinije
  // od objašnjavanja računa posle.
  if (POTVRDA && model.cenaPeak && jePeak(sada) && !SVEJEDNO) {
    const kraj = sledeciOffPeak(sada);
    throw new Error(
      `Sada je PEAK tarifa (duplo skuplja). Off-peak počinje u ${kraj.toISOString()} ` +
        `(${kraj.toLocaleTimeString("sr-RS", { timeZone: "Europe/Belgrade" })} po Beogradu).\n` +
        `Sačekaj, ili dodaj --svejedno ako ti je svejedno.`,
    );
  }

  const db = getSupabaseServerClient();
  const datumPreseka = await poslednjiPresek(db);
  console.log(`Presek:    ${datumPreseka}`);

  const kandidati = await ucitajKandidate(db, LIMIT);
  console.log(`Kandidata: ${kandidati.length} (firme sa prihodom, po prihodu opadajuće)`);

  // Šifarnici su mali (stotine redova) i uvek se čitaju celi. Rangovi i
  // postojeći sažetci se čitaju ciljano dok je skup mali.
  const mb = kandidati.map((k) => k.maticni_broj);
  const ciljano = mb.length <= PRAG_ZA_IN;
  const KOLONE_RANG = "maticni_broj,rang_delatnost,ukupno_delatnost,rang_opstina,ukupno_opstina";
  const KOLONE_SAZETAK = "maticni_broj,datum_preseka";

  const [statistike, naceKodovi, postojeci, rangovi] = await Promise.all([
    ucitajSve<StatistikaDelatnosti & { sifra_delatnosti: string }>(
      db,
      "mv_delatnost_stats",
      "sifra_delatnosti,medijan_prihoda,medijan_prihoda_po_zaposlenom,medijan_marze,broj_firmi,broj_sa_izvestajem",
      "sifra_delatnosti",
    ),
    ucitajSve<{ sifra: string; naziv: string }>(db, "nace_codes", "sifra,naziv", "sifra"),
    ciljano
      ? ucitajZaMaticne<{ maticni_broj: string; datum_preseka: string | null }>(
          db,
          "ai_summaries",
          KOLONE_SAZETAK,
          mb,
        )
      : ucitajSve<{ maticni_broj: string; datum_preseka: string | null }>(
          db,
          "ai_summaries",
          KOLONE_SAZETAK,
          "maticni_broj",
        ),
    ciljano
      ? ucitajZaMaticne<Rang>(db, "mv_company_ranks", KOLONE_RANG, mb)
      : ucitajSve<Rang>(db, "mv_company_ranks", KOLONE_RANG, "maticni_broj"),
  ]);

  const statPoSifri = new Map(statistike.map((s) => [s.sifra_delatnosti, s]));
  const nacePoSifri = new Map(naceKodovi.map((n) => [n.sifra, n.naziv]));
  const rangPoMb = new Map(rangovi.map((r) => [r.maticni_broj, r]));
  const vecImaju = new Set(
    postojeci.filter((s) => s.datum_preseka === datumPreseka).map((s) => s.maticni_broj),
  );

  // Priprema: sklapanje podataka i odbacivanje onoga što ne ide na API.
  type Posao = { maticniBroj: string; podaci: PodaciZaSazetak; prompt: string };
  const poslovi: Posao[] = [];
  let preskocenoVecImaju = 0;
  let preskocenoBezFinansija = 0;

  for (const red of kandidati) {
    if (!PONOVO && vecImaju.has(red.maticni_broj)) {
      preskocenoVecImaju++;
      continue;
    }

    const sifra = red.companies.sifra_delatnosti;
    const podaci = sklopiPodatke(
      red,
      sifra ? (statPoSifri.get(sifra) ?? null) : null,
      sifra ? (nacePoSifri.get(sifra) ?? null) : null,
      rangPoMb.get(red.maticni_broj) ?? null,
      datumPreseka,
    );

    if (!imaUpotrebljiveFinansije(podaci)) {
      preskocenoBezFinansija++;
      continue;
    }

    poslovi.push({ maticniBroj: red.maticni_broj, podaci, prompt: korisnickiPrompt(podaci) });
  }

  console.log(`Preskočeno: ${preskocenoVecImaju} već ima sažetak, ${preskocenoBezFinansija} bez finansija`);
  console.log(`Za obradu:  ${poslovi.length}`);

  if (poslovi.length === 0) {
    console.log("\nNema šta da se generiše.");
    return;
  }

  // Procena troška. Broj tokena se ne zna bez poziva, pa ide gruba procena po
  // znakovima; srpska latinica se troši lošije od engleskog, otud deljenik 3.
  const prosecnoZnakova =
    poslovi.reduce((zbir, p) => zbir + p.prompt.length, 0) / poslovi.length;
  const procenaUlaza = (SISTEMSKI_PROMPT.length + prosecnoZnakova) / 3;
  const procenaIzlaza = 260;
  const procena = trosak(model, procenaUlaza * poslovi.length, procenaIzlaza * poslovi.length, sada);

  console.log(
    `\nProcena:   ~${Math.round(procenaUlaza)} ulaznih i ~${procenaIzlaza} izlaznih tokena po firmi`,
  );
  console.log(`Trošak:    ~${formatUSD(procena)} za ${poslovi.length} firmi (procena, ±30%)`);

  if (!POTVRDA) {
    console.log("\nSuvi prolaz — nijedan zahtev nije poslat i ništa nije naplaćeno.");
    console.log("Za stvarno generisanje dodaj --potvrdi.");
    console.log("\nPrimer sklopljenog prompta (prva firma):\n");
    console.log("--- sistem ---");
    console.log(SISTEMSKI_PROMPT);
    console.log("\n--- korisnik ---");
    console.log(poslovi[0].prompt);
    return;
  }

  const klijent = await napraviKlijenta(nazivModela);
  const generisano: string = new Date().toISOString();

  let ukupanTrosak = 0;
  let ulazTokena = 0;
  let izlazTokena = 0;
  let uspesno = 0;
  const greske: string[] = [];
  let zaUpis: Record<string, unknown>[] = [];

  const upisi = async () => {
    if (!zaUpis.length) return;
    await upsertUBatchevima(db, "ai_summaries", zaUpis, "maticni_broj");
    zaUpis = [];
  };

  console.log(`\nGenerisanje, ${PARALELNO} paralelno...\n`);

  await uParaleli(poslovi, PARALELNO, async (posao) => {
    try {
      const odgovor = await klijent.posalji({
        sistem: SISTEMSKI_PROMPT,
        korisnik: posao.prompt,
        maxTokena: MAX_TOKENA,
      });

      ulazTokena += odgovor.ulazTokena;
      izlazTokena += odgovor.izlazTokena;
      ukupanTrosak += trosak(model, odgovor.ulazTokena, odgovor.izlazTokena, new Date());
      uspesno++;

      zaUpis.push({
        maticni_broj: posao.maticniBroj,
        datum_preseka: datumPreseka,
        summary: odgovor.tekst,
        model: nazivModela,
        generated_at: generisano,
      });

      if (zaUpis.length >= UPIS_NA) await upisi();

      if (uspesno % 25 === 0) {
        console.log(
          `  ${uspesno} / ${poslovi.length}  —  ${formatUSD(ukupanTrosak)} potrošeno`,
        );
      }
    } catch (greska) {
      greske.push(
        `${posao.maticniBroj}: ${greska instanceof Error ? greska.message : String(greska)}`,
      );
    }
  });

  await upisi();

  console.log(`\nGotovo.`);
  console.log(`Upisano:   ${uspesno} sažetaka`);
  console.log(`Grešaka:   ${greske.length}`);
  console.log(`Tokeni:    ${ulazTokena} ulaz, ${izlazTokena} izlaz`);
  console.log(`Trošak:    ${formatUSD(ukupanTrosak)}`);

  if (uspesno > 0) {
    const poFirmi = ukupanTrosak / uspesno;
    console.log(
      `\nStvarno po firmi: ${formatUSD(poFirmi)} → ceo set od 94.228 firmi sa finansijama ` +
        `bi bio ~${formatUSD(poFirmi * 94_228)} po ovoj tarifi.`,
    );
  }

  for (const greska of greske.slice(0, 10)) console.error(`  ${greska}`);
  if (greske.length > 10) console.error(`  ... i još ${greske.length - 10}`);
}

glavna().catch((greska) => {
  console.error("\n" + (greska instanceof Error ? greska.message : String(greska)));
  process.exit(1);
});
