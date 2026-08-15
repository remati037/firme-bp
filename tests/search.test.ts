import { beforeAll, describe, expect, it } from "vitest";

import { GET } from "../app/api/search/route";

/**
 * Integracioni testovi rute `/api/search` nad pravom bazom.
 *
 * Povod je bug potvrđen na produkciji 15.08.2026: polje za pretragu je
 * obećavalo "naziv firme, matični broj ili PIB", a ruta je gledala isključivo
 * `poslovno_ime_norm`, pa je upit sa matičnim brojem vraćao prazan niz.
 */

type Rezultat = {
  maticni_broj: string;
  slug: string;
  ime: string;
  opstina: string | null;
  status: string | null;
  status_aktivan: boolean | null;
  sifra_delatnosti: string | null;
  delatnost_naziv: string | null;
};

/** Matični broj NIS-a; potvrđeno nad bazom 15.08.2026. */
const NIS_MB = "20084693";

beforeAll(() => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // u CI-ju vrednosti stižu iz secrets
  }
});

async function trazi(q: string, limit?: number): Promise<Rezultat[]> {
  const adresa = new URL("http://localhost/api/search");
  adresa.searchParams.set("q", q);
  if (limit !== undefined) adresa.searchParams.set("limit", String(limit));

  const odgovor = await GET(new Request(adresa));
  expect(odgovor.status).toBe(200);

  const telo = (await odgovor.json()) as { rezultati: Rezultat[] };
  return telo.rezultati;
}

describe("pretraga po matičnom broju", () => {
  it("nalazi firmu i stavlja je prvu", async () => {
    const rezultati = await trazi(NIS_MB);

    expect(rezultati.length).toBeGreaterThan(0);
    expect(rezultati[0].maticni_broj).toBe(NIS_MB);
    expect(rezultati[0].ime).toBe("NIS a.d. Novi Sad");
  });

  it("odgovor zadržava ugovoreni oblik", async () => {
    const [prvi] = await trazi(NIS_MB);

    expect(prvi).toMatchObject({
      maticni_broj: expect.any(String),
      slug: expect.any(String),
      ime: expect.any(String),
    });
    // Slug se završava matičnim brojem (SEO.md §1.3).
    expect(prvi.slug.endsWith(NIS_MB)).toBe(true);
    expect(prvi).toHaveProperty("delatnost_naziv");
    expect(prvi).toHaveProperty("status_aktivan");
  });

  // Razmaci oko broja su ono što se dobije kad se matični broj nalepi iz PDF-a.
  it("trpi razmake oko broja", async () => {
    const rezultati = await trazi(`  ${NIS_MB} `);
    expect(rezultati[0]?.maticni_broj).toBe(NIS_MB);
  });

  it("nepostojeći matični broj ne ruši rutu", async () => {
    expect(await trazi("00000000")).toEqual([]);
  });

  it("nema duplikata kada isti broj nađu i tačan i imenski upit", async () => {
    const rezultati = await trazi(NIS_MB, 25);
    const brojevi = rezultati.map((r) => r.maticni_broj);
    expect(new Set(brojevi).size).toBe(brojevi.length);
  });
});

describe("pretraga po PIB-u", () => {
  // PIB je null za svih 133.634 firmi dok ne stigne NBS (faza 2). Do tada se
  // proverava samo da grana postoji i da ne puca; tačan pogodak se ne može
  // testirati jer u bazi nema nijedne vrednosti.
  it("devetocifren upit prolazi bez greške", async () => {
    await expect(trazi("104253811")).resolves.toBeInstanceOf(Array);
  });
});

describe("pretraga po imenu i dalje radi", () => {
  it("skraćeno ime nalazi NIS", async () => {
    const rezultati = await trazi("nis");
    expect(rezultati.some((r) => r.maticni_broj === NIS_MB)).toBe(true);
  });

  it("ćirilica i velika slova daju isti rezultat", async () => {
    const [latinica, cirilica] = await Promise.all([trazi("telekom"), trazi("ТЕЛЕКОМ")]);

    expect(latinica.length).toBeGreaterThan(0);
    expect(cirilica.map((r) => r.maticni_broj)).toEqual(latinica.map((r) => r.maticni_broj));
  });

  it("jedno slovo ne vraća ništa", async () => {
    expect(await trazi("a")).toEqual([]);
  });

  it("poštuje limit", async () => {
    expect((await trazi("doo", 3)).length).toBeLessThanOrEqual(3);
  });

  // `Number(null)` je 0 i prolazi kao konačan broj, pa je izostanak parametra
  // ranije davao jedan jedini rezultat umesto deset.
  it("bez limita vraća podrazumevanih 10, ne jedan", async () => {
    expect((await trazi("doo")).length).toBe(10);
  });
});

describe("granice limita", () => {
  it("prazan limit pada na podrazumevanu vrednost", async () => {
    const adresa = new URL("http://localhost/api/search?q=doo&limit=");
    const { rezultati } = (await (await GET(new Request(adresa))).json()) as {
      rezultati: Rezultat[];
    };
    expect(rezultati.length).toBe(10);
  });

  it("iznad maksimuma se seče na 25", async () => {
    expect((await trazi("doo", 999)).length).toBeLessThanOrEqual(25);
  });
});
