import { describe, expect, it } from "vitest";
import {
  finansijeIzmenjene,
  firmaIzmenjena,
  mapirajFinansije,
  mapirajFirmu,
  type SirovaFirma,
  type SirovFi,
} from "../scripts/lib/map-apr";

const SIROVA: SirovaFirma = {
  PoslovnoIme: "TRGOVINSKO PREDUZEĆE LJUBA-PROMET DOO  KRUŠEVAC",
  SifraOpstine: "70670",
  NazivOpstine: "КРУШЕВАЦ",
  NazivStatus: "Активан",
  DatumOsnivanja: "1994-06-30",
  NazivPravneForme: "Друштво са ограниченом одговорношћу",
  SifraDelatnosti: "4532",
};

describe("mapirajFirmu", () => {
  it("mapira sva polja", () => {
    const red = mapirajFirmu("17246771", SIROVA, null);

    expect(red.maticni_broj).toBe("17246771");
    expect(red.poslovno_ime).toBe(SIROVA.PoslovnoIme); // original, netaknut
    expect(red.poslovno_ime_norm).toBe("trgovinsko preduzece ljuba promet doo krusevac");
    // Slug se izvodi iz skraćenog imena, ne iz punog: kraći URL i title koji staje.
    expect(red.poslovno_ime_kratko).toBe("Ljuba-Promet DOO Kruševac");
    expect(red.slug).toBe("ljuba-promet-doo-krusevac-17246771");
    expect(red.sifra_opstine).toBe("70670");
    expect(red.opstina).toBe("KRUŠEVAC");
    expect(red.status).toBe("Aktivan");
    expect(red.status_aktivan).toBe(true);
    expect(red.datum_osnivanja).toBe("1994-06-30");
    expect(red.pravna_forma).toBe("Društvo sa ograničenom odgovornošću");
    expect(red.sifra_delatnosti).toBe("4532");
  });

  it("zamrznuti slug se ne menja kad se ime promeni", () => {
    const red = mapirajFirmu("17246771", { ...SIROVA, PoslovnoIme: "NOVO IME" }, "stari-slug-17246771");
    expect(red.slug).toBe("stari-slug-17246771");
    expect(red.poslovno_ime).toBe("NOVO IME");
  });

  it("status_aktivan je tacan samo za Активан", () => {
    // sve cetiri vrednosti koje postoje u setu
    expect(mapirajFirmu("1", { ...SIROVA, NazivStatus: "Активан" }, null).status_aktivan).toBe(true);
    expect(mapirajFirmu("1", { ...SIROVA, NazivStatus: "У ликвидацији" }, null).status_aktivan).toBe(false);
    expect(mapirajFirmu("1", { ...SIROVA, NazivStatus: "У стечају" }, null).status_aktivan).toBe(false);
    expect(
      mapirajFirmu("1", { ...SIROVA, NazivStatus: "У принудној ликвидацији" }, null).status_aktivan,
    ).toBe(false);
  });

  it("cuva vodecu nulu u sifri delatnosti", () => {
    expect(mapirajFirmu("1", { ...SIROVA, SifraDelatnosti: "0161" }, null).sifra_delatnosti).toBe("0161");
  });

  it("prazna polja postaju null, ne prazan string", () => {
    const red = mapirajFirmu(
      "1",
      { ...SIROVA, SifraDelatnosti: "", SifraOpstine: "", DatumOsnivanja: "" },
      null,
    );
    expect(red.sifra_delatnosti).toBeNull();
    expect(red.sifra_opstine).toBeNull();
    expect(red.datum_osnivanja).toBeNull();
  });

  it("sifra opstine iz broja postaje string", () => {
    // u FI setu je broj, u companies setu string; mapper prima oba
    const red = mapirajFirmu("1", { ...SIROVA, SifraOpstine: 70670 as unknown as string }, null);
    expect(red.sifra_opstine).toBe("70670");
  });
});

const SIROV_FI: SirovFi = {
  GodinaFi: 2025,
  PoslovnoIme: "LJUBA-PROMET",
  SifraOpstine: 70670,
  NazivOpstine: "КРУШЕВАЦ",
  PoslovnaImovina: 41414,
  Kapital: 27920,
  Gubitak: 0,
  UkupniPrihodi: 38543,
  NetoDobitak: 1962,
  NetoGubitak: 0,
  ProsecanBrojZaposlenih: 2,
};

