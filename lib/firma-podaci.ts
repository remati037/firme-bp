/**
 * Učitavanje svih podataka za stranicu firme.
 *
 * Radi isključivo na serveru: materijalizovani view-ovi i tabela `snapshots`
 * nisu izloženi Data API-ju za `anon` (migracija 001), pa se čitaju service
 * role ključem. Stranica je server komponenta sa ISR-om, ključ nikad ne ide
 * u pregledač.
 *
 * Upiti idu u tri talasa, svaki talas paralelno (`Promise.all`):
 *   1. firma (iz nje se zna šifra delatnosti, opština i matični broj)
 *   2. finansije, rang, AI sažetak, presek, naziv delatnosti, opština
 *   3. slične firme (traže prihod iz talasa 2) i njihovi podaci
 *
 * Jedan RPC upit (SEO.md §6) se uvodi tek ako merenje pokaže p95 TTFB preko
 * 500 ms na hladan ISR — i tek uz odobrenje vlasnika, jer je migracija.
 */

import { ucitajDatumPreseka } from "./presek";
import { izracunajPromene, type Promene } from "./promena";
import { getSupabaseServerClient } from "./supabase";
import {
  upitAiSazetak,
  upitBlokada,
  upitFinansije,
  upitFirmePoMaticnimBrojevima,
  upitIstorijaFirme,
  upitNaceKod,
  upitOpstina,
  upitRangFirme,
  upitSlicneFirmePoPrihodu,
  upitStatistikaDelatnosti,
  upitStatistikaOpstine,
  upitZabrane,
  type AiSazetak,
  type Blokada,
  type Finansije,
  type Firma,
  type KarticaFirme,
  type NaceKod,
  type Opstina,
  type RangFirme,
  type StatistikaDelatnosti,
  type StatistikaOpstine,
  type Zabrana,
} from "./queries";

/** Firma iz baze, prošireno kolonom iz migracije 003. */
export type FirmaRed = Firma & { poslovno_ime_kratko?: string | null };

/** Slična firma je isti oblik kao red u kategorijskoj listi. */
export type SlicnaFirma = KarticaFirme;

/**
 * Rang firme po prihodu. Vrednosti dolaze direktno iz `mv_company_ranks`;
 * migracija 004 je ispravila `nulls last`, pa view daje tačan rang i nema
 * više nikakve korekcije u kodu.
 */
export type Rangovi = {
  delatnost: number | null;
  ukupnoDelatnost: number | null;
  opstina: number | null;
  ukupnoOpstina: number | null;
  izViewa: RangFirme | null;
};

export type PodaciFirme = {
  firma: FirmaRed;
  finansije: Finansije[];
  poslednjaFinansija: Finansije | null;
  rang: Rangovi;
  statDelatnosti: StatistikaDelatnosti | null;
  statOpstine: StatistikaOpstine | null;
  nace: NaceKod | null;
  opstinaRed: Opstina | null;
  aiSazetak: AiSazetak | null;
  datumPreseka: string;
  /** Blokada računa iz NBS registra dužnika (migracija 006); null ako je nema. */
  blokada: Blokada | null;
  /** Privremena ograničenja prava iz APR evidencije (migracija 007); prazno ako ih nema. */
  zabrane: Zabrana[];
  /** Promena u odnosu na prethodni mesečni presek; null dok postoji samo jedan. */
  promene: Promene | null;
  slicneDelatnost: SlicnaFirma[];
  slicneOpstina: SlicnaFirma[];
};

const KOLONE_SA_KRATKIM =
  "maticni_broj,slug,poslovno_ime,poslovno_ime_kratko,sifra_opstine,opstina,status,status_aktivan,datum_osnivanja,pravna_forma,sifra_delatnosti,pib";

/**
 * Matični broj je poslednji segment sluga (SEO.md §1.3).
 * Vraća null ako slug nije u očekivanom obliku — tada ide 404, nikad 200.
 */
export function maticniBrojIzSluga(slug: string): string | null {
  const poslednji = slug.split("-").pop() ?? "";
  return /^\d{8}$/.test(poslednji) ? poslednji : null;
}

