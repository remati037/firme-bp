import { describe, expect, it } from "vitest";
import { cirilicaULatinicu } from "../lib/transliterate";

describe("cirilicaULatinicu", () => {
  it("prevodi osnovna slova", () => {
    expect(cirilicaULatinicu("КРУШЕВАЦ")).toBe("KRUŠEVAC");
    expect(cirilicaULatinicu("Београд")).toBe("Beograd");
  });

  it("prevodi sva srpska specificna slova", () => {
    expect(cirilicaULatinicu("ђжћчш")).toBe("đžćčš");
    expect(cirilicaULatinicu("ЂЖЋЧШ")).toBe("ĐŽĆČŠ");
  });

  it("digrafe pise velikim slovima kad je cela rec velikim", () => {
    expect(cirilicaULatinicu("ЉУБОВИЈА")).toBe("LJUBOVIJA");
    expect(cirilicaULatinicu("ЊЕГОШ")).toBe("NJEGOŠ");
    expect(cirilicaULatinicu("ЏАМИЈА")).toBe("DŽAMIJA");
  });

  it("digrafe pise sa malim drugim slovom kad sledi malo slovo", () => {
    expect(cirilicaULatinicu("Љубовија")).toBe("Ljubovija");
    expect(cirilicaULatinicu("Његош")).toBe("Njegoš");
  });

  it("ostavlja latinicu, cifre i interpunkciju netaknute", () => {
    expect(cirilicaULatinicu("DOO Beograd-2024")).toBe("DOO Beograd-2024");
    expect(cirilicaULatinicu("МЕШАНО doo")).toBe("MEŠANO doo");
  });

  it("podnosi prazan ulaz", () => {
    expect(cirilicaULatinicu("")).toBe("");
  });

  it("digrafe pise velikim na kraju velikih reči", () => {
    // Bug fix: digrafi na kraju svega-velikih reči moraju biti u svim velikim slovima,
    // jer prethodno slovo je takođe veliko, a sledeće je kraj ili interpunkcija.
    // Primer: ЖАБАЉ (opština Žabalja) je završavala kao žabalj umesto ŽABALJ.
    expect(cirilicaULatinicu("ЖАБАЉ")).toBe("ŽABALJ");
    expect(cirilicaULatinicu("КРУПАЊ")).toBe("KRUPANJ");
    expect(cirilicaULatinicu("РАЖАЊ")).toBe("RAŽANJ");
    expect(cirilicaULatinicu("СЕЧАЊ")).toBe("SEČANJ");
  });
});
