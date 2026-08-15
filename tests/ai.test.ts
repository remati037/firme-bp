import { describe, expect, it } from "vitest";

import {
  cenaSada,
  jePeak,
  nadjiModel,
  sledeciOffPeak,
  trosak,
  MODELI,
} from "../scripts/lib/ai/modeli";
import {
  imaUpotrebljiveFinansije,
  korisnickiPrompt,
  SISTEMSKI_PROMPT,
  type PodaciZaSazetak,
} from "../scripts/lib/ai/prompt";

const utc = (sat: number, minut = 0): Date =>
  new Date(Date.UTC(2026, 7, 20, sat, minut, 0));

describe("tarifni prozori", () => {
  // Peak je 01:00-04:00 i 06:00-10:00 UTC; sve ostalo je jeftinije.
  it.each([
    [0, false],
    [1, true],
    [3, true],
    [4, false],
    [5, false],
    [6, true],
    [9, true],
    [10, false],
    [16, false],
    [23, false],
  ])("sat %i UTC → peak=%s", (sat, ocekivano) => {
    expect(jePeak(utc(sat))) .toBe(ocekivano);
  });

  it("granice su zatvorene odozdo, otvorene odozgo", () => {
    expect(jePeak(utc(0, 59))).toBe(false);
    expect(jePeak(utc(1, 0))).toBe(true);
    expect(jePeak(utc(3, 59))).toBe(true);
    expect(jePeak(utc(4, 0))).toBe(false);
  });

  it("sledeci off-peak je kraj tekuceg peak prozora", () => {
    expect(sledeciOffPeak(utc(2)).getUTCHours()).toBe(4);
    expect(sledeciOffPeak(utc(7, 30)).getUTCHours()).toBe(10);
  });

  it("van peak-a se vreme ne pomera", () => {
    const kada = utc(15);
    expect(sledeciOffPeak(kada)).toBe(kada);
  });
});

describe("cena i trosak", () => {
  it("DeepSeek u peak-u kosta duplo", () => {
    const model = nadjiModel("deepseek-v4-flash");
    expect(cenaSada(model, utc(15))).toEqual({ ulaz: 0.22, izlaz: 0.66 });
    expect(cenaSada(model, utc(2))).toEqual({ ulaz: 0.44, izlaz: 1.32 });
  });

  it("Anthropic nema tarifne prozore", () => {
    const model = nadjiModel("claude-haiku-4-5");
    expect(cenaSada(model, utc(2))).toEqual(cenaSada(model, utc(15)));
  });

  it("milion ulaznih tokena kosta tacno cenu ulaza", () => {
    const model = nadjiModel("deepseek-v4-flash");
    expect(trosak(model, 1_000_000, 0, utc(15))).toBeCloseTo(0.22, 6);
    expect(trosak(model, 0, 1_000_000, utc(15))).toBeCloseTo(0.66, 6);
  });

  it("DeepSeek je jeftiniji od najjeftinijeg Claude modela", () => {
    const ds = nadjiModel("deepseek-v4-flash");
    const claude = nadjiModel("claude-haiku-4-5");
    expect(trosak(ds, 400, 260, utc(15))).toBeLessThan(trosak(claude, 400, 260, utc(15)));
  });

  it("nepoznat model puca sa spiskom dostupnih", () => {
    expect(() => nadjiModel("gpt-4")).toThrow(/Nepoznat model/);
  });
});

describe("sistemski prompt", () => {
  // CLAUDE.md: sav AI izlaz je srpski, latinica. Prompt koji sam sadrzi
  // cirilicu je najbrzi nacin da model pocne da odgovara cirilicom.
  it("ne sadrzi nijedno cirilicno slovo", () => {
    const cirilica = SISTEMSKI_PROMPT.match(/[Ѐ-ӿ]/g);
    expect(cirilica).toBeNull();
  });

  it("prenosi zabrane iz CLAUDE.md", () => {
    expect(SISTEMSKI_PROMPT).toMatch(/latinica/i);
    expect(SISTEMSKI_PROMPT).toMatch(/bonitet/i);
    expect(SISTEMSKI_PROMPT).toMatch(/imena ljudi/i);
  });
});

