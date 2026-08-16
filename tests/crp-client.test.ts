import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ekstrahujDetaljeMere, ekstrahujMereIzPretrage, parsirajDatum } from "../scripts/lib/crp-client";

const FIKSTURA = (ime: string): string =>
  readFileSync(path.join(__dirname, "fixtures", ime), "utf8");

describe("crp-client", () => {
  it("parsira datum '28.04.2026 00:00:00'", () => {
    expect(parsirajDatum("28.04.2026 00:00:00")).toBe("2026-04-28");
    expect(parsirajDatum("nema")).toBeNull();
  });

  it("iz pretrage izvlači mere sa referencom i id-em", () => {
    const mere = ekstrahujMereIzPretrage(FIKSTURA("crp-pretraga.html"));
    expect(mere.length).toBeGreaterThan(0);
    expect(mere[0].referenca).toMatch(/^CEPOP-APR-/);
    expect(mere[0].izvorId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("iz detalja izvlači vrstu, šifru, početak i izbrisanost", () => {
    const d = ekstrahujDetaljeMere(FIKSTURA("crp-detalji.html"));
    expect(d.vrsta).toContain("[5]");
    expect(d.sifra).toContain("5UPA1");
    expect(d.pocetakVazenja).toBe("2026-04-28");
    expect(d.izbrisana).toBe(true);
    expect(d.opis).toBeTruthy();
  });
});
