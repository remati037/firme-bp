import { describe, expect, it } from "vitest";
import { normalizeIme, parseDatum, slugify, trimMb } from "../lib/normalize";

describe("trimMb", () => {
  it("skida razmake sa oba kraja", () => {
    // 11.099 kljuceva u FI setu ima razmak na kraju
    expect(trimMb("21436046 ")).toBe("21436046");
    expect(trimMb("  21436046  ")).toBe("21436046");
  });

  it("vraca null za sve sto nije osam cifara", () => {
    expect(trimMb("")).toBeNull();
    expect(trimMb("   ")).toBeNull();
    expect(trimMb("1234567")).toBeNull();
    expect(trimMb("123456789")).toBeNull();
    expect(trimMb("1234567X")).toBeNull();
  });

  it("cuva vodece nule", () => {
    expect(trimMb("01234567")).toBe("01234567");
  });
});

describe("normalizeIme", () => {
  it("spusta na mala slova i skida interpunkciju", () => {
    expect(normalizeIme("LJUBA-PROMET DOO, KRUŠEVAC")).toBe("ljuba promet doo krusevac");
  });

  it("prevodi srpska slova u ascii", () => {
    expect(normalizeIme("ČAČAK ĆUPRIJA ŠABAC ŽITIŠTE ĐAKOVICA")).toBe(
      "cacak cuprija sabac zitiste djakovica",
    );
  });

  it("transliterise cirilicna imena", () => {
    expect(normalizeIme("ПРЕДУЗЕЋЕ ЉУБА")).toBe("preduzece ljuba");
  });

  it("sazima visestruke razmake", () => {
    expect(normalizeIme("A   B")).toBe("a b");
    expect(normalizeIme("  A  ")).toBe("a");
  });

  it("nikad ne vraca velika slova ni interpunkciju", () => {
    const rezultat = normalizeIme("D.O.O. \"TEST\" & CO., 2024!");
    expect(rezultat).toBe(rezultat.toLowerCase());
    expect(rezultat).toMatch(/^[a-z0-9 ]*$/);
  });
});

describe("slugify", () => {
  it("gradi slug od imena i maticnog broja", () => {
    expect(slugify("LJUBA-PROMET DOO", "17246771")).toBe("ljuba-promet-doo-17246771");
  });

  it("prevodi srpska slova u ascii", () => {
    expect(slugify("ČAČAK ĐAK", "12345678")).toBe("cacak-djak-12345678");
  });

  it("sazima visestruke crtice i skida ivicne", () => {
    expect(slugify("  --A -- B--  ", "12345678")).toBe("a-b-12345678");
  });

  it("skracuje osnovu na 80 znakova pre maticnog broja", () => {
    const dugacko = "A".repeat(200);
    const slug = slugify(dugacko, "12345678");
    const osnova = slug.slice(0, slug.lastIndexOf("-"));
    expect(osnova.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-12345678")).toBe(true);
  });

  it("ne ostavlja crticu na spoju posle skracivanja", () => {
    // 80. znak pada tacno na razmak, pa bi naivno secenje dalo dve crtice
    const ime = `${"A".repeat(80)} BBB`;
    expect(slugify(ime, "12345678")).not.toContain("--");
  });

  it("vraca samo maticni broj kad od imena ne ostane nista", () => {
    expect(slugify("!!!", "12345678")).toBe("12345678");
  });

  it("transliterise cirilicna imena umesto da ih obrise", () => {
    expect(slugify("ЉУБА ПРОМЕТ", "17246771")).toBe("ljuba-promet-17246771");
  });
});

describe("parseDatum", () => {
  it("prihvata ISO datum", () => {
    expect(parseDatum("1994-06-30")).toBe("1994-06-30");
  });

  it("odbija nepostojeci datum", () => {
    expect(parseDatum("2026-02-31")).toBeNull();
    expect(parseDatum("2026-13-01")).toBeNull();
  });

  it("odbija sve sto nije ISO string", () => {
    expect(parseDatum("30.06.1994")).toBeNull();
    expect(parseDatum(null)).toBeNull();
    expect(parseDatum(19940630)).toBeNull();
    expect(parseDatum("")).toBeNull();
  });
});
