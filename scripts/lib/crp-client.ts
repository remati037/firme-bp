/**
 * Klijent za APR Centralnu evidenciju privremenih ograničenja prava
 * (crp.apr.gov.rs) — javna pretraga po matičnom broju, bez captche i logina.
 *
 * Dve runde po firmi:
 *   1. Pretraga (ActiveRestrictionsResultPartial) po MB → liste mera
 *      (MB + naziv + referenca + submission id za detalje).
 *   2. Detalji mere (Details/{submissionId}) → vrsta, šifra, početak važenja,
 *      opis, status izbrisanosti.
 *
 * Zašto: APR open data nema zabrane; NBS blokade (nbs-client.ts) pokrivaju
 * prinudnu naplatu, a ova evidencija sudske/izvršiteljske/poreske mere.
 */

import { setTimeout as pauza } from "node:timers/promises";

const OSNOVA = "https://crp.apr.gov.rs/eregistrationportal/Public/Manage";
const PRETRAGA = `${OSNOVA}/ActiveRestrictionsResultPartial`;
const INDEKS = `${OSNOVA}/ActiveRestrictions`;
const KORISNIK = process.env.NBS_UA ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const POKUSAJA = 3;

export type ZabranaMera = {
  /** Submission id iz portala (dedup ključ). */
  izvorId: string;
  /** Referenca mere, npr. "CEPOP-APR-6697-TRINTD-2/2026". */
  referenca: string | null;
  vrsta: string | null;
  sifra: string | null;
  pocetakVazenja: string | null; // yyyy-mm-dd
  izbrisana: boolean | null;
  opis: string | null;
};

