/**
 * Klijent za NBS javnu pretragu dužnika u prinudnoj naplati.
 *
 * Izvor: https://webappcenter.nbs.rs/PnWebApp/EnforcedCollectionDebtor/
 *
 * Zašto: APR open data nema PIB ni blokade (CLAUDE.md, poznata ograničenja).
 * NBS javna pretraga daje oba podatka po matičnom broju, bez registracije i
 * bez captche (samo ASP.NET anti-forgery token koji se dobije iz forme).
 *
 * Napomena o iznosima: NBS daje iznos blokade u DINARIMA (npr. "6.331.452.428,75"),
 * za razliku od APR finansijskih izveštaja koji su u hiljadama dinara.
 */

import { setTimeout as pauza } from "node:timers/promises";

const OSNOVA =
  "https://webappcenter.nbs.rs/PnWebApp/EnforcedCollectionDebtor/EnforcedCollectionDebtor";
const INDEKS = `${OSNOVA}/Index?isSearchExecuted=false`;
const KORISNIK = process.env.NBS_UA ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const POKUSAJA = 3;

export type PeriodBlokade = { od: string; do: string | null; dana: number };

export type NbsPodaci = {
  pib: string | null;
  /** Ukupan iznos blokade u RSD (bez kamate). null = nema blokade. */
  iznos: number | null;
  /** Ukupno dana blokade u poslednjih 5 godina. null = nema podataka. */
  ukupnoDana: number | null;
  /** Datum zabrane prenosa (tekuća blokada) kao yyyy-mm-dd. null = nema. */
  zabranaPrenosa: string | null;
  /** Periodi blokade u poslednjih 5 godina. */
  periodi: PeriodBlokade[];
};

/** Ima li firma ikakvu blokadu (bilo tekuću, bilo u istoriji 5 godina). */
export function imaBlokadu(p: NbsPodaci): boolean {
  return p.iznos !== null || p.ukupnoDana !== null || p.zabranaPrenosa !== null || p.periodi.length > 0;
}

// ---------------------------------------------------------------------------
// HTTP: mali cookie jar + anti-forgery token
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