const osnovni: PodaciZaSazetak = {
  ime: "Test DOO",
  opstina: "Novi Sad",
  sifraDelatnosti: "4690",
  nazivDelatnosti: "Nespecijalizovana trgovina",
  pravnaForma: "Društvo sa ograničenom odgovornošću",
  status: "Aktivno privredno društvo",
  datumOsnivanja: "2010-05-01",
  starostGodina: 16,
  godina: 2025,
  prihodi: 120_000_000,
  netoRezultat: 5_000_000,
  kapital: 40_000_000,
  imovina: 90_000_000,
  zaposleni: 25,
  prihodPoZaposlenom: 4_800_000,
  netoMarza: 4.2,
  medijanPrihodaDelatnosti: 30_000_000,
  medijanPrihodaPoZaposlenom: 3_000_000,
  rangDelatnost: 12,
  ukupnoDelatnost: 900,
  rangOpstina: 40,
  ukupnoOpstina: 5000,
  signali: [],
};

describe("korisnicki prompt", () => {
  it("upisuje popunjena polja", () => {
    const tekst = korisnickiPrompt(osnovni);
    expect(tekst).toContain("firma: Test DOO");
    expect(tekst).toContain("rang po prihodu u delatnosti: 12 od 900");
  });

  it("izostavlja prazna polja umesto da pise 'nema podatka'", () => {
    const tekst = korisnickiPrompt({ ...osnovni, kapital: null, zaposleni: null });
    expect(tekst).not.toContain("nema podatka");
    expect(tekst).not.toContain("kapital:");
    expect(tekst).not.toContain("zaposleni:");
  });

  // Vrednosti u bazi su u HILJADAMA dinara (CLAUDE.md, normalizacija tačka 5).
  // Prva verzija ovog modula je formatirala sirovo, pa je EPS-u davala 479
  // miliona umesto 479 milijardi prihoda. Model bi to preneo na 133k stranica.
  it("novac je u dinarima, ne u hiljadama", () => {
    const tekst = korisnickiPrompt({ ...osnovni, prihodi: 479_623_523 });
    expect(tekst).toContain("prihodi: 479.623.523.000 RSD");
    expect(tekst).not.toContain("prihodi: 479.623.523 RSD");
  });

  it("zaposleni se ne mnoze sa 1000", () => {
    expect(korisnickiPrompt({ ...osnovni, zaposleni: 18_825 })).toContain("zaposleni: 18.825");
  });

  it("signali ulaze samo kad postoje", () => {
    expect(korisnickiPrompt(osnovni)).not.toContain("signali:");
    expect(korisnickiPrompt({ ...osnovni, signali: ["Negativan kapital"] })).toContain(
      "signali: Negativan kapital",
    );
  });
});

describe("filter firmi bez finansija", () => {
  it("firma sa prihodom ide na API", () => {
    expect(imaUpotrebljiveFinansije(osnovni)).toBe(true);
  });

  // 39.406 firmi bez upotrebljivih finansija ne sme da ode na API: za njih
  // CLAUDE.md propisuje fiksnu recenicu, pa je poziv cist gubitak novca.
  it("prazna i nula firma se preskace", () => {
    const prazna = {
      ...osnovni,
      prihodi: null,
      netoRezultat: null,
      kapital: null,
      imovina: null,
      zaposleni: null,
    };
    expect(imaUpotrebljiveFinansije(prazna)).toBe(false);
    expect(
      imaUpotrebljiveFinansije({
        ...prazna,
        prihodi: 0,
        netoRezultat: 0,
        kapital: 0,
        imovina: 0,
        zaposleni: 0,
      }),
    ).toBe(false);
  });
});

describe("registar modela", () => {
  it("svi modeli imaju cenu i pripadaju poznatom provajderu", () => {
    for (const [naziv, model] of Object.entries(MODELI)) {
      expect(model.cena.ulaz, naziv).toBeGreaterThan(0);
      expect(model.cena.izlaz, naziv).toBeGreaterThan(0);
      expect(["deepseek", "anthropic"], naziv).toContain(model.provajder);
      // Peak tarifa, kad postoji, mora da bude skuplja od off-peak.
      if (model.cenaPeak) {
        expect(model.cenaPeak.ulaz, naziv).toBeGreaterThan(model.cena.ulaz);
        expect(model.cenaPeak.izlaz, naziv).toBeGreaterThan(model.cena.izlaz);
      }
    }
  });
});
