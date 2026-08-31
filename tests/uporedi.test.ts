import { describe, expect, it } from "vitest";

import { izracunajPokazatelje } from "../lib/pokazatelji";
import type { Blokada, Finansije, Firma } from "../lib/queries";
import {
  kanonskiRedosled,
  naslovPoredjenja,
  redoviPoredjenja,
  smeUIndeks,
  zakljucciPoredjenja,
  type StranaPoredjenja,
} from "../lib/uporedi";

const PRESEK = "2026-07-31";

function firma(izmene: Partial<Firma> = {}): Firma {
  return {
    maticni_broj: "20012345",
    slug: "test-doo-20012345",
    poslovno_ime: "TEST DOO BEOGRAD",
    poslovno_ime_kratko: "Test",
    sifra_opstine: "70017",
    opstina: "NOVI BEOGRAD",
    status: "Aktivan",
    status_aktivan: true,
    datum_osnivanja: "2010-05-20",
    pravna_forma: "Društvo sa ograničenom odgovornošću",
    sifra_delatnosti: "4690",
    pib: "100000001",
    adresa: "Bulevar 1",
    ...izmene,
  };
}

function finansije(izmene: Partial<Finansije> = {}): Finansije {
  return {
    maticni_broj: "20012345",
    godina: 2025,
    poslovna_imovina: 100_000,
    kapital: 60_000,
    gubitak: 0,
    ukupni_prihodi: 200_000,
    neto_dobitak: 20_000,
    neto_gubitak: 0,
    prosecan_broj_zaposlenih: 40,
    ...izmene,
  };
}

function strana(
  ime: string,
  fi: Finansije | null,
  izmeneFirme: Partial<Firma> = {},
  blokada: Blokada | null = null,
): StranaPoredjenja {
  return {
    firma: firma(izmeneFirme),
    ime,
    fi,
    pokazatelji: izracunajPokazatelje(fi),
    blokada,
    rangDelatnost: null,
    ukupnoDelatnost: null,
  };
}

function blokada(izmene: Partial<Blokada> = {}): Blokada {
  return {
    maticni_broj: "20012345",
    iznos: 1_500_000,
    ukupno_dana: 47,
    zabrana_prenosa: null,
    periodi: null,
    provereno_at: "2026-08-16T00:00:00Z",
    ...izmene,
  };
}

function nadji(redovi: ReturnType<typeof redoviPoredjenja>, naziv: string) {
  const red = redovi.find((r) => r.naziv === naziv);
  if (!red) throw new Error(`Nema reda "${naziv}"`);
  return red;
}

describe("redoviPoredjenja", () => {
  it("proglašava povoljniju stranu kad obe imaju podatak", () => {
    const a = strana("Veća", finansije({ ukupni_prihodi: 400_000 }));
    const b = strana("Manja", finansije({ ukupni_prihodi: 200_000 }));

    expect(nadji(redoviPoredjenja([a, b], PRESEK), "Ukupan prihod").najbolji).toEqual([0]);
  });

  it("ne proglašava pobednika kad jedna strana nema izveštaj", () => {
    const a = strana("Sa izveštajem", finansije());
    const b = strana("Bez izveštaja", null);

    const redovi = redoviPoredjenja([a, b], PRESEK);
    expect(nadji(redovi, "Ukupan prihod").najbolji).toEqual([]);
    expect(nadji(redovi, "Neto rezultat").najbolji).toEqual([]);
  });

  it("ne pravi neto rezultat od firme bez prihoda", () => {
    // Red u `financials` postoji, ali su sve vrednosti nula: izveštaj nije
    // predat, a ne "poslovala je sa nulom" (CLAUDE.md, pravilo 6).
    const prazna = finansije({
      ukupni_prihodi: 0,
      neto_dobitak: 0,
      neto_gubitak: 0,
      poslovna_imovina: 0,
      kapital: 0,
      prosecan_broj_zaposlenih: 0,
    });
    const a = strana("Prazna", prazna);
    const b = strana("Sa dobitkom", finansije());

    expect(nadji(redoviPoredjenja([a, b], PRESEK), "Neto rezultat").vrednosti[0]).toBeNull();
  });

  it("ne rangira broj zaposlenih", () => {
    const a = strana("Veliki tim", finansije({ prosecan_broj_zaposlenih: 400 }));
    const b = strana("Mali tim", finansije({ prosecan_broj_zaposlenih: 4 }));

    expect(nadji(redoviPoredjenja([a, b], PRESEK), "Zaposleni").najbolji).toEqual([]);
  });

  it("manje dana u blokadi je povoljnije, a odsustvo reda znači nula dana", () => {
    const a = strana("Čista", finansije());
    const b = strana("Blokirana", finansije(), {}, blokada({ ukupno_dana: 47 }));

    const red = nadji(redoviPoredjenja([a, b], PRESEK), "Dana u blokadi (5 godina)");
    expect(red.vrednosti).toEqual([0, 47]);
    expect(red.najbolji).toEqual([0]);
  });

  it("rang se poredi samo unutar iste delatnosti", () => {
    const a = strana("Pekara", finansije(), { sifra_delatnosti: "1071" });
    const b = strana("Građevina", finansije(), { sifra_delatnosti: "4120" });

    expect(redoviPoredjenja([a, b], PRESEK).some((r) => r.naziv === "Rang u delatnosti")).toBe(
      false,
    );
  });
});

