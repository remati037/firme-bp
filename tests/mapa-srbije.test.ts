import { describe, expect, it } from "vitest";

import {
  agregirajPoOkrugu,
  KOSOVO_ISO,
  kvantilBucket,
  okrugIsoIzSifre,
  OKRUG_NAZIVI,
  OPSTINA_OKRUG_ISO,
} from "../lib/mapa-srbije";

describe("okrugIsoIzSifre", () => {
  it("mapira poznatu opštinu na okrug", () => {
    expect(okrugIsoIzSifre("70106")).toBe("RS-00"); // Voždovac → Grad Beograd
    expect(okrugIsoIzSifre("80438")).toBe("RS-01"); // Subotica → Severnobački
    expect(okrugIsoIzSifre("70939")).toBe("RS-22"); // Pirot → Pirotski
    expect(okrugIsoIzSifre("90263")).toBe(KOSOVO_ISO); // Priština → Kosovo
  });

  it("vraća null za nepoznatu šifru", () => {
    expect(okrugIsoIzSifre("00000")).toBeNull();
  });
});

describe("OPSTINA_OKRUG_ISO", () => {
  it("pokriva sve šifre koje APR koristi (192 opštine)", () => {
    // 170 opština Srbije + 22 opštine Kosova i Metohije = 192.
    const kljucevi = Object.keys(OPSTINA_OKRUG_ISO);
    expect(kljucevi).toHaveLength(192);
    const kosovo = kljucevi.filter((s) => OPSTINA_OKRUG_ISO[s] === KOSOVO_ISO);
    expect(kosovo).toHaveLength(22);
  });

  it("nazivi okruga postoje za svaki ISO iz mape", () => {
    const isoi = new Set(Object.values(OPSTINA_OKRUG_ISO));
    for (const iso of isoi) {
      expect(OKRUG_NAZIVI[iso], `nedostaje naziv za ${iso}`).toBeTruthy();
    }
  });
});

describe("agregirajPoOkrugu", () => {
  const opstine = [
    { sifra: "70106", naziv_lat: "VOŽDOVAC" }, // RS-00
    { sifra: "70114", naziv_lat: "VRAČAR" }, // RS-00
    { sifra: "80438", naziv_lat: "SUBOTICA" }, // RS-01
    { sifra: "90263", naziv_lat: "PRIŠTINA" }, // XK
    { sifra: "99999", naziv_lat: "NEPOZNATA" }, // van mape
  ];
  const stat = [
    { sifra_opstine: "70106", broj_firmi: 100, ukupan_prihod: 1000, ukupno_zaposlenih: 10 },
    { sifra_opstine: "70114", broj_firmi: 50, ukupan_prihod: 500, ukupno_zaposlenih: 5 },
    { sifra_opstine: "80438", broj_firmi: 30, ukupan_prihod: 300, ukupno_zaposlenih: 3 },
    { sifra_opstine: "90263", broj_firmi: 7, ukupan_prihod: 70, ukupno_zaposlenih: 0 },
  ];

  it("sabira opštine po okrugu", () => {
    const { okruzi } = agregirajPoOkrugu(opstine, stat);
    const beograd = okruzi.find((o) => o.iso === "RS-00");
    expect(beograd).toMatchObject({ brojFirmi: 150, ukupanPrihod: 1500, zaposleni: 15, brojOpstina: 2 });
    const severnoBacki = okruzi.find((o) => o.iso === "RS-01");
    expect(severnoBacki).toMatchObject({ brojFirmi: 30, brojOpstina: 1 });
  });

  it("izdvaja Kosovo zasebno i preskače nepoznate šifre", () => {
    const { okruzi, kosovo } = agregirajPoOkrugu(opstine, stat);
    expect(okruzi).toHaveLength(2);
    expect(kosovo).toMatchObject({ brojFirmi: 7, brojOpstina: 1 });
    expect(kosovo?.iso).toBe(KOSOVO_ISO);
  });
});

describe("kvantilBucket", () => {
  const vrednosti = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it("najmanja vrednost je u bucketu 0, najveća u poslednjem", () => {
    expect(kvantilBucket(vrednosti, 10)).toBe(0);
    expect(kvantilBucket(vrednosti, 100)).toBe(4);
  });

  it("nula i negativne vrednosti su u bucketu 0", () => {
    expect(kvantilBucket(vrednosti, 0)).toBe(0);
    expect(kvantilBucket(vrednosti, -5)).toBe(0);
  });

  it("bucket raste sa vrednošću", () => {
    expect(kvantilBucket(vrednosti, 25)).toBeLessThanOrEqual(kvantilBucket(vrednosti, 75));
  });
});