/** Dekoduje numeričke HTML entitete (&#x41F;...) i osnovne nazivne (&amp;). */
function dekodujEntitete(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Čisti sadržaj: skida tagove, dekoduje, sredi razmake. */
function ocisti(html: string): string {
  return dekodujEntitete(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "28.04.2026 00:00:00" → "2026-04-28"; null ako se ne da parsirati. */
export function parsirajDatum(tekst: string): string | null {
  const m = tekst.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const dan = Number.parseInt(m[1], 10);
  const mesec = Number.parseInt(m[2], 10);
  if (mesec < 1 || mesec > 12 || dan < 1 || dan > 31) return null;
  return `${m[3]}-${String(mesec).padStart(2, "0")}-${String(dan).padStart(2, "0")}`;
}

/**
 * Ekstrahuje mere iz HTML odgovora pretrage (ActiveRestrictionsResultPartial).
 * Svaki red tabele ima MB + naziv + link ka detaljima (details('id')) + referencu
 * u title-u linka ("Детаљи о мери CEPOP-APR-...").
 */
export function ekstrahujMereIzPretrage(html: string): { izvorId: string; referenca: string | null }[] {
  const dek = dekodujEntitete(html);
  const mere: { izvorId: string; referenca: string | null }[] = [];
  const tabela = dek.match(/<table[^>]*id="grdActiveRestrictions"([\s\S]*?)<\/table>/);
  if (!tabela) return mere;

  for (const red of tabela[1].matchAll(/<tr class="regrid-row">([\s\S]*?)<\/tr>/g)) {
    const det = red[1].match(/details\('([^']+)'\)/);
    if (!det) continue;
    const ref = red[1].match(/Детаљи о мери\s+([^"<]+)/);
    mere.push({ izvorId: det[1], referenca: ref ? ref[1].trim() : null });
  }
  return mere;
}

/**
 * Ekstrahuje polja iz HTML-a detalja mere. Stranica koristi parove
 * `<label class='preview-entity-property-name'>` / `<label class='preview-entity-property-value'>`.
 */
export function ekstrahujDetaljeMere(html: string): {
  vrsta: string | null;
  sifra: string | null;
  pocetakVazenja: string | null;
  izbrisana: boolean | null;
  opis: string | null;
} {
  const dek = dekodujEntitete(html);
  const mapa = new Map<string, string>();
  for (const par of dek.matchAll(
    /preview-entity-property-name'[^>]*>([\s\S]*?)<\/label>[\s\S]*?preview-entity-property-value'[^>]*>([\s\S]*?)<\/label>/g,
  )) {
    mapa.set(ocisti(par[1]), ocisti(par[2]));
  }

  const izbrisana = mapa.get("Мера је избрисана");
  return {
    vrsta: mapa.get("Врста мере") ?? null,
    sifra: mapa.get("Шифра") ?? null,
    pocetakVazenja: parsirajDatum(mapa.get("Почетак важења мере") ?? ""),
    izbrisana: izbrisana === undefined ? null : izbrisana === "Да",
    opis: mapa.get("Опис") ?? null,
  };
}

// ---------------------------------------------------------------------------
// HTTP: cookie jar + sesija
// ---------------------------------------------------------------------------

class CookieJar {
  private kukiji = new Map<string, string>();

  sacuvaj(res: Response): void {
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const linija of setCookie) {
      const [par] = linija.split(";");
      const i = par.indexOf("=");
      if (i < 0) continue;
      this.kukiji.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }

  zaglavlje(): string {
    return [...this.kukiji.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

/** Jedna sesija: GET (session cookie) pa AJAX GET pretrage po MB. */
export class CrpKlijent {
  private jar = new CookieJar();

  async osveziSesiju(): Promise<void> {
    const res = await fetch(INDEKS, { headers: { "User-Agent": KORISNIK }, redirect: "follow" });
    if (!res.ok) throw new Error(`CRP GET ${INDEKS} → HTTP ${res.status}`);
    this.jar.sacuvaj(res);
    await res.arrayBuffer(); // isprazni telo
  }

  /** Pretraga aktivnih mera po matičnom broju. Vraća mere (možda prazan niz). */
  async mereZaMaticniBroj(maticniBroj: string): Promise<{ izvorId: string; referenca: string | null }[]> {
    let poslednjaGreska: unknown = null;

    for (let pokusaj = 1; pokusaj <= POKUSAJA; pokusaj++) {
      try {
        if (this.jar.zaglavlje() === "") await this.osveziSesiju();
        const url = new URL(PRETRAGA);
        url.searchParams.set("RestrictedEntityIdentificationNumber", maticniBroj);
        url.searchParams.set("RestrictedEntityName", "");
        url.searchParams.set("RestrictionClasificationCode", "");
        // Prazan filter vraća SVE mere za MB (aktivne i nedavno izbrisane);
        // status aktivnosti čuvamo kroz polje "Мера је избрисана" u detaljima.
        url.searchParams.set("RestrictionIsActive", "");
        const res = await fetch(url, {
          headers: {
            "User-Agent": KORISNIK,
            "X-Requested-With": "XMLHttpRequest",
            Cookie: this.jar.zaglavlje(),
          },
          redirect: "follow",
        });
        this.jar.sacuvaj(res);
        if (!res.ok) {
          if (pokusaj < POKUSAJA) {
            await pauza(1000 * pokusaj);
            continue;
          }
        }
        return ekstrahujMereIzPretrage(await res.text());
      } catch (greska) {
        poslednjaGreska = greska;
        if (pokusaj < POKUSAJA) await pauza(700 * 2 ** (pokusaj - 1));
      }
    }

    throw new Error(
      `CRP pretraga za ${maticniBroj} nije uspela posle ${POKUSAJA} pokušaja: ${
        poslednjaGreska instanceof Error ? poslednjaGreska.message : String(poslednjaGreska)
      }`,
    );
  }

  /** Detalji jedne mere. */
  async detaljiMere(izvorId: string): Promise<ZabranaMera> {
    const url = `${OSNOVA}/Details/${izvorId}`;
    let poslednjaGreska: unknown = null;

    for (let pokusaj = 1; pokusaj <= POKUSAJA; pokusaj++) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": KORISNIK, Cookie: this.jar.zaglavlje() },
          redirect: "follow",
        });
        this.jar.sacuvaj(res);
        if (!res.ok) {
          if (pokusaj < POKUSAJA) {
            await pauza(1000 * pokusaj);
            continue;
          }
        }
        const detalji = ekstrahujDetaljeMere(await res.text());
        return {
          izvorId,
          referenca: null,
          vrsta: detalji.vrsta,
          sifra: detalji.sifra,
          pocetakVazenja: detalji.pocetakVazenja,
          izbrisana: detalji.izbrisana,
          opis: detalji.opis,
        };
      } catch (greska) {
        poslednjaGreska = greska;
        if (pokusaj < POKUSAJA) await pauza(700 * 2 ** (pokusaj - 1));
      }
    }

    throw new Error(
      `CRP detalji za ${izvorId} nisu uspeli posle ${POKUSAJA} pokušaja: ${
        poslednjaGreska instanceof Error ? poslednjaGreska.message : String(poslednjaGreska)
      }`,
    );
  }
}