describe("zakljucciPoredjenja", () => {
  it("status stavlja ispred brojeva", () => {
    const a = strana("Aktivna", finansije());
    const b = strana("U stečaju", finansije(), { status: "Stečaj", status_aktivan: false });

    expect(zakljucciPoredjenja([a, b])[0]).toContain("U stečaju");
    expect(zakljucciPoredjenja([a, b])[0]).toContain("nije u statusu aktivne firme");
  });

  it("izdvaja aktivnu blokadu računa", () => {
    const a = strana("Čista", finansije());
    const b = strana(
      "Blokirana",
      finansije(),
      {},
      blokada({ zabrana_prenosa: "2026-03-11", ukupno_dana: 120 }),
    );

    expect(zakljucciPoredjenja([a, b]).join(" ")).toContain("aktivnu blokadu računa");
  });

  it("izražava razliku u prihodu kao odnos", () => {
    const a = strana("Veća", finansije({ ukupni_prihodi: 460_000 }));
    const b = strana("Manja", finansije({ ukupni_prihodi: 200_000 }));

    expect(zakljucciPoredjenja([a, b]).join(" ")).toContain("Veća ima 2,3× veći prihod.");
  });

  it("ne izmišlja razliku kad su prihodi slični", () => {
    const a = strana("Prva", finansije({ ukupni_prihodi: 200_000 }));
    const b = strana("Druga", finansije({ ukupni_prihodi: 205_000 }));

    expect(zakljucciPoredjenja([a, b]).join(" ")).toContain("sličnom nivou");
  });

  it("kaže kad nijedna firma nema izveštaj", () => {
    const a = strana("Prva", null);
    const b = strana("Druga", null);

    expect(zakljucciPoredjenja([a, b]).join(" ")).toContain("nema predat finansijski izveštaj");
  });

  it("nikad ne vraća više od tri rečenice", () => {
    const a = strana("Aktivna", finansije({ ukupni_prihodi: 900_000, neto_dobitak: 300_000 }));
    const b = strana(
      "Problematična",
      finansije({ ukupni_prihodi: 50_000, neto_dobitak: 0, neto_gubitak: 40_000 }),
      { status: "Likvidacija", status_aktivan: false },
      blokada({ zabrana_prenosa: "2026-01-05" }),
    );

    expect(zakljucciPoredjenja([a, b]).length).toBeLessThanOrEqual(3);
  });
});

describe("kanonskiRedosled", () => {
  it("uvek vraća isti redosled bez obzira na ulaz", () => {
    expect(kanonskiRedosled(["beta-2", "alfa-1"])).toEqual(["alfa-1", "beta-2"]);
    expect(kanonskiRedosled(["gama-3", "alfa-1", "beta-2"])).toEqual([
      "alfa-1",
      "beta-2",
      "gama-3",
    ]);
  });
});

describe("naslovPoredjenja", () => {
  it("par spaja sa „ili“, tri i više nabraja", () => {
    expect(naslovPoredjenja(["A", "B"])).toBe("A ili B");
    expect(naslovPoredjenja(["A", "B", "C"])).toBe("A, B i C");
  });
});

