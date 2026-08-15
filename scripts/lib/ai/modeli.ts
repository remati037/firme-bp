/**
 * Registar AI modela sa cenama i tarifnim prozorima.
 *
 * Postoje DVA provajdera i biraju se u trenutku pokretanja, ne u kodu
 * (`--provajder` / `--model`, ili `AI_PROVAJDER` / `AI_MODEL`). Razlog je
 * cena: DeepSeek je oko 3x jeftiniji od najjeftinijeg Claude modela, ali je
 * kvalitet srpske latinice neproveren, pa mora da postoji povratak na Claude
 * bez ijedne izmene koda.
 *
 * Cene su USD po milionu tokena, stanje 15.08.2026, proverene na
 * api-docs.deepseek.com/quick_start/pricing i platform.claude.com/docs/en/pricing.
 *
 * DeepSeek je 16.08.2026. u 16:00 UTC uveo peak/off-peak tarife. To je bilo
 * POSKUPLJENJE: pre toga je flash bio ravnih $0.14 / $0.28, sada je off-peak
 * $0.22 / $0.66, a peak duplo od toga. Ovde su upisane nove cene, jer svaki
 * budući prolaz ide po njima; za prolaz pre tog datuma procena je konzervativna
 * (precenjuje trošak), što je bezbedan smer greške.
 *
 * Anthropic nema tarifne prozore — cena je ista 24 sata.
 */

export type Provajder = "deepseek" | "anthropic";

export type Cena = {
  /** USD po milionu ulaznih tokena. */
  ulaz: number;
  /** USD po milionu izlaznih tokena. */
  izlaz: number;
};

export type Model = {
  provajder: Provajder;
  /** Off-peak, odnosno jedina cena kod provajdera bez tarifnih prozora. */
  cena: Cena;
  /** Samo DeepSeek. Kad nedostaje, cena je ista ceo dan. */
  cenaPeak?: Cena;
  /** Gornja granica izlaza koju model prihvata. */
  maxIzlaz: number;
};

export const MODELI: Record<string, Model> = {
  // --- DeepSeek (OpenAI-kompatibilan endpoint) ---
  "deepseek-v4-flash": {
    provajder: "deepseek",
    cena: { ulaz: 0.22, izlaz: 0.66 },
    cenaPeak: { ulaz: 0.44, izlaz: 1.32 },
    maxIzlaz: 8192,
  },
  "deepseek-v4-pro": {
    provajder: "deepseek",
    cena: { ulaz: 0.66, izlaz: 1.98 },
    cenaPeak: { ulaz: 1.32, izlaz: 3.96 },
    maxIzlaz: 8192,
  },

  // --- Anthropic ---
  // CLAUDE.md traži najjeftiniji dostupan model; Haiku 4.5 je to u Claude
  // porodici. Sonnet je tu za slučaj da se kvalitet srpskog pokaže kao problem.
  "claude-haiku-4-5": {
    provajder: "anthropic",
    cena: { ulaz: 1.0, izlaz: 5.0 },
    maxIzlaz: 8192,
  },
  "claude-sonnet-5": {
    provajder: "anthropic",
    cena: { ulaz: 3.0, izlaz: 15.0 },
    maxIzlaz: 8192,
  },
};

export const PODRAZUMEVANI_MODEL: Record<Provajder, string> = {
  deepseek: "deepseek-v4-flash",
  anthropic: "claude-haiku-4-5",
};

/**
 * DeepSeek peak prozori u UTC satima, [od, do). Sve van njih je off-peak,
 * dakle 17 od 24 sata. U beogradskoj letnjoj zoni (UTC+2) to je 03–06h i
 * 08–12h ujutru.
 */
const PEAK_PROZORI: readonly (readonly [number, number])[] = [
  [1, 4],
  [6, 10],
];

export function jePeak(kada: Date): boolean {
  const sat = kada.getUTCHours();
  return PEAK_PROZORI.some(([od, do_]) => sat >= od && sat < do_);
}

/**
 * Prvi trenutak posle `kada` kada tarifa postaje off-peak.
 * Kad je već off-peak, vraća `kada` nepromenjeno.
 */
export function sledeciOffPeak(kada: Date): Date {
  const sat = kada.getUTCHours();
  const prozor = PEAK_PROZORI.find(([od, do_]) => sat >= od && sat < do_);
  if (!prozor) return kada;

  const kraj = new Date(kada);
  kraj.setUTCHours(prozor[1], 0, 0, 0);
  return kraj;
}

export function nadjiModel(naziv: string): Model {
  const model = MODELI[naziv];
  if (!model) {
    throw new Error(
      `Nepoznat model "${naziv}". Dostupni: ${Object.keys(MODELI).join(", ")}.`,
    );
  }
  return model;
}

/** Cena koja važi u datom trenutku, uzimajući u obzir tarifni prozor. */
export function cenaSada(model: Model, kada: Date): Cena {
  return model.cenaPeak && jePeak(kada) ? model.cenaPeak : model.cena;
}

/** Trošak jednog poziva u USD. */
export function trosak(model: Model, ulazTokena: number, izlazTokena: number, kada: Date): number {
  const cena = cenaSada(model, kada);
  return (ulazTokena / 1_000_000) * cena.ulaz + (izlazTokena / 1_000_000) * cena.izlaz;
}

export function formatUSD(iznos: number): string {
  return `$${iznos.toFixed(2)}`;
}
