import { describe, expect, it } from "vitest";
import { normalizujPismo, skratiIme } from "../lib/skrati-ime";

/**
 * Svi ulazi su stvarna poslovna imena iz APR seta, presek 2026-07-31.
 * Većina je regresija: svako od njih je u nekom trenutku bilo pogrešno skraćeno.
 */

describe("normalizujPismo", () => {
  it("transliteriše ime pisano ćirilicom", () => {
    expect(normalizujPismo("КРСТОНОШИЋ ДОО ВОГАЊ")).toBe("KRSTONOŠIĆ DOO VOGANJ");
  });

  it("čuva digraf na kraju velike reči", () => {
    expect(normalizujPismo("ЖАБАЉ")).toBe("ŽABALJ");
  });

  it("popravlja ćirilične homoglife u latiničnom imenu", () => {
    // Ćirilično К usred latinice. 3.025 firmi meša pisma, često baš u
    // pravnoj formi, pa bez ovoga regex za DOO promaši.
    expect(normalizujPismo("HEMOFARM AКCIONARSKO DRUŠTVO")).toBe("HEMOFARM AKCIONARSKO DRUŠTVO");
  });

  it("ne dira čisto latinično ime", () => {
    expect(normalizujPismo("INTERFOOD DOO, LOZNICA")).toBe("INTERFOOD DOO, LOZNICA");
  });
});

describe("skratiIme, jezgro", () => {
  it("uzima jezgro tik ispred pravne forme", () => {
    expect(
      skratiIme(
        "PREDUZEĆE ZA ZAVRŠNE RADOVE U GRAĐEVINARSTVU, INŽENJERING I KONSALTING IZOMONT DOO BEOGRAD",
        "VOŽDOVAC",
      ).kratko,
    ).toBe("Izomont DOO Beograd");
  });

  it("uzima jezgro iza pravne forme kad ispred nje stoji samo opis", () => {
    const r = skratiIme(
      "DRUŠTVO SA OGRANIČENOM ODGOVORNOŠĆU ATERA PLUS ZA SPOLJNU I UNUTRAŠNJU TRGOVINU BEOGRAD",
      "BEOGRAD",
    );
    expect(r.kratko).toBe("Atera Plus DOO Beograd");
    expect(r.zastavica).toBe("posle-forme");
  });

  it("uzima naziv sa početka kad je jedina nađena reč bila ime grada", () => {
    // Ranije je ovo ispadalo kao doslovno "N/A Beograd", dakle slug n-a-{MB}.
    const r = skratiIme(
      "TRIOPROJEKT DRUŠTVO ZA PROJEKTOVANJE, INŽENJERING I INFORMATIKU SA OGRANIČENOM ODGOVORNOŠĆU BEOGRAD",
      "BEOGRAD",
    );
    expect(r.kratko).toBe("Trioprojekt Beograd");
    expect(r.zastavica).toBe("FALLBACK");
  });

  it("nikad ne vraća doslovno n/a", () => {
    for (const ime of [
      "PREDUZEĆE ZA PROMET I USLUGE BEOGRAD",
      "DRUŠTVO ZA TRGOVINU BEOGRAD",
      "USLUGE BEOGRAD",
    ]) {
      expect(skratiIme(ime, "BEOGRAD").kratko).not.toMatch(/^n\/a/i);
    }
  });

  it("skida oznaku stečaja i likvidacije", () => {
    expect(skratiIme("STOVARIŠTE TARA DOO, KREMNA - U LIKVIDACIJI", "UŽICE").kratko).toBe(
      "Stovarište Tara DOO Užice",
    );
  });
});

describe("skratiIme, grad", () => {
  it("sklapa beogradske opštine u Beograd", () => {
    // 44,3% firmi je u beogradskim opštinama. "Vračar" umesto "Beograd"
    // pogadja oko 55.000 stranica.
    expect(skratiIme("SERRA DOO BEOGRAD-ZEMUN", "ZEMUN").kratko).toBe("Serra DOO Beograd");
    expect(skratiIme("INVEKON GRADNJA DOO BEOGRAD", "VRAČAR").kratko).toBe(
      "Invekon Gradnja DOO Beograd",
    );
  });

  it("ne sklapa prigradske opštine u Beograd", () => {
    expect(skratiIme("COMMUNIQ MULTIMEDIA DOO OBRENOVAC", "OBRENOVAC").kratko).toBe(
      "Communiq Multimedia DOO Obrenovac",
    );
  });

  it("skida zagradu iz naziva opštine", () => {
    expect(skratiIme("SHOCK CARDS DOO BEOGRAD", "PALILULA (BEOGRAD)").kratko).toBe(
      "Shock Cards DOO Beograd",
    );
  });

  it("ne duplira grad koji već stoji u imenu", () => {
    expect(skratiIme("FLEX TRADE DOO BEOGRAD", "BEOGRAD").kratko).toBe("Flex Trade DOO Beograd");
  });
});

describe("skratiIme, oblik izlaza", () => {
  it("pravnu formu zadruge i javnog preduzeća piše ispred imena", () => {
    expect(skratiIme("ZEMLJORADNIČKA ZADRUGA AGROKORDUN, KRUPANJ", "KRUPANJ").kratko).toBe(
      "ZZ Agrokordun Krupanj",
    );
  });

  it("nikad ne prelazi zadatu granicu", () => {
    const dugacko = `PREDUZEĆE ZA TRGOVINU ${"NEPREKIDNO ".repeat(20)}DOO BEOGRAD`;
    expect(skratiIme(dugacko, "BEOGRAD").kratko.length).toBeLessThanOrEqual(45);
  });

  it("podnosi prazan ulaz", () => {
    expect(skratiIme("", "BEOGRAD").kratko).toBe("");
    expect(skratiIme("   ", "").kratko).toBe("");
  });

  it("radi i bez zadate opštine", () => {
    expect(skratiIme("INTERFOOD DOO, LOZNICA").kratko).toBe("Interfood DOO");
  });
});