describe("mapirajFinansije", () => {
  it("prenosi vrednosti nepromenjene, u hiljadama dinara", () => {
    const red = mapirajFinansije("17246771", SIROV_FI);

    expect(red.maticni_broj).toBe("17246771");
    expect(red.godina).toBe(2025);
    expect(red.poslovna_imovina).toBe(41414); // bez mnozenja sa 1000
    expect(red.kapital).toBe(27920);
    expect(red.ukupni_prihodi).toBe(38543);
    expect(red.neto_dobitak).toBe(1962);
    expect(red.neto_gubitak).toBe(0);
    expect(red.prosecan_broj_zaposlenih).toBe(2);
  });

  it("cuva nule kakve jesu, jer ih UI tumaci kao nema podataka", () => {
    const prazan = mapirajFinansije("1", {
      ...SIROV_FI,
      PoslovnaImovina: 0, Kapital: 0, Gubitak: 0, UkupniPrihodi: 0,
      NetoDobitak: 0, NetoGubitak: 0, ProsecanBrojZaposlenih: 0,
    });
    expect(prazan.ukupni_prihodi).toBe(0);
    expect(prazan.kapital).toBe(0);
  });

  it("nula u svakom novcanom polju ne baca gresku", () => {
    expect(() =>
      mapirajFinansije("1", {
        ...SIROV_FI,
        PoslovnaImovina: 0,
        Kapital: 0,
        Gubitak: 0,
        UkupniPrihodi: 0,
        NetoDobitak: 0,
        NetoGubitak: 0,
        ProsecanBrojZaposlenih: 0,
      }),
    ).not.toThrow();
  });

  it("baca gresku kad je novcano polje null", () => {
    expect(() =>
      mapirajFinansije("1", { ...SIROV_FI, UkupniPrihodi: null as unknown as number }),
    ).toThrow(/UkupniPrihodi/);
  });

  it("baca gresku kad je novcano polje string", () => {
    expect(() =>
      mapirajFinansije("1", { ...SIROV_FI, Kapital: "27920" as unknown as number }),
    ).toThrow(/Kapital/);
  });

  it("baca grešku kad novčano polje nedostaje", () => {
    const bezPolja: Partial<SirovFi> = { ...SIROV_FI };
    delete bezPolja.PoslovnaImovina;
    expect(() => mapirajFinansije("1", bezPolja as SirovFi)).toThrow(/PoslovnaImovina/);
  });

  it("baca grešku kad GodinaFi nedostaje", () => {
    const bezGodine: Partial<SirovFi> = { ...SIROV_FI };
    delete bezGodine.GodinaFi;
    expect(() => mapirajFinansije("1", bezGodine as SirovFi)).toThrow(/GodinaFi/);
  });

  it("baca gresku kad GodinaFi nije ceo broj", () => {
    expect(() => mapirajFinansije("1", { ...SIROV_FI, GodinaFi: 2025.5 })).toThrow(/GodinaFi/);
  });

  it("baca gresku kad je GodinaFi van uverljivog opsega", () => {
    expect(() => mapirajFinansije("1", { ...SIROV_FI, GodinaFi: 1899 })).toThrow(/GodinaFi/);
    expect(() => mapirajFinansije("1", { ...SIROV_FI, GodinaFi: 3000 })).toThrow(/GodinaFi/);
  });
});

describe("detekcija izmena", () => {
  it("prepoznaje nepromenjenu firmu", () => {
    const a = mapirajFirmu("17246771", SIROVA, null);
    expect(firmaIzmenjena(a, { ...a })).toBe(false);
  });

  it("prepoznaje promenjeno ime", () => {
    const a = mapirajFirmu("17246771", SIROVA, null);
    const b = mapirajFirmu("17246771", { ...SIROVA, PoslovnoIme: "DRUGO" }, a.slug);
    expect(firmaIzmenjena(b, a)).toBe(true);
  });

  it("prepoznaje promenjene finansije", () => {
    const a = mapirajFinansije("1", SIROV_FI);
    const b = mapirajFinansije("1", { ...SIROV_FI, UkupniPrihodi: 99 });
    expect(finansijeIzmenjene(b, a)).toBe(true);
    expect(finansijeIzmenjene(a, { ...a })).toBe(false);
  });
});
