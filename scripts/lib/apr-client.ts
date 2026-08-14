import https from "node:https";
import tls from "node:tls";
import path from "node:path";
import { createWriteStream, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import type { ClientRequest, IncomingMessage } from "node:http";

const OSNOVA = "https://openapi.apr.gov.rs/api/opendata";
const TIMEOUT_MS = 120_000;
const POKUSAJA = 3;

export const APR_ENDPOINTI = [
  { kljuc: "companies" as const, url: `${OSNOVA}/companies`, imeFajla: "companies.json" },
  {
    kljuc: "financial-statements" as const,
    url: `${OSNOVA}/companies/financial-statements`,
    imeFajla: "financial-statements.json",
  },
  { kljuc: "ngo" as const, url: `${OSNOVA}/ngo`, imeFajla: "ngo.json" },
];

// Skripte se pokreću iz korena repoa, pa je cwd pouzdan koren za putanje.
const PEM = readFileSync(
  path.join(process.cwd(), "scripts/certs/sectigo-intermediate.pem"),
  "utf8",
);

/**
 * APR ne šalje intermediate sertifikat, pa se on dodaje u lanac ručno.
 * rejectUnauthorized ostaje uključen; provera se nikad ne isključuje.
 */
const agent = new https.Agent({ ca: [...tls.rootCertificates, PEM] });

function pauza(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function saPonavljanjem<T>(opis: string, posao: () => Promise<T>): Promise<T> {
  let poslednja: unknown;

  for (let pokusaj = 1; pokusaj <= POKUSAJA; pokusaj++) {
    try {
      return await posao();
    } catch (greska) {
      poslednja = greska;
      const poruka = greska instanceof Error ? greska.message : String(greska);

      if (poruka.includes("UNABLE_TO_VERIFY") || poruka.includes("CERT")) {
        throw new Error(
          `TLS greška pri ${opis}: ${poruka}\n` +
            "Proveri scripts/certs/sectigo-intermediate.pem, vidi scripts/certs/README.md.",
        );
      }

      if (pokusaj < POKUSAJA) {
        const cekanje = 1000 * 4 ** (pokusaj - 1); // 1 s, pa 4 s
        console.warn(`  ${opis}: pokušaj ${pokusaj} pao (${poruka}), ponavljam za ${cekanje} ms`);
        await pauza(cekanje);
      }
    }
  }

  throw new Error(
    `${opis} nije uspelo posle ${POKUSAJA} pokušaja: ` +
      (poslednja instanceof Error ? poslednja.message : String(poslednja)),
  );
}

function zahtev(url: string, naOdgovor: (r: IncomingMessage) => void): ClientRequest {
  const req = https.get(url, { agent }, naOdgovor);
  req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`timeout posle ${TIMEOUT_MS} ms`)));
  return req;
}

/**
 * Čita DatumPreseka iz prvog chunka pa ruši konekciju.
 * Server ne poštuje Range i ne šalje Content-Length, ali DatumPreseka je prvi
 * ključ u odgovoru, pa je izmereno dovoljno oko 8 KB.
 */
export function procitajDatumPreseka(url: string): Promise<string> {
  return saPonavljanjem(`čitanje DatumPreseka sa ${url}`, () => {
    return new Promise<string>((resolve, reject) => {
      let zavrseno = false;
      const zavrsi = (fn: () => void) => {
        if (!zavrseno) {
          zavrseno = true;
          fn();
        }
      };

      // Postavlja se neposredno pre našeg req.destroy(), da error handler zna
      // da je ECONNRESET koji sledi naša namerna posledica, a ne greška veze.
      let namernoPrekinuto = false;

      const req = zahtev(url, (odgovor) => {
        if (odgovor.statusCode !== 200) {
          odgovor.destroy();
          zavrsi(() => reject(new Error(`HTTP ${odgovor.statusCode}`)));
          return;
        }

        let bafer = "";
        odgovor.on("data", (deo: Buffer) => {
          bafer += deo.toString("utf8");
          const nadjeno = bafer.match(/"DatumPreseka"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);

          if (nadjeno) {
            namernoPrekinuto = true;
            req.destroy();
            zavrsi(() => resolve(nadjeno[1]));
          } else if (bafer.length > 4096) {
            namernoPrekinuto = true;
            req.destroy();
            zavrsi(() => reject(new Error("DatumPreseka nije u prva 4 KB odgovora")));
          }
        });

        odgovor.on("end", () => zavrsi(() => reject(new Error("odgovor gotov bez DatumPreseka"))));
      });

      // ECONNRESET se guta samo ako je posledica našeg namernog destroy() posle
      // pronalaska datuma. Svaki drugi ECONNRESET (npr. pravi prekid veze pre
      // nego što je datum pronađen) mora da odbaci promise, inače ponavljanje
      // u saPonavljanjem nikad ne dobija priliku da radi i promise visi zauvek.
      req.on("error", (greska: NodeJS.ErrnoException) => {
        if (namernoPrekinuto && greska.code === "ECONNRESET") return;
        zavrsi(() => reject(greska));
      });
    });
  });
}

/** Skida ceo odgovor u fajl. Vraća broj upisanih bajtova. */
export function preuzmiUFajl(url: string, odrediste: string): Promise<number> {
  return saPonavljanjem(`preuzimanje ${url}`, () => {
    return new Promise<number>((resolve, reject) => {
      let zavrseno = false;
      const zavrsi = (fn: () => void) => {
        if (!zavrseno) {
          zavrseno = true;
          fn();
        }
      };

      // Piše se u fajl koji možda ima nepotpun sadržaj ako preuzimanje ne
      // uspe do kraja (mreža, timeout, pravi ECONNRESET). Takav fajl mora da
      // se ukloni pre odbacivanja promisa, jer je 32-57 MB nevažeći JSON koji
      // kasnija obrada ne sme da nasledi.
      const naGresku = (greska: Error) => {
        zavrsi(() => {
          izlaz.destroy();
          unlink(odrediste).catch(() => {
            // Best effort: neuspeh brisanja ne sme da sakrije originalnu grešku.
          });
          reject(greska);
        });
      };

      // Stream za pisanje se pravi sinhrono, pre nego što je zahtev uopšte
      // poslat, pa error handler mora da postoji odmah - ako se prikači tek
      // u odgovoru na HTTP, greška poput ENOENT (nepostojeći direktorijum)
      // stigne pre nego što ijedan listener postoji i postaje neuhvaćen izuzetak.
      const izlaz = createWriteStream(odrediste);
      izlaz.on("error", naGresku);

      let bajtova = 0;

      const req = zahtev(url, (odgovor) => {
        if (odgovor.statusCode !== 200) {
          odgovor.destroy();
          naGresku(new Error(`HTTP ${odgovor.statusCode}`));
          return;
        }

        odgovor.on("data", (deo: Buffer) => {
          bajtova += deo.length;
        });
        odgovor.pipe(izlaz);

        izlaz.on("finish", () => zavrsi(() => resolve(bajtova)));
        odgovor.on("error", naGresku);
      });

      req.on("error", naGresku);
    });
  });
}
