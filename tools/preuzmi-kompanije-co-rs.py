#!/usr/bin/env python3
"""
Preuzimač podataka sa kompanije.co.rs preko Wayback Machine (web.archive.org).

Zašto Wayback, a ne live sajt:
  - Live sajt (kompanije.co.rs) je iza Vercel Security Checkpoint-a (JS izazov,
    anti-bot). Običan HTTP klijent dobija 429. Zaobilaženje tog izazova
    headless browser-om je protiv namere zaštite i nosi rizik blokade IP-a.
  - Wayback Machine je javni arhiv — preuzimanje odatle je legalno i bezbedno.

Šta se preuzima: stranice firmi koje postoje u arhivu. Dva režima:
  --režim=novi   : snapshotovi iz 2026+ — NOVI sajt (APR+NBS podaci: MB, PIB,
                   adresa, telefon, email, website, finansije, AI opis).
  --režim=stari  : snapshotovi 2011–2018 — STARI Drupal imenik (samoprijavljeni
                   kontakti: adresa, tel, fax, email, web, kategorije).
Podrazumevano: novi.

Upotreba:
  python3 tools/preuzmi-kompanije-co-rs.py --režim=novi --limit=50
  python3 tools/preuzmi-kompanije-co-rs.py --režim=stari --od=0 --do=200
  python3 tools/preuzmi-kompanije-co-rs.py --režim=novi --sve     # sve što postoji

Nastavljiv: uvek piše u JSONL i preskače slugove koji su već uspešno obrađeni.

Izlaz:
  tools/data/kompanije-co-rs-{režim}.jsonl
"""

import argparse
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

CDX = "http://web.archive.org/cdx/search/cdx?url={u}&output=text&filter=statuscode:200&limit=1&from={od}&to={do}"
WB = "http://web.archive.org/web/{ts}id_/{u}"
KAZALO = Path(__file__).resolve().parent / "data"

SITEMAP_2024 = (
    "http://web.archive.org/web/20240705101642id_/https://kompanije.co.rs/sitemap.xml?page={p}"
)

NOVI_OD, NOVI_DO = "2026", "2026"
STARI_OD, STARI_DO = "2011", "2018"

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def get(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (research; polite)"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


# ---------------------------------------------------------------------------
# Parsiranje
# ---------------------------------------------------------------------------


def vidljiv_tekst(raw: str) -> list[str]:
    text = re.sub(r"<script[\s\S]*?</script>", " ", raw)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = html.unescape(text)
    return [l.strip() for l in text.splitlines() if l.strip()]


def parsiraj_novi(raw: str, lines: list[str]) -> dict:
    """Novi sajt (2026): polja iz 'Osnovni podaci' + finansije + AI opis."""
    d: dict = {"naziv": "", "mb": "", "pib": "", "adresa": "", "telefon": "",
               "email": "", "website": "", "zaposleni": "", "pravna_forma": "",
               "delatnost_sifra": "", "delatnost_naziv": "", "lokacija": "",
               "opis": "", "finansije": {}}
    # Ime iz H1 (pouzdanije od title-a).
    h1 = re.search(r"<h1[^>]*>([^<]+)</h1>", raw)
    if h1:
        d["naziv"] = html.unescape(h1.group(1)).strip()
    labels = {
        "Matični broj": "mb", "PIB": "pib", "Osnivanje": "osnivanje",
        "Zaposleni": "zaposleni", "Pravna forma": "pravna_forma",
        "Delatnost": "delatnost_sifra", "Lokacija": "lokacija",
        "Adresa": "adresa", "Website": "website", "Email": "email",
        "Telefon": "telefon",
    }
    for i, l in enumerate(lines):
        if l in labels and i + 1 < len(lines):
            v = lines[i + 1]
            if labels[l] == "delatnost_sifra":
                # "0125" sledi naziv u sledećem redu
                d["delatnost_sifra"] = v
                if i + 2 < len(lines) and not lines[i + 2].endswith(":"):
                    d["delatnost_naziv"] = lines[i + 2]
            else:
                d[labels[l]] = v
        elif l == "Opis kompanije" and i + 1 < len(lines):
            opis = []
            j = i + 1
            while j < len(lines) and not lines[j].endswith(":") and "Matični broj" not in lines[j]:
                opis.append(lines[j])
                j += 1
            d["opis"] = " ".join(opis)
    # finansije
    for i, l in enumerate(lines):
        m = re.match(r"^(Prihodi|Imovina|Kapital|Neto dobitak|Neto gubitak|Gubitak|Dobitak)\s*$", l)
        if m and i + 1 < len(lines):
            d["finansije"][m.group(1)] = lines[i + 1]
    return d


def parsiraj_stari(raw: str, lines: list[str]) -> dict:
    """Stari Drupal imenik: Mesto/Address/Tel/Fax/E-mail/Web/Kategorije."""
    d: dict = {"naziv": "", "mesto": "", "adresa": "", "tel": "", "fax": "",
               "email": "", "web": "", "kategorije": []}
    for i, l in enumerate(lines):
        if l == "Početna" and i + 1 < len(lines):
            d["naziv"] = lines[i + 1]
            break
    labels = {"Mesto:": "mesto", "Address:": "adresa", "Tel:": "tel",
              "Fax:": "fax", "E-mail:": "email", "Web:": "web"}
    for i, l in enumerate(lines):
        if l in labels and i + 1 < len(lines):
            d[labels[l]] = lines[i + 1]
        elif l == "Kategorije:":
            j = i + 1
            kats = []
            while j < len(lines) and not lines[j].endswith(":") \
                    and "users have voted" not in lines[j] and "reads" not in lines[j]:
                kats.append(lines[j])
                j += 1
            d["kategorije"] = kats[:30]
    return d


# ---------------------------------------------------------------------------
# Lista URL-ova
# ---------------------------------------------------------------------------


def lista_iz_sitemapa() -> list[str]:
    """16.7k slugova iz sitemapa 2024 (isti slug stil koristi i novi sajt)."""
    urls: list[str] = []
    for p in (1, 2):
        raw = get(SITEMAP_2024.format(p=p))
        urls += re.findall(r"<loc>(https://kompanije\.co\.rs/[^<]+)</loc>", raw)
        time.sleep(1.5)
    return sorted(set(urls))


def lista_2026_snapshotova() -> list[str]:
    """Svi URL-ovi koji imaju snapshot iz 2026 (novi sajt).

    Ako postoji cache sa timestampima (generisan iz kompletnog CDX izlistavanja),
    koristi njega — preskače pojedinačne CDX upite i duplo je brže.
    """
    cache = KAZALO / "kompanije-co-rs-snapshots-2026.tsv"
    if cache.exists():
        urls: list[str] = []
        for line in cache.read_text(encoding="utf-8").splitlines():
            u = line.split("\t", 1)[0].strip()
            if u:
                urls.append(u)
        return sorted(set(urls))

    urls: set[str] = set()
    for p in range(0, 20000, 5000):
        url = (f"http://web.archive.org/cdx/search/cdx?url=kompanije.co.rs*"
               f"&output=text&filter=statuscode:200&fl=original&from=2026&to=2026"
               f"&collapse=urlkey&limit=5000&offset={p}")
        raw = get(url, timeout=90)
        if not raw.strip():
            break
        for line in raw.splitlines():
            u = line.strip()
            if not (u.startswith("https://www.kompanije.co.rs/") or u.startswith("https://kompanije.co.rs/")):
                continue
            putanja = u.split(".rs/", 1)[1]
            if not putanja or putanja.endswith("/") or "/" in putanja:
                continue  # samo stranice firmi na vrhu (jedan segment, bez kosih crta)
            urls.add(u)
        if len(raw.splitlines()) < 5000:
            break
        time.sleep(2)
    return sorted(urls)


def timestamp_iz_cachea(url: str):
    """Najnoviji 2026 timestamp iz TSV cachea (url<TAB>ts)."""
    cache = KAZALO / "kompanije-co-rs-snapshots-2026.tsv"
    if not cache.exists():
        return None
    for line in cache.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0].strip() == url:
            return parts[1].strip()
    return None


