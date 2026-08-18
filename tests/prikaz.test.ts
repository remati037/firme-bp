import { describe, expect, it } from "vitest";

import { cirilicniOblik, latinicaUCirilicu } from "../lib/cirilica";
import { imeOpstine, kratkoIme, nazivDelatnosti, skratiUKodu, slugOpstine, vrstaStatusa } from "../lib/prikaz";
import { izracunajSignale, porukaBezSignala } from "../lib/signali";
import type { Finansije, Firma, Zabrana } from "../lib/queries";

const FIRMA: Firma = {
  maticni_broj: "20012345",
  slug: "primer-doo-beograd-20012345",
  poslovno_ime: "PRIMER DOO BEOGRAD",
  sifra_opstine: "70246",
  opstina: "STARI GRAD",
  status: "Aktivan",
  status_aktivan: true,
  datum_osnivanja: "2010-05-20",
  pravna_forma: "Društvo s ograničenom odgovornošću",
  sifra_delatnosti: "4690",
  pib: null,
  adresa: null,
};

const FI: Finansije = {
  maticni_broj: "20012345",
  godina: 2025,
  poslovna_imovina: 10_000,
  kapital: 5_000,
  gubitak: 0,
  ukupni_prihodi: 20_000,
  neto_dobitak: 1_000,
  neto_gubitak: 0,
  prosecan_broj_zaposlenih: 12,
};

describe("kratkoIme", () => {
  it("koristi kolonu iz baze kad postoji", () => {
    expect(
      kratkoIme({
        poslovno_ime: "PREDUZEĆE ZA SPOLJNU I UNUTRAŠNJU TRGOVINU NELT CO. DOO DOBANOVCI",
        poslovno_ime_kratko: "Nelt Co. DOO Beograd",
      }),
    ).toBe("Nelt Co. DOO Beograd");
  });

  it("fallback u kodu kad kolone nema", () => {
    const rez = kratkoIme({ poslovno_ime: "PRIMER DOO BEOGRAD" });
    expect(rez).toBe("Primer DOO Beograd");
  });

  it("nikad ne vraca prazan string za neprazno ime", () => {
    expect(kratkoIme({ poslovno_ime: "X", poslovno_ime_kratko: "  " })).toBe("X");
  });
});

describe("skratiUKodu", () => {
  it("sece na granici reci, najvise 45 znakova", () => {
    const dugo =
      "PREDUZEĆE ZA PROIZVODNJU I DISTRIBUCIJU ELEKTRIČNE ENERGIJE I OPREME BEOGRAD";
    const rez = skratiUKodu(dugo);
    expect(rez.length).toBeLessThanOrEqual(45);
    expect(rez.endsWith(" ")).toBe(false);
    // Ne sme da preseče reč na pola
    expect(dugo.toLowerCase()).toContain(rez.split(" ").pop()!.toLowerCase());
  });

  it("cuva akronime i oznake pravne forme", () => {
    // titleCase (lib/skrati-ime.ts) drzi velikim skracenice bez samoglasnika
    // i poznate oznake forme; ostalo ide u Title Case.
    expect(skratiUKodu("MK GROUP DOO BEOGRAD")).toBe("MK Group DOO Beograd");
  });
});

describe("imeOpstine, nazivDelatnosti, slugOpstine", () => {
  it("opstina iz velikih slova u citljiv oblik", () => {
    expect(imeOpstine("NOVI SAD")).toBe("Novi Sad");
    expect(imeOpstine(null)).toBe("");
  });

  it("delatnost spaja sifru i naziv", () => {
    expect(nazivDelatnosti("4690", "Trgovina na veliko")).toBe("4690 · Trgovina na veliko");
    expect(nazivDelatnosti("4690", null)).toBe("4690");
  });

  it("slug opstine je ascii", () => {
    expect(slugOpstine("NOVI SAD")).toBe("novi-sad");
    expect(slugOpstine("ČAČAK")).toBe("cacak");
    expect(slugOpstine("PALILULA (BEOGRAD)")).toBe("palilula-beograd");
  });
});

describe("vrstaStatusa", () => {
  it("prepoznaje stecaj, likvidaciju i aktivan status", () => {
    expect(vrstaStatusa("U stečaju", false)).toBe("stecaj");
    expect(vrstaStatusa("U prinudnoj likvidaciji", false)).toBe("likvidacija");
    expect(vrstaStatusa("Aktivan", true)).toBe("aktivan");
    expect(vrstaStatusa("Brisan", false)).toBe("neutralno");
  });
});

describe("latinicaUCirilicu", () => {
  it("digrafi idu pre pojedinacnih slova", () => {
    expect(latinicaUCirilicu("Njegoš")).toBe("Његош");
    expect(latinicaUCirilicu("LJUBA DOO")).toBe("ЉУБА ДОО");
    expect(latinicaUCirilicu("Džemper")).toBe("Џемпер");
  });

  it("srpska slova", () => {
    expect(latinicaUCirilicu("Čačak Ćuprija Šabac Žitište Đakovica")).toBe(
      "Чачак Ћуприја Шабац Житиште Ђаковица",
    );
  });

  it("ime koje je vec cirilicno se ne dira", () => {
    const original = "Акционарско друштво Електропривреда Србије";
    expect(cirilicniOblik(original)).toBe(original);
  });
});