export async function ucitajFirmu(slug: string): Promise<PodaciFirme | null> {
  const maticniBroj = maticniBrojIzSluga(slug);
  if (!maticniBroj) return null;

  const db = getSupabaseServerClient();

  // Talas 1: bez firme nema ni jednog drugog upita.
  const { data: firma } = await db
    .from("companies")
    .select(KOLONE_SA_KRATKIM)
    .eq("maticni_broj", maticniBroj)
    .returns<FirmaRed[]>()
    .maybeSingle();

  if (!firma) return null;

  // Talas 2.
  const [
    finansije,
    rang,
    aiSazetak,
    datumPreseka,
    nace,
    opstinaRed,
    statDelatnosti,
    statOpstine,
    istorija,
    blokada,
    zabrane,
  ] = await Promise.all([
      upitFinansije(db, maticniBroj),
      upitRangFirme(db, maticniBroj),
      upitAiSazetak(db, maticniBroj),
      ucitajDatumPreseka(),
      firma.sifra_delatnosti ? upitNaceKod(db, firma.sifra_delatnosti) : Promise.resolve(null),
      firma.sifra_opstine ? upitOpstina(db, firma.sifra_opstine) : Promise.resolve(null),
      firma.sifra_delatnosti
        ? upitStatistikaDelatnosti(db, firma.sifra_delatnosti)
        : Promise.resolve(null),
      firma.sifra_opstine ? upitStatistikaOpstine(db, firma.sifra_opstine) : Promise.resolve(null),
      upitIstorijaFirme(db, maticniBroj),
      upitBlokada(db, maticniBroj),
      upitZabrane(db, maticniBroj),
    ]);

  const redovi = finansije.data ?? [];
  const poslednja = redovi[0] ?? null;
  const prihod = rang.data?.ukupni_prihodi ?? poslednja?.ukupni_prihodi ?? null;
  const statD = statDelatnosti?.data ?? null;
  const statO = statOpstine?.data ?? null;

  // Talas 3: slične firme po najbližem prihodu, iznad i ispod (SEO.md §2.1).
  // Firma bez prihoda nema "najbliži prihod", pa se poredi oko medijane svoje
  // grupe — inače bi joj se kao "slične" ponudile mikro firme sa 2.000 RSD
  // prihoda, što nikome ne pomaže (SEO.md §1.4 traži korisne slične firme).
  const slicne = await ucitajSlicne(db, {
    maticniBroj,
    osnovicaDelatnost: prihod ?? statD?.medijan_prihoda ?? 0,
    osnovicaOpstina: prihod ?? statO?.medijan_prihoda ?? 0,
    sifraDelatnosti: firma.sifra_delatnosti,
    sifraOpstine: firma.sifra_opstine,
  });

  return {
    firma,
    finansije: redovi,
    poslednjaFinansija: poslednja,
    rang: {
      delatnost: rang.data?.rang_delatnost ?? null,
      ukupnoDelatnost: rang.data?.ukupno_delatnost ?? statD?.broj_sa_izvestajem ?? null,
      opstina: rang.data?.rang_opstina ?? null,
      ukupnoOpstina: rang.data?.ukupno_opstina ?? statO?.broj_sa_izvestajem ?? null,
      izViewa: rang.data ?? null,
    },
    statDelatnosti: statD,
    statOpstine: statO,
    nace: nace?.data ?? null,
    opstinaRed: opstinaRed?.data ?? null,
    aiSazetak: aiSazetak.data ?? null,
    datumPreseka,
    blokada: blokada.data ?? null,
    zabrane: zabrane.data ?? [],
    promene: izracunajPromene(istorija.data ?? []),
    slicneDelatnost: slicne.delatnost,
    slicneOpstina: slicne.opstina,
  };
}

type Db = ReturnType<typeof getSupabaseServerClient>;