# ---------------------------------------------------------------------------
# Glavni tok
# ---------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--režim", choices=["novi", "stari"], default="novi")
    ap.add_argument("--limit", type=int, default=0, help="maks. broj stranica (0 = sve)")
    ap.add_argument("--sve", action="store_true", help="preuzmi sve (isto kao bez --limit)")
    ap.add_argument("--od", type=int, default=0)
    ap.add_argument("--do", type=int, default=0)
    ap.add_argument("--odgoda", type=float, default=1.8, help="pauza između zahteva (s)")
    args = ap.parse_args()

    KAZALO.mkdir(parents=True, exist_ok=True)
    izlaz = KAZALO / f"kompanije-co-rs-{args.režim}.jsonl"

    # skupljanje ciljnih URL-ova
    if args.režim == "novi":
        print("Prikupljam listu URL-ova sa snapshotom 2026…")
        urls = lista_2026_snapshotova()
        od, do, parsiraj = NOVI_OD, NOVI_DO, parsiraj_novi
    else:
        print("Prikupljam listu iz sitemapa 2024…")
        urls = lista_iz_sitemapa()
        od, do, parsiraj = STARI_OD, STARI_DO, parsiraj_stari

    urls = urls[args.od: args.do if args.do else len(urls)]
    if args.limit:
        urls = urls[: args.limit]
    print(f"Ciljnih URL-ova: {len(urls)}")

    # nastavljivost: već obrađeni slugovi
    gotovi: set[str] = set()
    if izlaz.exists():
        for line in izlaz.read_text(encoding="utf-8").splitlines():
            try:
                gotovi.add(json.loads(line)["slug"])
            except Exception:
                pass

    obradjeno = 0
    uspeh = 0
    with izlaz.open("a", encoding="utf-8") as f:
        for u in urls:
            slug = u.split("/")[-1]
            if slug in gotovi:
                continue
            obradjeno += 1
            try:
                # timestamp iz cachea (kada postoji) ili CDX upit
                ts = timestamp_iz_cachea(u) if args.režim == "novi" else None
                if ts is None:
                    cdx = get(CDX.format(u=u, od=od, do=do), timeout=40)
                    if not cdx.strip():
                        time.sleep(args.odgoda)
                        continue
                    ts = cdx.split()[1]
                raw = get(WB.format(ts=ts, u=u))
                data = parsiraj(raw, vidljiv_tekst(raw))
                data["slug"] = slug
                data["url"] = u
                data["snapshot"] = ts
                f.write(json.dumps(data, ensure_ascii=False) + "\n")
                f.flush()
                uspeh += 1
                print(f"[{uspeh}] {slug[:45]:45s} "
                      f"adr={data.get('adresa','')[:22]:22s} "
                      f"tel={data.get('telefon', data.get('tel',''))[:16]:16s} "
                      f"web={data.get('website', data.get('web',''))[:20]:20s}")
            except Exception as e:
                print(f"GREŠKA {slug[:45]:45s} {str(e)[:60]}", file=sys.stderr)
            time.sleep(args.odgoda)

    print(f"\nGotovo. Obrađeno: {obradjeno}, uspešno: {uspeh}. Izlaz: {izlaz}")


if __name__ == "__main__":
    main()
