import { describe, expect, it } from "vitest";

import { narativ } from "../lib/narrative";
import { izracunajPokazatelje, pozicijaNaTraci } from "../lib/pokazatelji";
import type { Finansije, StatistikaDelatnosti } from "../lib/queries";

const FI: Finansije = {
  maticni_broj: "20012345",
  godina: 2025,
  poslovna_imovina: 586_910_000,
  kapital: 410_220_000,
  gubitak: 0,
  ukupni_prihodi: 238_431_000, // hiljada dinara
  neto_dobitak: 12_845_000,
  neto_gubitak: 0,
  prosecan_broj_zaposlenih: 11_522,
};

const STAT: StatistikaDelatnosti = {
  sifra_delatnosti: "4690",
  godina: 2025,
  broj_firmi: 2847,
  broj_aktivnih: 2600,
  broj_sa_izvestajem: 2100,
  medijan_prihoda: 15_450,
  medijan_marze: 3.2,
  medijan_prihoda_po_zaposlenom: 15_450,
};

const ULAZ = {
  ime: "NIS a.d. Novi Sad",
  godina: 2025,
  sifraDelatnosti: "4690",
  nazivDelatnosti: "Trgovina na veliko",
  medijanPrihodaPoZaposlenom: STAT.medijan_prihoda_po_zaposlenom,
  medijanPrihoda: STAT.medijan_prihoda,
  brojFirmiUDelatnosti: STAT.broj_firmi,
  rangDelatnost: 5,
  ukupnoDelatnost: 2847,
  rangOpstina: 1,
  ukupnoOpstina: 14_203,
  opstina: "Novi Sad",
};

describe("narativ, firma sa finansijama", () => {
  const recenice = narativ({ ...ULAZ, pokazatelji: izracunajPokazatelje(FI, STAT) });

  it("prva recenica ima prihod, zaposlene i prihod po zaposlenom", () => {
    // 238.431.000 hiljada = 238.431.000.000 RSD
    expect(recenice[0]).toContain("238.431.000.000 RSD");
    expect(recenice[0]).toContain("11.522");
    expect(recenice[0]).toContain("po zaposlenom");
  });

  it("svaka recenica je samostalna: ima ime firme ili jasan subjekat", () => {
    for (const r of recenice) {
      expect(r.length).toBeGreaterThan(20);
      expect(r.endsWith(".")).toBe(true);
      expect(/firma|Firma|To je|U istoj godini/.test(r)).toBe(true);
    }
  });

  it("poredjenje sa medijanom navodi sifru delatnosti i vrednost medijane", () => {
    const poredjenje = recenice.find((r) => r.includes("medijane delatnosti"));
    expect(poredjenje).toBeDefined();
    expect(poredjenje).toContain("4690");
    expect(poredjenje).toContain("15.450.000 RSD");
    expect(poredjenje).toContain("iznad");
  });

  it("rang navodi i delatnost i opstinu", () => {
    const rang = recenice.find((r) => r.includes("Po ukupnom prihodu"));
    expect(rang).toContain("5. u delatnosti 4690");
    expect(rang).toContain("1. u opštini Novi Sad");
  });

  it("genitiv uz broj firmi u rangu", () => {
    const jedna = narativ({
      ...ULAZ,
      ukupnoDelatnost: 1,
      pokazatelji: izracunajPokazatelje(FI, STAT),
    });
    expect(jedna.join(" ")).toContain("od 1 firme sa izveštajem");

    const rang = recenice.find((r) => r.includes("Po ukupnom prihodu"));
    expect(rang).toContain("od 2.847 firmi sa izveštajem");
  });

  it("nijedna recenica ne sadrzi NaN ni undefined", () => {
    for (const r of recenice) {
      expect(r).not.toMatch(/NaN|undefined|null/);
    }
  });
});

describe("narativ, firma bez finansija", () => {
  const recenice = narativ({
    ...ULAZ,
    ime: "Asya Gradnja DOO Beograd",
    pokazatelji: izracunajPokazatelje(null, STAT),
  });

  it("kaze da izvestaj nije predat i daje kontekst delatnosti", () => {
    expect(recenice[0]).toContain("nije predala finansijski izveštaj");
    expect(recenice.join(" ")).toContain("2.847 firmi");
    expect(recenice.join(" ")).toContain("15.450.000 RSD");
  });

  it("ne izmislja brojeve o samoj firmi", () => {
    expect(recenice.join(" ")).not.toMatch(/po zaposlenom|neto dobitak|Po ukupnom prihodu/);
  });
});

describe("izracunajPokazatelje", () => {
  const p = izracunajPokazatelje(FI, STAT);

  it("prihod po zaposlenom i marza", () => {
    expect(Math.round(p.prihodPoZaposlenom ?? 0)).toBe(20_694);
    expect(p.netoMarza).toBeCloseTo(5.39, 1);
    expect(p.kapitalPremaImovini).toBeCloseTo(69.9, 1);
  });

  it("nula i null ne proizvode broj", () => {
    const prazno = izracunajPokazatelje(
      { ...FI, ukupni_prihodi: 0, prosecan_broj_zaposlenih: 0 },
      STAT,
    );
    expect(prazno.prihodi).toBeNull();
    expect(prazno.prihodPoZaposlenom).toBeNull();
    expect(prazno.netoMarza).toBeNull();
  });

  it("odstupanje od medijane je u procentima", () => {
    // 20.694 / 15.450 = 1,34 -> +34 odsto
    expect(Math.round(p.odstupanjePrihodaPoZaposlenom ?? 0)).toBe(34);
  });
});

describe("pozicijaNaTraci", () => {
  it("medijana je sredina trake", () => {
    expect(pozicijaNaTraci(0)).toBe(50);
  });

  it("dvostruko iznad medijane je na 75", () => {
    expect(pozicijaNaTraci(100)).toBe(75);
  });

  it("ostaje u granicama trake", () => {
    expect(pozicijaNaTraci(100_000)).toBeLessThanOrEqual(97);
    expect(pozicijaNaTraci(-99)).toBeGreaterThanOrEqual(3);
    expect(pozicijaNaTraci(null)).toBeNull();
  });
});