describe("tri i više firmi", () => {
  it("označava najpovoljniju od tri", () => {
    const a = strana("Prva", finansije({ ukupni_prihodi: 100_000 }));
    const b = strana("Druga", finansije({ ukupni_prihodi: 500_000 }));
    const c = strana("Treća", finansije({ ukupni_prihodi: 300_000 }));

    expect(nadji(redoviPoredjenja([a, b, c], PRESEK), "Ukupan prihod").najbolji).toEqual([1]);
  });

  it("označava sve strane kad je najbolja vrednost neodlučena", () => {
    const a = strana("Prva", finansije({ ukupni_prihodi: 500_000 }));
    const b = strana("Druga", finansije({ ukupni_prihodi: 500_000 }));
    const c = strana("Treća", finansije({ ukupni_prihodi: 100_000 }));

    expect(nadji(redoviPoredjenja([a, b, c], PRESEK), "Ukupan prihod").najbolji).toEqual([0, 1]);
  });

  it("izbacuje rang čim jedna firma nije iz iste delatnosti", () => {
    const a = strana("Prva", finansije(), { sifra_delatnosti: "0111" });
    const b = strana("Druga", finansije(), { sifra_delatnosti: "0111" });
    const c = strana("Treća", finansije(), { sifra_delatnosti: "4120" });

    const imaRang = (strane: StranaPoredjenja[]) =>
      redoviPoredjenja(strane, PRESEK).some((r) => r.naziv === "Rang u delatnosti");

    expect(imaRang([a, b])).toBe(true);
    expect(imaRang([a, b, c])).toBe(false);
  });

  it("zaključak imenuje najveću i najmanju umesto odnosa dve strane", () => {
    const a = strana("Prva", finansije({ ukupni_prihodi: 100_000 }));
    const b = strana("Druga", finansije({ ukupni_prihodi: 500_000 }));
    const c = strana("Treća", finansije({ ukupni_prihodi: 300_000 }));

    const tekst = zakljucciPoredjenja([a, b, c]).join(" ");
    expect(tekst).toContain("Najveći prihod ima Druga");
    expect(tekst).toContain("najmanjeg (Prva)");
  });

  it("nabraja više firmi u blokadi", () => {
    const a = strana("Čista", finansije());
    const b = strana("Prva u blokadi", finansije(), {}, blokada({ zabrana_prenosa: "2026-03-11" }));
    const c = strana("Druga u blokadi", finansije(), {}, blokada({ zabrana_prenosa: "2026-04-02" }));

    expect(zakljucciPoredjenja([a, b, c]).join(" ")).toContain(
      "Prva u blokadi i Druga u blokadi imaju aktivnu blokadu računa.",
    );
  });

  it("ne kaže „a druga nema“ kad drugih ima više", () => {
    const a = strana("Blokirana", finansije(), {}, blokada({ zabrana_prenosa: "2026-03-11" }));
    const b = strana("Druga", finansije());
    const c = strana("Treća", finansije());

    expect(zakljucciPoredjenja([a, b, c]).join(" ")).toContain("a ostale nemaju");
  });

  it("nikad ne vraća više od tri rečenice ni za četiri firme", () => {
    const strane = [
      strana("Prva", finansije({ ukupni_prihodi: 900_000 }), { status: "Likvidacija", status_aktivan: false }),
      strana("Druga", null),
      strana("Treća", finansije({ ukupni_prihodi: 50_000, neto_dobitak: 0, neto_gubitak: 40_000 }), {}, blokada({ zabrana_prenosa: "2026-01-05" })),
      strana("Četvrta", finansije({ ukupni_prihodi: 300_000 })),
    ];

    expect(zakljucciPoredjenja(strane).length).toBeLessThanOrEqual(3);
  });
});

describe("smeUIndeks", () => {
  const osnovaA = { sifra_delatnosti: "4690", sifra_opstine: "70017" };

  it("pušta par iz iste delatnosti i opštine sa uporedivim prihodom", () => {
    const a = strana("Prva", finansije({ ukupni_prihodi: 200_000 }), osnovaA);
    const b = strana("Druga", finansije({ ukupni_prihodi: 150_000 }), osnovaA);

    expect(smeUIndeks([a, b])).toBe(true);
  });

  it("odbija par iz različitih delatnosti", () => {
    const a = strana("Prva", finansije(), osnovaA);
    const b = strana("Druga", finansije(), { ...osnovaA, sifra_delatnosti: "4120" });

    expect(smeUIndeks([a, b])).toBe(false);
  });

  it("odbija par iz različitih opština", () => {
    const a = strana("Prva", finansije(), osnovaA);
    const b = strana("Druga", finansije(), { ...osnovaA, sifra_opstine: "80101" });

    expect(smeUIndeks([a, b])).toBe(false);
  });

  it("odbija poređenje tri firme bez obzira na sve ostalo", () => {
    const a = strana("Prva", finansije({ ukupni_prihodi: 200_000 }), osnovaA);
    const b = strana("Druga", finansije({ ukupni_prihodi: 150_000 }), osnovaA);
    const c = strana("Treća", finansije({ ukupni_prihodi: 180_000 }), osnovaA);

    expect(smeUIndeks([a, b, c])).toBe(false);
  });

  it("odbija nesrazmerne firme i firme bez izveštaja", () => {
    const a = strana("Div", finansije({ ukupni_prihodi: 2_000_000 }), osnovaA);
    const b = strana("Mala", finansije({ ukupni_prihodi: 100_000 }), osnovaA);
    const bez = strana("Bez", null, osnovaA);

    expect(smeUIndeks([a, b])).toBe(false);
    expect(smeUIndeks([a, bez])).toBe(false);
  });
});
