import { describe, expect, it } from "vitest";
import {
  formatBroj,
  formatDatum,
  formatFirmi,
  formatProcenat,
  formatRSD,
  formatRSDKompaktno,
  formatStarost,
  formatZaposleni,
  godinaIz,
  iliNemaPodataka,
  jePrazno,
  NEMA_PODATAKA,
  pluralSrpski,
  starostUGodinama,
} from "../lib/format";

describe("formatBroj", () => {
  it("grupise hiljade tackom", () => {
    expect(formatBroj(133634)).toBe("133.634");
    expect(formatBroj(1101)).toBe("1.101");
  });

  it("nula je 'Nema podataka' osim ako je eksplicitno podatak", () => {
    // CLAUDE.md, pravilo 5: nula znaci da izvestaj nije predat
    expect(formatBroj(0)).toBe(NEMA_PODATAKA);
    expect(formatBroj(0, { nulaJePodatak: true })).toBe("0");
  });

  it("null i undefined su 'Nema podataka'", () => {
    expect(formatBroj(null)).toBe(NEMA_PODATAKA);
    expect(formatBroj(undefined)).toBe(NEMA_PODATAKA);
  });
});

describe("formatRSD", () => {
  it("mnozi hiljade dinara sa 1000", () => {
    // APR daje 45.200 (hiljada) = 45.200.000 RSD
    expect(formatRSD(45200)).toBe("45.200.000 RSD");
  });

  it("nikad ne ispisuje '0 RSD'", () => {
    expect(formatRSD(0)).toBe(NEMA_PODATAKA);
    expect(formatRSD(null)).toBe(NEMA_PODATAKA);
  });

  it("cuva negativan rezultat", () => {
    expect(formatRSD(-1200)).toBe("-1.200.000 RSD");
  });
});

describe("formatRSDKompaktno", () => {
  it("milijarde i milioni", () => {
    expect(formatRSDKompaktno(238_400_000)).toBe("238,4 mrd RSD");
    expect(formatRSDKompaktno(96_100)).toBe("96,1 mil RSD");
  });

  it("ispod miliona ide pun broj", () => {
    expect(formatRSDKompaktno(450)).toBe("450.000 RSD");
  });

  it("negativna vrednost zadrzava znak", () => {
    expect(formatRSDKompaktno(-2_500_000)).toBe("-2,5 mrd RSD");
  });
});

describe("formatProcenat", () => {
  it("koristi zarez kao decimalni separator", () => {
    expect(formatProcenat(23.42)).toBe("23,4%");
  });

  it("nula je legitimna marza", () => {
    expect(formatProcenat(0)).toBe("0,0%");
    expect(formatProcenat(null)).toBe(NEMA_PODATAKA);
  });
});

describe("formatDatum", () => {
  it("dd.MM.yyyy. iz ISO datuma", () => {
    expect(formatDatum("2026-07-31")).toBe("31.07.2026.");
  });

  it("ne pomera dan zbog vremenske zone", () => {
    expect(formatDatum("2026-01-01")).toBe("01.01.2026.");
  });

  it("prazno i neispravno su 'Nema podataka'", () => {
    expect(formatDatum(null)).toBe(NEMA_PODATAKA);
    expect(formatDatum("nije datum")).toBe(NEMA_PODATAKA);
  });
});

describe("godinaIz", () => {
  it("vraca godinu ili null", () => {
    expect(godinaIz("2026-07-31")).toBe(2026);
    expect(godinaIz(null)).toBeNull();
  });
});

describe("starostUGodinama", () => {
  it("racuna pune godine na zadati dan", () => {
    expect(starostUGodinama("2010-08-15", "2026-08-14")).toBe(15);
    expect(starostUGodinama("2010-08-14", "2026-08-14")).toBe(16);
  });

  it("null za buduci datum i za prazno", () => {
    expect(starostUGodinama("2030-01-01", "2026-08-14")).toBeNull();
    expect(starostUGodinama(null)).toBeNull();
  });
});

describe("formatStarost", () => {
  it("srpska mnozina", () => {
    expect(formatStarost("2025-01-01", "2026-08-14")).toBe("1 godina");
    expect(formatStarost("2023-01-01", "2026-08-14")).toBe("3 godine");
    expect(formatStarost("2016-01-01", "2026-08-14")).toBe("10 godina");
  });

  it("firma mladja od godinu dana", () => {
    expect(formatStarost("2026-03-01", "2026-08-14")).toBe("manje od godinu dana");
  });
});

describe("pluralSrpski", () => {
  it("11 do 14 idu u treci oblik", () => {
    expect(pluralSrpski(11, "firma", "firme", "firmi")).toBe("firmi");
    expect(pluralSrpski(12, "firma", "firme", "firmi")).toBe("firmi");
  });

  it("21 ide u prvi oblik", () => {
    expect(pluralSrpski(21, "firma", "firme", "firmi")).toBe("firma");
  });
});

describe("formatFirmi i formatZaposleni", () => {
  it("slaze broj i oblik reci", () => {
    expect(formatFirmi(2847)).toBe("2.847 firmi");
    expect(formatFirmi(1101)).toBe("1.101 firma");
    expect(formatFirmi(14203)).toBe("14.203 firme");
  });

  it("nula firmi je podatak, nula zaposlenih nije", () => {
    expect(formatFirmi(0)).toBe("0 firmi");
    expect(formatZaposleni(0)).toBe(NEMA_PODATAKA);
    expect(formatZaposleni(12)).toBe("12 zaposlenih");
    expect(formatZaposleni(1)).toBe("1 zaposleni");
  });
});

describe("jePrazno i iliNemaPodataka", () => {
  it("prepoznaje prazne vrednosti", () => {
    expect(jePrazno(0)).toBe(true);
    expect(jePrazno(0, true)).toBe(false);
    expect(jePrazno(NaN)).toBe(true);
    expect(jePrazno(5)).toBe(false);
  });

  it("prazan tekst je 'Nema podataka'", () => {
    expect(iliNemaPodataka("  ")).toBe(NEMA_PODATAKA);
    expect(iliNemaPodataka("Beograd")).toBe("Beograd");
  });
});