async function ucitajSlicne(
  db: Db,
  {
    maticniBroj,
    osnovicaDelatnost,
    osnovicaOpstina,
    sifraDelatnosti,
    sifraOpstine,
  }: {
    maticniBroj: string;
    osnovicaDelatnost: number;
    osnovicaOpstina: number;
    sifraDelatnosti: string | null;
    sifraOpstine: string | null;
  },
): Promise<{ delatnost: SlicnaFirma[]; opstina: SlicnaFirma[] }> {
  const trazi = (grupa: "delatnost" | "opstina", iznad: boolean) =>
    upitSlicneFirmePoPrihodu(db, {
      sifraDelatnosti: grupa === "delatnost" ? (sifraDelatnosti ?? undefined) : undefined,
      sifraOpstine: grupa === "opstina" ? (sifraOpstine ?? undefined) : undefined,
      prihod: grupa === "delatnost" ? osnovicaDelatnost : osnovicaOpstina,
      izuzmiMaticniBroj: maticniBroj,
      iznad,
      limit: 3,
    });

  const [dIznad, dIspod, oIznad, oIspod] = await Promise.all([
    sifraDelatnosti ? trazi("delatnost", true) : Promise.resolve(null),
    sifraDelatnosti ? trazi("delatnost", false) : Promise.resolve(null),
    sifraOpstine ? trazi("opstina", true) : Promise.resolve(null),
    sifraOpstine ? trazi("opstina", false) : Promise.resolve(null),
  ]);

  const izDelatnosti = spoji(dIznad?.data ?? [], dIspod?.data ?? []);
  const izOpstine = spoji(oIznad?.data ?? [], oIspod?.data ?? []).filter(
    (r) => !izDelatnosti.some((d) => d.maticni_broj === r.maticni_broj),
  );

  const sviMb = [...izDelatnosti, ...izOpstine].map((r) => r.maticni_broj);
  if (sviMb.length === 0) return { delatnost: [], opstina: [] };

  const [firme, fi] = await Promise.all([
    upitFirmePoMaticnimBrojevima(db, sviMb),
    db
      .from("financials")
      .select("maticni_broj,godina,ukupni_prihodi,prosecan_broj_zaposlenih")
      .in("maticni_broj", sviMb)
      .returns<Finansije[]>(),
  ]);

  const poMb = new Map((firme.data ?? []).map((f) => [f.maticni_broj, f]));
  const fiPoMb = new Map((fi.data ?? []).map((f) => [f.maticni_broj, f]));

  const sklopi = (redovi: RangFirme[]): SlicnaFirma[] =>
    redovi
      .map((r) => {
        const f = poMb.get(r.maticni_broj);
        if (!f) return null;
        const finansija = fiPoMb.get(r.maticni_broj);
        return {
          slug: f.slug,
          maticni_broj: f.maticni_broj,
          ime: f.poslovno_ime,
          imeKratko: f.poslovno_ime_kratko ?? null,
          opstina: f.opstina,
          status: f.status,
          status_aktivan: f.status_aktivan,
          ukupni_prihodi: r.ukupni_prihodi ?? finansija?.ukupni_prihodi ?? null,
          zaposleni: finansija?.prosecan_broj_zaposlenih ?? null,
          godina: r.godina ?? finansija?.godina ?? null,
        } satisfies SlicnaFirma;
      })
      .filter((r): r is SlicnaFirma => r !== null);

  return { delatnost: sklopi(izDelatnosti), opstina: sklopi(izOpstine) };
}

/**
 * Spaja firme iznad i ispod datog prihoda u tri najbliža suseda.
 * Prvo po jedna sa svake strane, pa se popunjava onim čega ima.
 */
function spoji(iznad: RangFirme[], ispod: RangFirme[], koliko = 3): RangFirme[] {
  const rezultat: RangFirme[] = [];
  for (let i = 0; rezultat.length < koliko && (i < iznad.length || i < ispod.length); i++) {
    if (ispod[i]) rezultat.push(ispod[i]);
    if (rezultat.length < koliko && iznad[i]) rezultat.push(iznad[i]);
  }
  return rezultat.slice(0, koliko);
}
