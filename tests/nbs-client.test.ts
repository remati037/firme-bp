import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ekstrahujPodatke,
  ekstrahujPibIzRir,
  imaBlokadu,
  parsirajDatum,
  parsirajIznos,
} from "../scripts/lib/nbs-client";

const FIKSTURA = (ime: string): string =>
  readFileSync(path.join(__dirname, "fixtures", ime), "utf8");

describe("parsirajIznos", () => {
  it("parsira srpski format sa tačkama i zarezom", () => {
    expect(parsirajIznos("6.331.452.428,75")).toBe(6331452428.75);
  });

  it("parsira ceo broj bez decimala", () => {
    expect(parsirajIznos("1.234")).toBe(1234);
  });

  it("vraća null za prazno i za nulu", () => {
    expect(parsirajIznos("")).toBeNull();
    expect(parsirajIznos("0")).toBeNull();
    expect(parsirajIznos("0,00")).toBeNull();
  });
});

describe("parsirajDatum", () => {
  it("parsira dd.MM.yyyy. u ISO", () => {
    expect(parsirajDatum("26.11.2025.")).toBe("2025-11-26");
    expect(parsirajDatum("13.10.2022.")).toBe("2022-10-13");
  });

  it("vraća null za nevalidne datume", () => {
    expect(parsirajDatum("32.13.2025.")).toBeNull();
    expect(parsirajDatum("nema")).toBeNull();
  });
});

describe("ekstrahujPodatke — firma sa blokadom", () => {
  const podaci = ekstrahujPodatke(FIKSTURA("nbs-blokada.html"));

  it("čita PIB, adresu-indiferentno i iznos", () => {
    expect(podaci.pib).toBe("111975510");
    expect(podaci.iznos).toBe(6331452428.75);
  });

  it("čita ukupno dana blokade iz perioda", () => {
    expect(podaci.ukupnoDana).toBe(1035);
  });

  it("čita zabranu prenosa (tekuću blokadu)", () => {
    expect(podaci.zabranaPrenosa).toBe("2025-11-26");
  });

  it("čita periode blokade, uključujući tekući bez datuma do", () => {
    expect(podaci.periodi.length).toBeGreaterThan(0);
    expect(podaci.periodi[0]).toEqual({ od: "2022-10-13", do: "2022-10-17", dana: 4 });
    const poslednji = podaci.periodi[podaci.periodi.length - 1];
    expect(poslednji.od).toBe("2024-04-26");
    expect(poslednji.do).toBeNull();
    expect(poslednji.dana).toBe(841);
  });

  it("imaBlokadu vraća true", () => {
    expect(imaBlokadu(podaci)).toBe(true);
  });
});

describe("ekstrahujPodatke — firma bez blokade", () => {
  const podaci = ekstrahujPodatke(FIKSTURA("nbs-bez-blokade.html"));

  it("čita PIB i nema blokadu", () => {
    expect(podaci.pib).toBe("101674224");
    expect(podaci.iznos).toBeNull();
    expect(podaci.ukupnoDana).toBeNull();
    expect(podaci.zabranaPrenosa).toBeNull();
    expect(podaci.periodi).toEqual([]);
  });

  it("imaBlokadu vraća false", () => {
    expect(imaBlokadu(podaci)).toBe(false);
  });
});

describe("ekstrahujPibIzRir", () => {
  it("čita PIB iz tabele računa (NITES)", () => {
    expect(ekstrahujPibIzRir(FIKSTURA("nbs-rir.html"))).toBe("103133748");
  });

  it("vraća null za odgovor bez tabele računa", () => {
    expect(ekstrahujPibIzRir("<html><body>nema podataka</body></html>")).toBeNull();
  });
});
