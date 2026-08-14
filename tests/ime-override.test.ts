import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ručni izuzeci za skraćeno ime (scripts/data/ime-override.json).
 *
 * Spisak se dopunjuje rukom, pa test čuva pravila iz SEO.md §1.1: ključ je
 * matični broj, ime staje u 45 znakova i ne ponavlja se, jer bi dva ista H1
 * na dve stranice bila duplikat u SERP-u.
 */

const overrides: Record<string, string> = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/data/ime-override.json"), "utf8"),
);

describe("ime-override.json", () => {
  it("kljuc je osmocifreni maticni broj", () => {
    for (const mb of Object.keys(overrides)) {
      expect(mb).toMatch(/^\d{8}$/);
    }
  });

  it("nijedno ime ne prelazi 45 znakova", () => {
    const predugi = Object.entries(overrides).filter(([, ime]) => ime.length > 45);
    expect(predugi).toEqual([]);
  });

  it("nema praznih imena", () => {
    for (const ime of Object.values(overrides)) {
      expect(ime.trim().length).toBeGreaterThan(2);
    }
  });

  it("nema dva ista skracena imena", () => {
    const brojac = new Map<string, string[]>();
    for (const [mb, ime] of Object.entries(overrides)) {
      brojac.set(ime, [...(brojac.get(ime) ?? []), mb]);
    }
    const duplikati = [...brojac.entries()].filter(([, mbs]) => mbs.length > 1);
    expect(duplikati).toEqual([]);
  });

  it("ime ne pocinje opisnom recju iz punog naziva", () => {
    // Upravo to je greška koju izuzeci ispravljaju: "Srbije AD Novi Sad",
    // "Prirodnog Gasa Yugorosgaz AD Beograd", "Duvanskim DOO Beograd".
    const opisne = /^(srbije|prirodnog|duvanskim|hemijskih|nameštaja|softvera|konzervi|hleba|podova|metalima|autoputeva|unutrašnjoj|konfekcijom|sirovina|prodaja|vazdušni|naftom|derivata|guma|telekomunikacije)\b/i;
    const lose = Object.entries(overrides).filter(([, ime]) => opisne.test(ime));
    expect(lose).toEqual([]);
  });
});
