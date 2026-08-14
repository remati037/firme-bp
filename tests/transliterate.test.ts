import { describe, expect, it } from "vitest";
import { cirilicaULatinicu } from "../lib/transliterate";

describe("cirilicaULatinicu", () => {
  it("prevodi osnovna slova", () => {
    expect(cirilicaULatinicu("КРУШЕВАЦ")).toBe("KRUŠEVAC");
    expect(cirilicaULatinicu("Београд")).toBe("Beograd");
  });

  it("prevodi sva srpska specifična slova", () => {
    expect(cirilicaULatinicu("ђжћчш")).toBe("đžćčš");
    expect(cirilicaULatinicu("ЂЖЋЧШ")).toBe("ĐŽĆČŠ");
  });

  it("digrafe piše velikim slovima kad je cela reč velikim", () => {
    expect(cirilicaULatinicu("ЉУБОВИЈА")).toBe("LJUBOVIJA");
    expect(cirilicaULatinicu("ЊЕГОШ")).toBe("NJEGOŠ");
    expect(cirilicaULatinicu("ЏАМИЈА")).toBe("DŽAMIJA");
  });

  it("digrafe piše sa malim drugim slovom kad sledi malo slovo", () => {
    expect(cirilicaULatinicu("Љубовија")).toBe("Ljubovija");
    expect(cirilicaULatinicu("Његош")).toBe("Njegoš");
  });

  it("digrafe na kraju velike reči piše velikim", () => {
    // Četiri stvarne opštine iz APR seta. Gledanje samo sledećeg znaka
    // dalo bi ŽABALj, jer posle Љ stoji kraj stringa, a ne veliko slovo.
    expect(cirilicaULatinicu("ЖАБАЉ")).toBe("ŽABALJ");
    expect(cirilicaULatinicu("КРУПАЊ")).toBe("KRUPANJ");
    expect(cirilicaULatinicu("РАЖАЊ")).toBe("RAŽANJ");
    expect(cirilicaULatinicu("СЕЧАЊ")).toBe("SEČANJ");
    expect(cirilicaULatinicu("ДОО КОДЕКС ЖАБАЉ")).toBe("DOO KODEKS ŽABALJ");
  });

  it("ostavlja latinicu, cifre i interpunkciju netaknute", () => {
    expect(cirilicaULatinicu("DOO Beograd-2024")).toBe("DOO Beograd-2024");
    expect(cirilicaULatinicu("МЕШАНО doo")).toBe("MEŠANO doo");
  });

  it("podnosi prazan ulaz", () => {
    expect(cirilicaULatinicu("")).toBe("");
  });

});
