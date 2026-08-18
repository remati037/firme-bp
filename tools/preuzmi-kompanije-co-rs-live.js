#!/usr/bin/env node
/**
 * Live skrejp kompanije.co.rs preko headless Chromium-a (playwright-core).
 *
 * STATUS: TESTIRANO — 20/20 stranica prolazi Vercel Security Checkpoint i vraća
 * pravi sadržaj (server-rendered HTML + JSON-LD schema.org Organization).
 * Skripta je PRIPREMLJENA ali NIJE pokretana u punom obimu — pun skrejp
 * (~5.700 stranica lista /mesto/?page=N + ~137.000 stranica firmi) zahteva
 * odluku vlasnika: zaobilazi anti-bot zaštitu tuđeg sajta i stvara opterećenje.
 *
 * Zašto postoji: telefon/e-mail/website NEMAJU registarski izvor (ni APR ni
 * NBS) — jedino ih ima kompanije.co.rs (i slični imenici). Adresa i računi se
 * dobijaju iz NBS RIR (scripts/enrich-pib-rir.ts --adresa), bez skrejpovanja.
 *
 * Instalacija (playwright-core + keširani Chromium iz ms-playwright cache-a):
 *   cd tools && npm init -y && npm install playwright-core --cache ./npm-cache
 *   # putanja do Chromium-a se automatski pronađe u ~/Library/Caches/ms-playwright
 *
 * Upotreba:
 *   node tools/preuzmi-kompanije-co-rs-live.js --urls=firme.txt [--limit=20]
 *   node tools/preuzmi-kompanije-co-rs-live.js --sitemap [--limit=50]
 *   node tools/preuzmi-kompanije-co-rs-live.js --mesto=novi-beograd --stranice=1-10
 *
 * Izlaz: tools/data/kompanije-co-rs-live.jsonl (nastavljiv, preskače obrađene).
 */

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const os = require("os");

const IZLAZ = path.join(__dirname, "data", "kompanije-co-rs-live.jsonl");

// Pronađi keširani Chromium (macOS ms-playwright cache).
function nadjiChromium() {
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cache)) return null;
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith("chromium-")) continue;
    const cand = path.join(
      cache, dir, "chrome-mac-arm64",
      "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing",
    );
    if (fs.existsSync(cand)) return cand;
    const cand2 = path.join(cache, dir, "chrome-mac", "Chromium");
    if (fs.existsSync(cand2)) return cand2;
  }
  return null;
}

function arg(name) {
  const i = process.argv.findIndex((a) => a.startsWith(`--${name}=`));
  return i === -1 ? null : process.argv[i].slice(name.length + 3);
}

/** Ekstrakcija JSON-LD (Organization blok za firmu). */
function jsonLdFirme(ld) {
  for (const blok of ld) {
    try {
      const d = JSON.parse(blok);
      if (d["@type"] === "Organization" && d.identifier) return d;
    } catch { /* preskoči */ }
  }
  return null;
}

/** Ekstrakcija polja iz HTML tabele "Osnovni podaci" (labela -> vrednost). */
function osnovniPodaci(html) {
  const mapa = {};
  const blok = html.match(/Osnovni podaci<\/h2>([\s\S]*?)<\/section>/);
  const izvor = blok ? blok[1] : html;
  const parovi = izvor.matchAll(
    /<span[^>]*>([^<]{2,40})<\/span><\/span><span[^>]*>([^<]{1,120})/g,
  );
  for (const m of parovi) mapa[m[1].trim()] = m[2].trim();
  // jednostavniji fallback: labela u span, vrednost u sledećem span
  if (Object.keys(mapa).length === 0) {
    const spans = [...izvor.matchAll(/<span[^>]*>([^<]{2,40})<\/span>/g)].map((m) => m[1].trim());
    for (let i = 0; i < spans.length - 1; i++) {
      if (/^(Matični broj|PIB|Adresa|Website|Email|Telefon|Zaposleni|Lokacija)$/.test(spans[i])) {
        mapa[spans[i]] = spans[i + 1];
      }
    }
  }
  return mapa;
}

async function glavna() {
  const exe = nadjiChromium();
  if (!exe) throw new Error("Chromium nije pronađen u ms-playwright cache-u. Pokreni: npx playwright install chromium");

  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "sr-RS",
    viewport: { width: 1366, height: 900 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // Izvor URL-ova
  let urls = [];
  const fajl = arg("urls");
  if (fajl) urls = fs.readFileSync(fajl, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  if (arg("sitemap")) {
    const p = await ctx.newPage();
    const resp = await p.goto("https://www.kompanije.co.rs/sitemap.xml", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(8000);
    const xml = await resp.text();
    urls = xml.match(/https:\/\/www\.kompanije\.co\.rs\/[^\s<]+/g) || [];
    await p.close();
  }

  const limit = Number(arg("limit") || 0);
  if (limit) urls = urls.slice(0, limit);
  console.log(`Ciljnih URL-ova: ${urls.length}`);

  fs.mkdirSync(path.dirname(IZLAZ), { recursive: true });
  const gotovi = new Set();
  if (fs.existsSync(IZLAZ)) {
    for (const l of fs.readFileSync(IZLAZ, "utf8").split("\n")) {
      try { gotovi.add(JSON.parse(l).slug); } catch { /* ignor */ }
    }
  }

  let ok = 0;
  const izlaz = fs.createWriteStream(IZLAZ, { flags: "a" });
  for (const u of urls) {
    const slug = u.split("/").filter(Boolean).pop() || u;
    if (gotovi.has(slug)) continue;
    const p = await ctx.newPage();
    try {
      await p.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
      await p.waitForTimeout(12000); // sačekaj da se sadržaj iscrta
      const title = await p.title();
      const html = await p.content();
      const ld = await p.evaluate(() =>
        Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent),
      );
      const firma = jsonLdFirme(ld);
      const osn = osnovniPodaci(html);
      const zapis = {
        slug,
        url: u,
        title,
        mb: (firma?.identifier?.value) || (title.match(/Matični broj (\d{8})/) || [])[1] || "",
        naziv: firma?.legalName || firma?.name || "",
        adresa: osn["Adresa"] || "",
        telefon: firma?.telephone || osn["Telefon"] || "",
        email: osn["Email"] || "",
        website: osn["Website"] || (firma?.sameAs || []).find((s) => !s.includes("apr.gov.rs")) || "",
        osnivanje: firma?.foundingDate || "",
        zaposleni: firma?.numberOfEmployees?.value || osn["Zaposleni"] || "",
        opis: "",
      };
      izlaz.write(JSON.stringify(zapis) + "\n");
      ok++;
      console.log(`[${ok}] ${slug.slice(0, 40).padEnd(42)} mb=${zapis.mb.padEnd(8)} adr=${zapis.adresa.slice(0, 22).padEnd(24)} tel=${zapis.telefon.slice(0, 16).padEnd(18)} web=${zapis.website.slice(0, 22)}`);
    } catch (e) {
      console.log(`GREŠKA ${slug}: ${e.message.slice(0, 60)}`);
    }
    await p.close();
    await new Promise((r) => setTimeout(r, 1500));
  }
  izlaz.end();
  console.log(`\nGotovo. Uspesno: ${ok}. Izlaz: ${IZLAZ}`);
  await browser.close();
}

glavna().catch((e) => { console.error(e.message); process.exit(1); });