describe("izracunajSignale", () => {
  it("aktivna firma sa pozitivnim kapitalom nema signale", () => {
    expect(izracunajSignale(FIRMA, FI, "2026-07-31")).toHaveLength(0);
    expect(porukaBezSignala(FI).tezina).toBe("ok");
  });

  it("negativan kapital je kriticni signal sa brojem u tekstu", () => {
    const signali = izracunajSignale(FIRMA, { ...FI, kapital: -4_120_000 }, "2026-07-31");
    expect(signali[0].tezina).toBe("crit");
    expect(signali[0].tekst).toContain("-4.120.000.000 RSD");
  });

  it("gubitak veci od kapitala", () => {
    const signali = izracunajSignale(
      FIRMA,
      { ...FI, kapital: 1_000, neto_dobitak: 0, neto_gubitak: 5_000 },
      "2026-07-31",
    );
    expect(signali.some((s) => s.naslov === "Gubitak veći od kapitala")).toBe(true);
  });

  it("nula prihoda uz zaposlene", () => {
    const signali = izracunajSignale(FIRMA, { ...FI, ukupni_prihodi: 0 }, "2026-07-31");
    expect(signali.some((s) => s.naslov.startsWith("Nula prihoda"))).toBe(true);
  });

  it("stecaj je kriticniji od likvidacije", () => {
    const stecaj = izracunajSignale(
      { ...FIRMA, status: "U stečaju", status_aktivan: false },
      FI,
      "2026-07-31",
    );
    const likvidacija = izracunajSignale(
      { ...FIRMA, status: "U likvidaciji", status_aktivan: false },
      FI,
      "2026-07-31",
    );
    expect(stecaj[0].tezina).toBe("crit");
    expect(likvidacija[0].tezina).toBe("warn");
  });

  it("starost se meri na datum preseka, ne na danas", () => {
    const mlada = izracunajSignale({ ...FIRMA, datum_osnivanja: "2026-03-01" }, FI, "2026-07-31");
    expect(mlada.some((s) => s.naslov.includes("mlađa od godinu dana"))).toBe(true);

    const stara = izracunajSignale({ ...FIRMA, datum_osnivanja: "2026-03-01" }, FI, "2028-07-31");
    expect(stara.some((s) => s.naslov.includes("mlađa od godinu dana"))).toBe(false);
  });

  it("bez blokade nema blokada signala", () => {
    expect(izracunajSignale(FIRMA, FI, "2026-07-31", null)).toHaveLength(0);
    expect(izracunajSignale(FIRMA, FI, "2026-07-31", undefined)).toHaveLength(0);
  });

  it("aktivna blokada (zabrana prenosa) je kriticni signal sa iznosom", () => {
    const signali = izracunajSignale(FIRMA, FI, "2026-07-31", {
      maticni_broj: FIRMA.maticni_broj,
      iznos: 4_002_853_969.26,
      ukupno_dana: 1503,
      zabrana_prenosa: "2026-05-19",
      periodi: null,
      provereno_at: null,
    });
    const aktivna = signali.find((s) => s.naslov === "Aktivna blokada računa");
    expect(aktivna?.tezina).toBe("crit");
    expect(aktivna?.tekst).toContain("19.05.2026.");
    expect(aktivna?.tekst).toContain("4.002.853.969 RSD");
  });

  it("istorija blokade bez tekuće zabrane je upozorenje", () => {
    const signali = izracunajSignale(FIRMA, FI, "2026-07-31", {
      maticni_broj: FIRMA.maticni_broj,
      iznos: 2_328_096_299.99,
      ukupno_dana: 5135,
      zabrana_prenosa: null,
      periodi: null,
      provereno_at: null,
    });
    const istorija = signali.find((s) => s.naslov === "Blokada u poslednjih pet godina");
    expect(istorija?.tezina).toBe("warn");
    expect(istorija?.tekst).toContain("5.135");
    expect(signali.some((s) => s.naslov === "Aktivna blokada računa")).toBe(false);
  });

  const MERA = (del: Partial<Zabrana>): Zabrana => ({
    id: 1,
    maticni_broj: FIRMA.maticni_broj,
    izvor_id: "abc",
    referenca: "CEPOP-APR-1-TRINTD-2/2026",
    vrsta: "[5] Мера изречена на основу прописа којима се уређује порески поступак и пореска администрација",
    sifra: "[5UPA1] Порески акт из člana 29. ZPPA",
    pocetak_vazenja: "2026-04-28",
    izbrisana: true,
    opis: null,
    provereno_at: null,
    ...del,
  });

  it("aktivna mera (izbrisana nije true) je kritični signal", () => {
    const signali = izracunajSignale(FIRMA, FI, "2026-07-31", null, [MERA({ izbrisana: null })]);
    const aktivna = signali.find((s) => s.naslov === "Aktivno privremeno ograničenje prava");
    expect(aktivna?.tezina).toBe("crit");
    expect(aktivna?.tekst).toContain("poreska mera");
    expect(aktivna?.tekst).toContain("28.04.2026.");
  });

  it("samo istorijske (izbrisane) mere daju upozorenje", () => {
    const signali = izracunajSignale(FIRMA, FI, "2026-07-31", null, [MERA({}), MERA({ id: 2, izvor_id: "def" })]);
    const istorija = signali.find((s) => s.naslov === "Privremena ograničenja u evidenciji");
    expect(istorija?.tezina).toBe("warn");
    expect(istorija?.tekst).toContain("2");
    expect(signali.some((s) => s.naslov === "Aktivno privremeno ograničenje prava")).toBe(false);
  });

  it("bez mera nema zabrana signala", () => {
    expect(izracunajSignale(FIRMA, FI, "2026-07-31", null, [])).toHaveLength(0);
    expect(izracunajSignale(FIRMA, FI, "2026-07-31", null, undefined)).toHaveLength(0);
  });
});
