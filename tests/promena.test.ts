import { describe, expect, it } from "vitest";

import { formatEUR, formatNovac, kompaktnoIzDinara } from "../lib/format";
import { izracunajPromene, type RedIstorije } from "../lib/promena";

const red = (
  datum: string,
  godina: number,
  prihodi: number | null,
  dobitak = 0,
  zaposleni: number | null = 100,
): RedIstorije => ({
  datum_preseka: datum,
  godina,
  ukupni_prihodi: prihodi,
  neto_dobitak: dobitak,
  neto_gubitak: 0,
  prosecan_broj_zaposlenih: zaposleni,
});

describe("izracunajPromene (D1)", () => {
  it("jedan presek nema sa cim da se poredi", () => {
    expect(izracunajPromene([red("2026-07-31", 2025, 1000)])).toBeNull();
    expect(izracunajPromene([])).toBeNull();
  });

  it("racuna procenat izmedju dva preseka za ISTU godinu", () => {
    const p = izracunajPromene([
      red("2026-07-31", 2025, 1060, 200, 110),
      red("2026-06-30", 2025, 1000, 100, 100),
    ]);

    expect(p?.prethodniPresek).toBe("2026-06-30");
    expect(p?.godina).toBe(2025);
    expect(p?.prihodi?.procenat).toBeCloseTo(6, 5);
    expect(p?.prihodi?.smer).toBe("gore");
    expect(p?.netoRezultat?.procenat).toBeCloseTo(100, 5);
    expect(p?.zaposleni?.procenat).toBeCloseTo(10, 5);
  });

  it("pad daje negativan procenat i smer dole", () => {
    const p = izracunajPromene([
      red("2026-07-31", 2025, 800),
      red("2026-06-30", 2025, 1000),
    ]);
    expect(p?.prihodi?.procenat).toBeCloseTo(-20, 5);
    expect(p?.prihodi?.smer).toBe("dole");
  });

  it("ne poredi razlicite godine izvestaja", () => {
    // Smena godine bi inace izgledala kao ogroman rast ili pad.
    const p = izracunajPromene([
      red("2026-07-31", 2025, 5000),
      red("2026-06-30", 2024, 1000),
    ]);
    expect(p).toBeNull();
  });

  it("rast sa nule nema procenat, ali ima razliku", () => {
    const p = izracunajPromene([
      red("2026-07-31", 2025, 500),
      red("2026-06-30", 2025, 0),
    ]);
    expect(p?.prihodi?.procenat).toBeNull();
    expect(p?.prihodi?.razlika).toBe(500);
  });

  it("uzima dva NAJNOVIJA preseka, ne bilo koja dva", () => {
    const p = izracunajPromene([
      red("2026-05-31", 2025, 100),
      red("2026-07-31", 2025, 300),
      red("2026-06-30", 2025, 200),
    ]);
    expect(p?.prethodniPresek).toBe("2026-06-30");
    expect(p?.prihodi?.procenat).toBeCloseTo(50, 5);
  });

  it("isti broj daje smer isto", () => {
    const p = izracunajPromene([
      red("2026-07-31", 2025, 1000),
      red("2026-06-30", 2025, 1000),
    ]);
    expect(p?.prihodi?.smer).toBe("isto");
    expect(p?.prihodi?.procenat).toBe(0);
  });
});

describe("valuta (Dodatak C)", () => {
  it("EUR se racuna iz dinara po staticnom kursu", () => {
    // 117,0 je podrazumevani kurs; menja se uz mesecni presek.
    expect(formatEUR(117_000)).toBe("1.000,00 EUR");
  });

  it("formatNovac postuje trazenu valutu", () => {
    expect(formatNovac(1_170_000, "RSD")).toBe("1.170.000 RSD");
    expect(formatNovac(1_170_000, "EUR")).toBe("10.000,00 EUR");
  });

  it("kompaktan zapis radi u obe valute", () => {
    expect(kompaktnoIzDinara(238_431_000_000, "RSD")).toBe("238,4 mrd RSD");
    expect(kompaktnoIzDinara(238_431_000_000, "EUR")).toBe("2,0 mrd EUR");
  });

  it("nula i null ostaju bez podatka", () => {
    expect(formatNovac(0, "EUR")).toBe("Nema podataka");
    expect(formatNovac(null, "EUR")).toBe("Nema podataka");
  });
});