/** Dekoduje numeričke HTML entitete (&#x41F;...) i osnovne nazivne (&amp;). */
export function dekodujEntitete(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Čisti sadržaj ćelije: skida tagove, dekoduje entitete, sredi razmake. */
function ocisti(html: string): string {
  return dekodujEntitete(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "6.331.452.428,75" → 6331452428.75; prazno/nula → null. */
export function parsirajIznos(tekst: string): number | null {
  const cist = tekst.replace(/[^\d,]/g, "");
  if (!cist || cist === "0" || cist === "0,00") return null;
  const n = Number.parseFloat(cist.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "26.11.2025." → "2025-11-26"; vraća null ako se ne da parsirati. */
export function parsirajDatum(tekst: string): string | null {
  const m = tekst.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/);
  if (!m) return null;
  const dan = Number.parseInt(m[1], 10);
  const mesec = Number.parseInt(m[2], 10);
  const godina = Number.parseInt(m[3], 10);
  if (mesec < 1 || mesec > 12 || dan < 1 || dan > 31) return null;
  return `${String(godina).padStart(4, "0")}-${String(mesec).padStart(2, "0")}-${String(dan).padStart(2, "0")}`;
}

/**
 * Ekstrahuje podatke iz HTML odgovora NBS pretrage.
 * Vraća prazne vrednosti ako firma nema blokadu (ili ako je odgovor prazan).
 */
export function ekstrahujPodatke(html: string): NbsPodaci {
  const dek = dekodujEntitete(html);

  // Glavna tabela: Дужник / Адреса / Место / Матични број / Порески број / Укупан износ блокаде
  const tabela = dek.match(/<table class="responsive-table">([\s\S]*?)<\/table>/);
  const celije = tabela
    ? [...tabela[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => ocisti(m[1]))
    : [];

  const pib = celije[4] ? (celije[4] || null) : null;
  const iznos = parsirajIznos(celije[5] ?? "");

  // Tabela perioda: Од / До / Број дана. Poslednji red je "Укупно: N".
  const periodi: PeriodBlokade[] = [];
  let ukupnoDana: number | null = null;
  const tabelaPerioda = dek.match(/<table class="table">([\s\S]*?)<\/table>/);
  if (tabelaPerioda) {
    for (const red of tabelaPerioda[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const c = [...red[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => ocisti(m[1]));
      if (c.length < 3 || c[0] === "Од") continue; // zaglavlje

      // Red "Укупно: N" — tačan zbir dana iz NBS-a.
      if (c[1] === "Укупно:") {
        const ukupno = Number.parseInt(c[2], 10);
        if (Number.isFinite(ukupno)) ukupnoDana = ukupno;
        continue;
      }

      const dana = Number.parseInt(c[2], 10);
      if (!Number.isFinite(dana) || dana < 0) continue;
      const od = parsirajDatum(c[0]);
      if (!od) continue;
      // Tekući period nema datum "do" (prazna ćelija).
      const doDatuma = c[1] ? parsirajDatum(c[1]) : null;
      periodi.push({ od, do: doDatuma, dana });
    }
  }

  // Zabrana prenosa: <h5>Забрана преноса: 26.11.2025.</h5>
  const zabrana = dek.match(/Забрана преноса:\s*(\d{1,2}\.\d{1,2}\.\d{4})\.?/);

  if (ukupnoDana === null && periodi.length > 0) {
    ukupnoDana = periodi.reduce((s, p) => s + p.dana, 0);
  }

  return {
    pib,
    iznos,
    ukupnoDana,
    zabranaPrenosa: zabrana ? parsirajDatum(zabrana[1]) : null,
    periodi,
  };
}

// ---------------------------------------------------------------------------
// NBS Jedinstveni registar računa (RIR) — PIB za SVE firme sa računom
// ---------------------------------------------------------------------------
// Zašto: evidencija prinudne naplate vraća PIB samo za firme koje su bile u
// prinudnoj naplati u 5 godina (~80%). JRR (registar računa) pokriva sve firme
// sa računom, pa je ovo drugi prolaz za kompletnu pokrivenost PIB-a.

const RIR_OSNOVA =
  "https://webappcenter.nbs.rs/PnWebApp/CompanyAccount/CompanyAccountResident";
const RIR_INDEKS = `${RIR_OSNOVA}/Index?isSearchExecuted=false`;

/**
 * Vadi PIB iz RIR odgovora (prvi red tabele računa koji ima PIB).
 * Kolone: naziv(0), matični broj(1), PIB(2), adresa(3), ...
 * Vraća null ako nema rezultata.
 */
export function ekstrahujPibIzRir(html: string): string | null {
  return ekstrahujRirPodatke(html).pib;
}

export type RirRacun = {
  banka: string | null;
  broj_racuna: string | null;
  status: string | null; // "Укључен" / "Искључен"
  podleze_blokadi: boolean | null;
  datum_otvaranja: string | null; // yyyy-mm-dd
};

export type RirPodaci = {
  pib: string | null;
  /** Adresa sedišta iz RIR kolone "Адреса". */
  adresa: string | null;
  /** Red po računu (ista firma se ponavlja — jedan red po računu). */
  racuni: RirRacun[];
};

/** Najčešća vrednost u listi; pri izjednačenom broju — prva. */
function najcesca(vrednosti: string[]): string | null {
  if (vrednosti.length === 0) return null;
  const broj = new Map<string, number>();
  for (const v of vrednosti) broj.set(v, (broj.get(v) ?? 0) + 1);
  let najbolja = vrednosti[0];
  let najvise = 0;
  for (const [v, n] of broj) {
    if (n > najvise) {
      najbolja = v;
      najvise = n;
    }
  }
  return najbolja;
}

/**
 * Vadi PIB, adresu i račune (banku, broj računa) iz RIR odgovora.
 *
 * Kolone tabele: naziv(0), matični broj(1), PIB(2), adresa(3), mesto(4),
 * opština(5), delatnost(6), banka(7), "....."(8), račun(9), "....."(10),
 * status(11), podleže/ne podleže blokadi(12), datum otvaranja(13).
 * Jedan red po računu — ista firma se ponavlja.
 */
export function ekstrahujRirPodatke(html: string): RirPodaci {
  const dek = dekodujEntitete(html);
  const tabela = dek.match(/<table class="responsive-table">([\s\S]*?)<\/table>/);
  if (!tabela) return { pib: null, adresa: null, racuni: [] };

  const racuni: RirRacun[] = [];
  const adrese: string[] = [];
  let pib: string | null = null;

  for (const red of tabela[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celije = [...red[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => ocisti(m[1]));
    if (celije.length < 14 || !/^\d{9}$/.test(celije[2] ?? "")) continue; // zaglavlje ili nepotpun red
    pib = celije[2];
    if (celije[3]) adrese.push(celije[3]);
    racuni.push({
      banka: celije[7] || null,
      broj_racuna: celije[9] || null,
      status: celije[11] || null,
      podleze_blokadi: celije[12] ? celije[12].includes("Подлеже") : null,
      datum_otvaranja: parsirajDatum(celije[13] ?? ""),
    });
  }

  return { pib, adresa: najcesca(adrese), racuni };
}

/** Jedna sesija ka RIR pretrazi (anti-forgery token + kolačići). */
export class NbsRirKlijent {
  private jar = new CookieJar();
  private token: string | null = null;

  async osveziSesiju(): Promise<void> {
    const res = await fetch(RIR_INDEKS, { headers: { "User-Agent": KORISNIK }, redirect: "follow" });
    if (!res.ok) throw new Error(`NBS RIR GET → HTTP ${res.status}`);
    this.jar.sacuvaj(res);
    const html = await res.text();
    const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
    if (!m) throw new Error("NBS RIR: anti-forgery token nije pronađen");
    this.token = m[1];
  }

  /** Vraća PIB za matični broj ili null ako firma nije u JRR. */
  async pibZaMaticniBroj(maticniBroj: string): Promise<string | null> {
    return (await this.podaciZaMaticniBroj(maticniBroj)).pib;
  }

  /**
   * Vraća PIB, adresu i račune za matični broj (ili prazne vrednosti ako firma
   * nije u JRR). Isti upit kao `pibZaMaticniBroj` — razlika je samo u parsiranju.
   */
  async podaciZaMaticniBroj(maticniBroj: string): Promise<RirPodaci> {
    let poslednjaGreska: unknown = null;

    for (let pokusaj = 1; pokusaj <= POKUSAJA; pokusaj++) {
      try {
        if (!this.token) await this.osveziSesiju();
        const telo = new URLSearchParams({
          isSearchExecuted: "True",
          CompanyNationalCode: maticniBroj,
          CompanyTaxCode: "",
          CompanyName: "",
          City: "",
          BankCode: "",
          AccountNumber: "",
          ControlNumber: "",
          OrderBy: "",
          "Pagging.CurrentPage": "1",
          "Pagging.PageSize": "10",
          __RequestVerificationToken: this.token ?? "",
        });
        const res = await fetch(RIR_OSNOVA, {
          method: "POST",
          headers: {
            "User-Agent": KORISNIK,
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: this.jar.zaglavlje(),
          },
          body: telo,
          redirect: "follow",
        });
        this.jar.sacuvaj(res);
        const html = await res.text();

        if (res.status === 400 || res.status === 401) {
          this.token = null;
          if (pokusaj < POKUSAJA) {
            await pauza(500 * pokusaj);
            continue;
          }
        }
        if (!res.ok) {
          this.token = null;
          if (pokusaj < POKUSAJA) {
            await pauza(1000 * pokusaj);
            continue;
          }
        }
        return ekstrahujRirPodatke(html);
      } catch (greska) {
        poslednjaGreska = greska;
        if (pokusaj < POKUSAJA) await pauza(700 * 2 ** (pokusaj - 1));
      }
    }

    throw new Error(
      `NBS RIR upit za ${maticniBroj} nije uspeo posle ${POKUSAJA} pokušaja: ${
        poslednjaGreska instanceof Error ? poslednjaGreska.message : String(poslednjaGreska)
      }`,
    );
  }
}

/**
 * Jedna sesija: jedan GET (anti-forgery token + kolačići) pa mnogo POST-ova.
 * Token se reusuje dok god server prihvata; na 400/401 se sesija osvežava.
 */
export class NbsKlijent {
  private jar = new CookieJar();
  private token: string | null = null;

  async osveziSesiju(): Promise<void> {
    const res = await fetch(INDEKS, { headers: { "User-Agent": KORISNIK }, redirect: "follow" });
    if (!res.ok) throw new Error(`NBS GET ${INDEKS} → HTTP ${res.status}`);
    this.jar.sacuvaj(res);
    const html = await res.text();
    const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
    if (!m) throw new Error("NBS: anti-forgery token nije pronađen u formi");
    this.token = m[1];
  }

  async podaciZaMaticniBroj(maticniBroj: string): Promise<NbsPodaci> {
    let poslednjaGreska: unknown = null;

    for (let pokusaj = 1; pokusaj <= POKUSAJA; pokusaj++) {
      try {
        if (!this.token) await this.osveziSesiju();
        const telo = new URLSearchParams({
          isSearchExecuted: "True",
          NationalCode: maticniBroj,
          TaxCode: "",
          OrderBy: "",
          __RequestVerificationToken: this.token ?? "",
        });
        const res = await fetch(OSNOVA, {
          method: "POST",
          headers: {
            "User-Agent": KORISNIK,
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: this.jar.zaglavlje(),
          },
          body: telo,
          redirect: "follow",
        });
        this.jar.sacuvaj(res);
        const html = await res.text();

        // Istekao token/sesija → osveži i pokušaj ponovo.
        if (res.status === 400 || res.status === 401) {
          this.token = null;
          if (pokusaj < POKUSAJA) {
            await pauza(500 * pokusaj);
            continue;
          }
        }

        const dek = dekodujEntitete(html);
        const izgledaValidno =
          dek.includes("responsive-table") || dek.includes("нема евидентиране неизмирене обавезе");
        if (!res.ok || !izgledaValidno) {
          this.token = null;
          if (pokusaj < POKUSAJA) {
            await pauza(1000 * pokusaj);
            continue;
          }
        }

        return ekstrahujPodatke(html);
      } catch (greska) {
        poslednjaGreska = greska;
        if (pokusaj < POKUSAJA) await pauza(700 * 2 ** (pokusaj - 1));
      }
    }

    throw new Error(
      `NBS upit za ${maticniBroj} nije uspeo posle ${POKUSAJA} pokušaja: ${
        poslednjaGreska instanceof Error ? poslednjaGreska.message : String(poslednjaGreska)
      }`,
    );
  }
}
