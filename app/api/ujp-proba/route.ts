import { NextResponse } from "next/server";

/**
 * PRIVREMENA dijagnostička ruta — proba dostupnosti UJP (javne nabavke) sa
 * Vercel-ove mreže (region fra1/Frankfurt). Nakon testa ukloniti.
 *
 * Zašto: UJP stari portal (portal.ujn.gov.rs) služi samo na portu 80 (https
 * timeout) i ima otvorene podatke 2013–2021; novi portal (jnportal.ujn.gov.rs)
 * ima aktuelne podatke ali API traži prijavu. Ova ruta proverava šta je
 * dostupno iz hosting okruženja (za budući cron/ingest).
 */

export const maxDuration = 30;

const CILJEVI = [
  {
    naziv: "stari portal (http :80) — OpenData stranica",
    url: "http://portal.ujn.gov.rs/OpenData.aspx",
  },
  {
    naziv: "stari portal — OpenData CSV 2021",
    url: "http://portal.ujn.gov.rs/OpenD/OpenData_2021.csv",
  },
  {
    naziv: "novi portal — početna",
    url: "https://jnportal.ujn.gov.rs/",
  },
  {
    naziv: "novi portal — API (očekivano 401/403)",
    url: "https://jnportal.ujn.gov.rs/api/contracts",
  },
];

export async function GET() {
  const rezultati = await Promise.all(
    CILJEVI.map(async (c) => {
      try {
        const r = await fetch(c.url, {
          signal: AbortSignal.timeout(12_000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BiznisPrice-proba/1.0)" },
          redirect: "follow",
        });
        const telo = await r.text();
        return { naziv: c.naziv, url: c.url, ok: true, status: r.status, bajtovi: telo.length };
      } catch (greska) {
        return {
          naziv: c.naziv,
          url: c.url,
          ok: false,
          greska: greska instanceof Error ? greska.message : String(greska),
        };
      }
    }),
  );

  return NextResponse.json({ vreme: new Date().toISOString(), rezultati });
}
