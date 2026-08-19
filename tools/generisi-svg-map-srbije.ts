/**
 * Generiše `lib/geo/srbija-okruzi.ts` — SVG putanje okruga Srbije za choropleth mapu.
 *
 * Izvor: geoBoundaries SRB ADM1 (nivo okruga), licence:
 *   Open Data Commons Open Database License 1.0 (ODbL), © OpenStreetMap contributors.
 * URL izvora: https://www.geoboundaries.org/api/current/gbOpen/SRB/ADM1/
 *
 * Postupak:
 *   1. skine GeoJSON (25 jedinica: 24 okruga + Grad Beograd; Kosovo nije pokriveno),
 *   2. projektuje koordinate (ekvidistantna projekcija sa standardnom paralelom ~44.2°),
 *   3. pojednostavi prstenove Douglas-Peucker algoritmom (bez biblioteka),
 *   4. upiše TS modul sa `d` putanjama ključanim po shapeISO (RS-00 … RS-24).
 *
 * Pokretanje:  npx tsx tools/generisi-svg-map-srbije.ts
 * Rezultat se komituje — generator se poziva samo kad se menja izvor mape.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const URL_IZVORA =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SRB/ADM1/geoBoundaries-SRB-ADM1_simplified.geojson";

const IZLAZ = join(import.meta.dirname, "..", "lib", "geo", "srbija-okruzi.ts");

/** Ekvidistantna projekcija; x korigovan kosinusom srednje geografske širine Srbije. */
const LAT_STD = 44.2;
function proj([lon, lat]: [number, number]): [number, number] {
  const x = (lon - 19.0) * Math.cos((LAT_STD * Math.PI) / 180);
  const y = -(lat - 46.2);
  return [x, y];
}

/** Douglas-Peucker; epsilon u jedinicama projekcije (≈ stepeni). */
function pojednostavi(prsten: [number, number][], epsilon: number): [number, number][] {
  if (prsten.length <= 3) return prsten;
  const rastojanje = (p: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const duz2 = dx * dx + dy * dy;
    if (duz2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / duz2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const rez: [number, number][] = [];
  const stek: Array<[number, number]> = [[0, prsten.length - 1]];
  const cuvaj = new Set<number>([0, prsten.length - 1]);
  while (stek.length) {
    const [a, b] = stek.pop()!;
    let maxD = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const d = rastojanje(prsten[i], prsten[a], prsten[b]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon) {
      cuvaj.add(maxI);
      stek.push([a, maxI], [maxI, b]);
    }
  }
  for (const i of [...cuvaj].sort((x, y) => x - y)) rez.push(prsten[i]);
  return rez;
}

type Ring = [number, number][];

/** GeoJSON ring → SVG podputanja (M…L…Z). */
function ringUPutanju(ring: Ring): string {
  const tacno = pojednostavi(ring, 0.006);
  // Skini duplikate uzastopnih tačaka (ostatak originalnog ringa).
  const bezDuplikata: Ring = [];
  for (const t of tacno) {
    const poslednja = bezDuplikata[bezDuplikata.length - 1];
    if (!poslednja || poslednja[0] !== t[0] || poslednja[1] !== t[1]) bezDuplikata.push(t);
  }
  const bezZatvaranja =
    bezDuplikata.length > 1 &&
    bezDuplikata[bezDuplikata.length - 1][0] === bezDuplikata[0][0] &&
    bezDuplikata[bezDuplikata.length - 1][1] === bezDuplikata[0][1]
      ? bezDuplikata.slice(0, -1)
      : bezDuplikata;
  const delovi = bezZatvaranja.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`);
  return `M${delovi.join("L")}Z`;
}

type Geometrija = { iso: string; d: string; tacke: number };

async function main() {
  console.log("Skidam GeoJSON…", URL_IZVORA);
  const odgovor = await fetch(URL_IZVORA);
  if (!odgovor.ok) throw new Error(`HTTP ${odgovor.status}`);
  const kolekcija = (await odgovor.json()) as {
    features: Array<{
      properties: { shapeISO: string };
      geometry: {
        type: "Polygon" | "MultiPolygon";
        coordinates: number[][][][] | number[][][];
      };
    }>;
  };

  const izlazi: Geometrija[] = [];
  let ukupnoTacaka = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const f of kolekcija.features) {
    const poligoni = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    const podputanje: string[] = [];
    let tacke = 0;
    for (const poligon of poligoni) {
      for (const prsten of poligon) {
        const projRing = prsten.map(([lon, lat]) => proj([lon, lat])) as Ring;
        for (const [x, y] of projRing) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        const putanja = ringUPutanju(projRing);
        tacke += putanja.length;
        podputanje.push(putanja);
      }
    }
    ukupnoTacaka += tacke;
    izlazi.push({ iso: f.properties.shapeISO, d: podputanje.join(""), tacke });
  }

  // Uklapanje u viewBox 0 0 1000 1000* (srazmerno), sa 2% margine.
  const sirina = maxX - minX;
  const visina = maxY - minY;
  const razmera = 1000 / Math.max(sirina, visina);
  const margina = 0.02 * 1000;
  const viewBox = [
    ((minX - (sirina * margina) / 1000) * razmera).toFixed(1),
    ((minY - (visina * margina) / 1000) * razmera).toFixed(1),
    ((sirina + (2 * sirina * margina) / 1000) * razmera).toFixed(1),
    ((visina + (2 * visina * margina) / 1000) * razmera).toFixed(1),
  ].join(" ");

  // Primeni razmeru na putanje (zaokruži na 2 decimale).
  const skalirano = izlazi.map((g) => ({
    iso: g.iso,
    d: g.d
      .replace(/(-?\d+\.\d+) (-?\d+\.\d+)/g, (_, x: string, y: string) => `${(parseFloat(x) * razmera).toFixed(2)} ${(parseFloat(y) * razmera).toFixed(2)}`),
  }));

  const sadrzaj = `// GENERISANO — ne menjati ručno. Pokretanje: npx tsx tools/generisi-svg-map-srbije.ts
// Izvor: geoBoundaries SRB ADM1 (ODbL), © OpenStreetMap contributors.
// https://www.geoboundaries.org/api/current/gbOpen/SRB/ADM1/
// 25 jedinica (24 okruga + Grad Beograd). Kosovo i Metohija nisu pokriveni izvorom.

export type OkrugGeometrija = { iso: string; d: string };

/** viewBox za <svg>; putanje su već skalirane u te koordinate. */
export const VIEW_BOX = "${viewBox}";

export const SRBIJA_OKRUZI: OkrugGeometrija[] = [
${skalirano.map((g) => `  { iso: "${g.iso}", d: "${g.d}" },`).join("\n")}
];
`;

  mkdirSync(dirname(IZLAZ), { recursive: true });
  writeFileSync(IZLAZ, sadrzaj, "utf8");
  console.log(`Upisano: ${IZLAZ}`);
  console.log(`viewBox: ${viewBox} | jedinica: ${izlazi.length} | tačaka (pre skaliranja): ${ukupnoTacaka}`);
  for (const g of izlazi) console.log(`  ${g.iso}: ${g.tacke} tačaka`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
