import { beforeAll, describe, expect, it } from "vitest";

import { getSupabaseServerClient } from "../lib/supabase";
import {
  parsirajClanak,
  razdvojLead,
  slugoviFirmiIzClanka,
  srodniClanci,
  sviClanci,
  uHtml,
  KATEGORIJE,
} from "../lib/blog";

const FRONTMATTER = [
  "---",
  'naslov: "Naslov"',
  'datum: "2026-08-15"',
  'kategorija: "opstine"',
  'excerpt: "Kratak opis."',
  "---",
  "",
].join("\n");

const clanak = (dodatak = "", telo = "Prvi pasus.\n\n## Naslov\n\nDrugi pasus.") =>
  parsirajClanak("test.md", FRONTMATTER.replace("---\n\n", `${dodatak}---\n\n`) + telo);

describe("frontmatter", () => {
  it("cita osnovna polja i izvodi slug iz imena fajla", () => {
    const c = clanak();
    expect(c.slug).toBe("test");
    expect(c.naslov).toBe("Naslov");
    expect(c.kategorija).toBe("opstine");
  });

  it("autor ima podrazumevanu vrednost", () => {
    expect(clanak().autor).toBe("Biznis priče");
  });

  // Objavljivanje je commit, pa greska u frontmatter-u mora da padne na buildu,
  // dok je autor jos uz tekst — a ne da se clanak tiho izgubi iz liste.
  it("puca na nepoznatoj kategoriji", () => {
    expect(() =>
      parsirajClanak("x.md", FRONTMATTER.replace("opstine", "izmisljeno") + "Telo."),
    ).toThrow(/kategorija/);
  });

  it("puca na neispravnom datumu", () => {
    expect(() =>
      parsirajClanak("x.md", FRONTMATTER.replace("2026-08-15", "15.08.2026") + "Telo."),
    ).toThrow(/datum/);
  });

  it("puca bez naslova", () => {
    expect(() => parsirajClanak("x.md", FRONTMATTER.replace('naslov: "Naslov"', "") + "Telo.")).toThrow(
      /naslov/,
    );
  });

  it("vreme citanja je bar jedan minut", () => {
    expect(clanak("", "Dve reci.").minutaCitanja).toBe(1);
  });
});

describe("lead", () => {
  it("prvi pasus se izdvaja iz tela", () => {
    const { lead, ostatak } = razdvojLead("Prvi pasus.\n\n## Naslov\n\nDrugi.");
    expect(lead).toBe("Prvi pasus.");
    expect(ostatak).not.toContain("Prvi pasus.");
  });

  it("naslov na pocetku nije lead", () => {
    const { lead } = razdvojLead("## Odmah naslov\n\nTelo.");
    expect(lead).toBeNull();
  });

  it("direktiva na pocetku nije lead", () => {
    expect(razdvojLead(":::stat\na\nb\n:::\n\nTelo.").lead).toBeNull();
  });
});

describe("custom direktive", () => {
  it("stat daje labelu, vrednost i detalj", () => {
    const html = uHtml(":::stat\nNovi Sad\n11.805 firmi\n106.427 zaposlenih\n:::");
    expect(html).toContain('class="stat-box"');
    expect(html).toContain('<div class="l">Novi Sad</div>');
    expect(html).toContain('<div class="v">11.805 firmi</div>');
    expect(html).toContain('<div class="d">106.427 zaposlenih</div>');
  });

  it("proveri pravi listu linkova sa fiksnim zaglavljem", () => {
    const html = uHtml(":::proveri\n[NIS](/firma/nis-ad-novi-sad-20084693)\n:::");
    expect(html).toContain('class="data-callout"');
    expect(html).toContain("Proveri sam");
    expect(html).toContain('href="/firma/nis-ad-novi-sad-20084693"');
  });

  it("prazan proveri blok ne ostavlja prazan okvir", () => {
    expect(uHtml(":::proveri\nbez linkova\n:::")).not.toContain("data-callout");
  });

  it("obican markdown i dalje radi", () => {
    const html = uHtml("## Naslov\n\nTekst sa [linkom](/firma/x).");
    expect(html).toContain("<h2");
    expect(html).toContain('href="/firma/x"');
  });

  it("HTML u tekstu direktive se neutralise", () => {
    const html = uHtml(':::stat\n<img src=x onerror="alert(1)">\nv\n:::');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("objavljeni clanci", () => {
  const objavljeni = sviClanci();

  it("ima bar jedan clanak", () => {
    expect(objavljeni.length).toBeGreaterThan(0);
  });

  it("svi se parsiraju i imaju poznatu kategoriju", () => {
    for (const c of objavljeni) {
      expect(KATEGORIJE, c.slug).toContain(c.kategorija);
      expect(c.excerpt.length, c.slug).toBeGreaterThan(0);
    }
  });

  it("poredak je najnoviji prvi", () => {
    const datumi = objavljeni.map((c) => c.datum);
    expect([...datumi].sort().reverse()).toEqual(datumi);
  });

  it("slugovi su jedinstveni", () => {
    const slugovi = objavljeni.map((c) => c.slug);
    expect(new Set(slugovi).size).toBe(slugovi.length);
  });

  it("srodni clanci nikad ne sadrze sam clanak", () => {
    for (const c of objavljeni) {
      expect(srodniClanci(c).map((s) => s.slug)).not.toContain(c.slug);
    }
  });

  it("svaki clanak vodi na bar jednu stranicu firme", () => {
    for (const c of objavljeni) {
      expect(slugoviFirmiIzClanka(c).length, c.slug).toBeGreaterThan(0);
    }
  });
});

describe("interni linkovi ka firmama postoje u bazi", () => {
  beforeAll(() => {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // u CI-ju vrednosti stižu iz secrets
    }
  });

  /**
   * Interno linkovanje je jedina poluga koja realno pomera indeksiranje
   * (SEO.md §4). Link ka nepostojećoj firmi je 404 iz teksta koji tvrdi da je
   * proverljiv, pa ovo mora da padne na CI-ju, ne u produkciji.
   */
  it("nijedan slug iz clanaka nije mrtav", async () => {
    const trazeni = [...new Set(sviClanci().flatMap(slugoviFirmiIzClanka))];
    expect(trazeni.length).toBeGreaterThan(0);

    const db = getSupabaseServerClient();
    const { data, error } = await db.from("companies").select("slug").in("slug", trazeni);

    expect(error).toBeNull();

    const postojeci = new Set((data ?? []).map((r) => (r as { slug: string }).slug));
    const mrtvi = trazeni.filter((s) => !postojeci.has(s));

    expect(mrtvi, `mrtvi linkovi u clancima: ${mrtvi.join(", ")}`).toEqual([]);
  });
});
