# Ingest pipeline, plan implementacije

> **Za agentske izvršioce:** OBAVEZNA POD-VEŠTINA: koristi `superpowers:subagent-driven-development`
> (preporučeno) ili `superpowers:executing-plans` za izvršavanje zadatak po zadatak.
> Koraci koriste `- [ ]` sintaksu radi praćenja.

**Cilj:** Skripta `scripts/ingest.ts` koja povlači APR open data, normalizuje ga,
upisuje u Supabase, arhivira presek u Storage i osvežava materijalizovane view-ove.

**Arhitektura:** Čiste funkcije za normalizaciju idu u `lib/` jer ih deli i pretraga
iz Sesije 5. Ingest je tanak orkestrator nad četiri modula bez međuzavisnosti:
mrežni klijent, arhiviranje, mapiranje i upis. Mapiranje nema I/O pa se testira bez
mreže i baze.

**Stek:** TypeScript strict, `tsx` za pokretanje, `vitest` za testove,
`@supabase/supabase-js`, `node:https` sa eksplicitnim CA lancem.

**Spec:** `docs/superpowers/specs/2026-08-14-ingest-pipeline-design.md`

## Globalna ograničenja

- Šema baze je **zaključana**. Nijedan zadatak ne dodaje kolonu, tabelu ni migraciju.
- Novčane vrednosti se čuvaju **u hiljadama dinara**, tačno kako stižu. Množenje sa
  1000 je posao UI sloja i ovde se ne radi.
- Jezik svega vidljivog i svih poruka: **srpski, latinica**.
- `rejectUnauthorized: false` se **ne sme** pojaviti nigde.
- **Upsert, nikad delete pa insert.** Jedini dozvoljen `delete` je nad
  `financials_history`, i to samo za `datum_preseka` koji se upravo upisuje.
  Radi se pri svakom ingestu, ne samo uz `--force`: red u `snapshots` se piše
  tek na kraju, pa bi prekid u pola upisa istorije doveo do udvajanja pri
  sledećem pokretanju.
- Slug se **zamrzava** pri prvom upisu i kasniji ingest ga ne menja.
- `poslovno_ime` za prikaz ostaje **originalno**, uključujući ćirilicu.
- Skripte se pokreću iz korena repoa; putanje do fajlova se grade iz `process.cwd()`.
- `.env.local` se nikad ne komituje.

---

### Zadatak 1: Alati i transliteracija

**Fajlovi:**
- Izmeni: `package.json`
- Kreiraj: `vitest.config.mts`
- Kreiraj: `lib/transliterate.ts`
- Test: `tests/transliterate.test.ts`

**Interfejsi:**
- Proizvodi: `cirilicaULatinicu(tekst: string): string`

- [ ] **Korak 1: Instaliraj alate**

```bash
npm install -D tsx vitest
```

- [ ] **Korak 2: Dodaj skripte u package.json**

U `"scripts"` blok dodaj tri stavke:

```json
    "test": "vitest run",
    "ingest": "node --max-old-space-size=4096 --import tsx scripts/ingest.ts",
    "seed": "tsx scripts/seed-sifarnici.ts"
```

- [ ] **Korak 3: Napravi vitest.config.mts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integracioni testovi čitaju 133k redova kroz stranice od po 1000,
    // što je preko 130 zahteva po testu. 30 s ne bi bilo dovoljno.
    testTimeout: 120_000,
  },
});
```

- [ ] **Korak 4: Napiši test koji pada**

`tests/transliterate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cirilicaULatinicu } from "../lib/transliterate";

describe("cirilicaULatinicu", () => {
  it("prevodi osnovna slova", () => {
    expect(cirilicaULatinicu("КРУШЕВАЦ")).toBe("KRUŠEVAC");
    expect(cirilicaULatinicu("Београд")).toBe("Beograd");
  });

  it("prevodi sva srpska specifična slova", () => {
    expect(cirilicaULatinicu("ђжћчш")).toBe("đžćčš");
    expect(cirilicaULatinicu("ЂЖЋЧШ")).toBe("ĐŽĆČŠ");
  });

  it("digrafe piše velikim slovima kad je cela reč velikim", () => {
    expect(cirilicaULatinicu("ЉУБОВИЈА")).toBe("LJUBOVIJA");
    expect(cirilicaULatinicu("ЊЕГОШ")).toBe("NJEGOŠ");
    expect(cirilicaULatinicu("ЏАМИЈА")).toBe("DŽAMIJA");
  });

  it("digrafe piše sa malim drugim slovom kad sledi malo slovo", () => {
    expect(cirilicaULatinicu("Љубовија")).toBe("Ljubovija");
    expect(cirilicaULatinicu("Његош")).toBe("Njegoš");
  });

  it("digrafe na kraju velike reči piše velikim", () => {
    // Četiri stvarne opštine iz APR seta. Gledanje samo sledećeg znaka
    // dalo bi ŽABALj, jer posle Љ stoji kraj stringa, a ne veliko slovo.
    expect(cirilicaULatinicu("ЖАБАЉ")).toBe("ŽABALJ");
    expect(cirilicaULatinicu("КРУПАЊ")).toBe("KRUPANJ");
    expect(cirilicaULatinicu("РАЖАЊ")).toBe("RAŽANJ");
    expect(cirilicaULatinicu("СЕЧАЊ")).toBe("SEČANJ");
    expect(cirilicaULatinicu("ДОО КОДЕКС ЖАБАЉ")).toBe("DOO KODEKS ŽABALJ");
  });

  it("ostavlja latinicu, cifre i interpunkciju netaknute", () => {
    expect(cirilicaULatinicu("DOO Beograd-2024")).toBe("DOO Beograd-2024");
    expect(cirilicaULatinicu("МЕШАНО doo")).toBe("MEŠANO doo");
  });

  it("podnosi prazan ulaz", () => {
    expect(cirilicaULatinicu("")).toBe("");
  });
});
```

- [ ] **Korak 5: Pusti test i potvrdi da pada**

```bash
npx vitest run tests/transliterate.test.ts
```

Očekivano: FAIL, `Failed to resolve import "../lib/transliterate"`.

- [ ] **Korak 6: Napiši lib/transliterate.ts**

```ts
/**
 * Transliteracija srpske ćirilice u latinicu.
 *
 * Eksplicitna mapa, ne biblioteka koja gađa. Nazivi opština i pravnih formi iz
 * APR-a stižu isključivo ćirilicom, a 10.602 poslovna imena takođe.
 */

const MAPA: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Ђ: "Đ", Е: "E", Ж: "Ž", З: "Z",
  И: "I", Ј: "J", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R",
  С: "S", Т: "T", Ћ: "Ć", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "Č", Ш: "Š",
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z",
  и: "i", ј: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", ш: "š",
};

/** Digrafi se pišu velikim ili mešovito, zavisno od susednih slova. */
const DIGRAFI: Record<string, [string, string]> = {
  Љ: ["LJ", "Lj"], Њ: ["NJ", "Nj"], Џ: ["DŽ", "Dž"],
  љ: ["lj", "lj"], њ: ["nj", "nj"], џ: ["dž", "dž"],
};

/**
 * Tačno je veliko ćirilično slovo. Opseg А-Ш ne pokriva Ђ, Ј, Љ, Њ, Ћ i Џ,
 * jer oni u Unicode tabeli stoje ispred А, pa se navode posebno.
 */
function jeVelikoCirilicno(znak: string | undefined): boolean {
  return znak !== undefined && /[А-ШЂЈЉЊЋЏ]/.test(znak);
}

export function cirilicaULatinicu(tekst: string): string {
  let rezultat = "";

  for (let i = 0; i < tekst.length; i++) {
    const znak = tekst[i];
    const digraf = DIGRAFI[znak];

    if (digraf) {
      // Veliki oblik ako je prethodno ILI sledeće slovo veliko ćirilično.
      // ЉУБОВИЈА -> LJUBOVIJA, Љубовија -> Ljubovija, ЖАБАЉ -> ŽABALJ.
      // Gledanje samo unapred bi dalo ŽABALj, a Žabalj, Krupanj, Ražanj i
      // Sečanj su stvarne opštine u setu, uz još 72 poslovna imena.
      const prethodno = i > 0 ? tekst[i - 1] : undefined;
      const sledece = tekst[i + 1];
      const veliki = jeVelikoCirilicno(prethodno) || jeVelikoCirilicno(sledece);
      rezultat += veliki ? digraf[0] : digraf[1];
      continue;
    }

    rezultat += MAPA[znak] ?? znak;
  }

  return rezultat;
}
```

- [ ] **Korak 7: Pusti test i potvrdi da prolazi**

```bash
npx vitest run tests/transliterate.test.ts
```

Očekivano: PASS, 7 testova.

- [ ] **Korak 8: Commit**

```bash
git add package.json package-lock.json vitest.config.mts lib/transliterate.ts tests/transliterate.test.ts
git commit -m "Dodaj vitest i tsx, transliteraciju cirilice u latinicu"
```

---

### Zadatak 2: Normalizacija imena, sluga i datuma

**Fajlovi:**
- Kreiraj: `lib/normalize.ts`
- Test: `tests/normalize.test.ts`

**Interfejsi:**
- Koristi: `cirilicaULatinicu` iz Zadatka 1
- Proizvodi:
  - `trimMb(vrednost: string): string | null`
  - `normalizeIme(ime: string): string`
  - `slugify(ime: string, maticniBroj: string): string`
  - `parseDatum(vrednost: unknown): string | null`

- [ ] **Korak 1: Napiši test koji pada**

`tests/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeIme, parseDatum, slugify, trimMb } from "../lib/normalize";

describe("trimMb", () => {
  it("skida razmake sa oba kraja", () => {
    // 11.099 kljuceva u FI setu ima razmak na kraju
    expect(trimMb("21436046 ")).toBe("21436046");
    expect(trimMb("  21436046  ")).toBe("21436046");
  });

  it("vraca null za sve sto nije osam cifara", () => {
    expect(trimMb("")).toBeNull();
    expect(trimMb("   ")).toBeNull();
    expect(trimMb("1234567")).toBeNull();
    expect(trimMb("123456789")).toBeNull();
    expect(trimMb("1234567X")).toBeNull();
  });

  it("cuva vodece nule", () => {
    expect(trimMb("01234567")).toBe("01234567");
  });
});

describe("normalizeIme", () => {
  it("spusta na mala slova i skida interpunkciju", () => {
    expect(normalizeIme("LJUBA-PROMET DOO, KRUŠEVAC")).toBe("ljuba promet doo krusevac");
  });

  it("prevodi srpska slova u ascii", () => {
    expect(normalizeIme("ČAČAK ĆUPRIJA ŠABAC ŽITIŠTE ĐAKOVICA")).toBe(
      "cacak cuprija sabac zitiste djakovica",
    );
  });

  it("transliterise cirilicna imena", () => {
    expect(normalizeIme("ПРЕДУЗЕЋЕ ЉУБА")).toBe("preduzece ljuba");
  });

  it("sazima visestruke razmake", () => {
    expect(normalizeIme("A   B")).toBe("a b");
    expect(normalizeIme("  A  ")).toBe("a");
  });

  it("nikad ne vraca velika slova ni interpunkciju", () => {
    const rezultat = normalizeIme("D.O.O. \"TEST\" & CO., 2024!");
    expect(rezultat).toBe(rezultat.toLowerCase());
    expect(rezultat).toMatch(/^[a-z0-9 ]*$/);
  });
});

describe("slugify", () => {
  it("gradi slug od imena i maticnog broja", () => {
    expect(slugify("LJUBA-PROMET DOO", "17246771")).toBe("ljuba-promet-doo-17246771");
  });

  it("prevodi srpska slova u ascii", () => {
    expect(slugify("ČAČAK ĐAK", "12345678")).toBe("cacak-djak-12345678");
  });

  it("sazima visestruke crtice i skida ivicne", () => {
    expect(slugify("  --A -- B--  ", "12345678")).toBe("a-b-12345678");
  });

  it("skracuje osnovu na 80 znakova pre maticnog broja", () => {
    const dugacko = "A".repeat(200);
    const slug = slugify(dugacko, "12345678");
    const osnova = slug.slice(0, slug.lastIndexOf("-"));
    expect(osnova.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-12345678")).toBe(true);
  });

  it("ne ostavlja crticu na spoju posle skracivanja", () => {
    // 80. znak pada tacno na razmak, pa bi naivno secenje dalo dve crtice
    const ime = `${"A".repeat(80)} BBB`;
    expect(slugify(ime, "12345678")).not.toContain("--");
  });

  it("vraca samo maticni broj kad od imena ne ostane nista", () => {
    expect(slugify("!!!", "12345678")).toBe("12345678");
  });

  it("transliterise cirilicna imena umesto da ih obrise", () => {
    expect(slugify("ЉУБА ПРОМЕТ", "17246771")).toBe("ljuba-promet-17246771");
  });
});

describe("parseDatum", () => {
  it("prihvata ISO datum", () => {
    expect(parseDatum("1994-06-30")).toBe("1994-06-30");
  });

  it("odbija nepostojeci datum", () => {
    expect(parseDatum("2026-02-31")).toBeNull();
    expect(parseDatum("2026-13-01")).toBeNull();
  });

  it("odbija sve sto nije ISO string", () => {
    expect(parseDatum("30.06.1994")).toBeNull();
    expect(parseDatum(null)).toBeNull();
    expect(parseDatum(19940630)).toBeNull();
    expect(parseDatum("")).toBeNull();
  });
});
```

- [ ] **Korak 2: Pusti test i potvrdi da pada**

```bash
npx vitest run tests/normalize.test.ts
```

Očekivano: FAIL, `Failed to resolve import "../lib/normalize"`.

- [ ] **Korak 3: Napiši lib/normalize.ts**

```ts
import { cirilicaULatinicu } from "./transliterate";

/** Srpska latinična slova u ASCII, po pravilu 2 iz CLAUDE.md. */
const U_ASCII: Record<string, string> = {
  č: "c", ć: "c", š: "s", ž: "z", đ: "dj",
};

const MAX_OSNOVA = 80;

function uAscii(tekst: string): string {
  return cirilicaULatinicu(tekst)
    .toLowerCase()
    .replace(/[čćšžđ]/g, (znak) => U_ASCII[znak]);
}

/**
 * Matični broj iz APR ključa. U financial-statements setu 11.099 ključeva ima
 * razmak na kraju, pa se trimuje pre svake druge obrade.
 * Vraća null za sve što nije tačno osam cifara.
 */
export function trimMb(vrednost: string): string | null {
  const ocisceno = String(vrednost ?? "").trim();
  return /^\d{8}$/.test(ocisceno) ? ocisceno : null;
}

/** Ime za pg_trgm pretragu: mala slova, ASCII, bez interpunkcije. */
export function normalizeIme(ime: string): string {
  return uAscii(String(ime ?? ""))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** slug = slugify(poslovno_ime) + "-" + maticni_broj, osnova najviše 80 znakova. */
export function slugify(ime: string, maticniBroj: string): string {
  const osnova = uAscii(String(ime ?? ""))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_OSNOVA)
    .replace(/-+$/, ""); // sečenje na 80 može da ostavi crticu na kraju

  return osnova ? `${osnova}-${maticniBroj}` : maticniBroj;
}

/** APR šalje 100% ISO datuma, ali se svejedno proverava da datum stvarno postoji. */
export function parseDatum(vrednost: unknown): string | null {
  if (typeof vrednost !== "string") return null;

  const ocisceno = vrednost.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ocisceno)) return null;

  // toISOString vraća isti string samo ako datum stvarno postoji (2026-02-31 ne)
  const datum = new Date(`${ocisceno}T00:00:00.000Z`);
  if (Number.isNaN(datum.getTime())) return null;

  return datum.toISOString().slice(0, 10) === ocisceno ? ocisceno : null;
}
```

- [ ] **Korak 4: Pusti test i potvrdi da prolazi**

```bash
npx vitest run tests/normalize.test.ts
```

Očekivano: PASS, 18 testova.

- [ ] **Korak 5: Commit**

```bash
git add lib/normalize.ts tests/normalize.test.ts
git commit -m "Normalizacija maticnog broja, imena, sluga i datuma"
```

---

### Zadatak 3: APR klijent sa CA lancem

**Fajlovi:**
- Izmeni: `.gitignore`
- Kreiraj: `scripts/certs/sectigo-intermediate.pem`
- Kreiraj: `scripts/certs/README.md`
- Kreiraj: `scripts/lib/apr-client.ts`

**Interfejsi:**
- Proizvodi:
  - `APR_ENDPOINTI: { kljuc: "companies" | "financial-statements" | "ngo"; url: string; imeFajla: string }[]`
  - `procitajDatumPreseka(url: string): Promise<string>`
  - `preuzmiUFajl(url: string, odrediste: string): Promise<number>` (vraća broj bajtova)

- [ ] **Korak 1: Oslobodi sertifikat iz .gitignore**

`.gitignore` sadrži `*.pem`, pa bi se sertifikat **tiho preskočio** pri `git add` i
ingest bi radio lokalno a pucao na CI-ju. Dodaj izuzetak odmah ispod linije `*.pem`:

```
# intermediate sertifikat za APR, mora u repo (vidi scripts/certs/README.md)
!scripts/certs/*.pem
```

Posle Koraka 2 proveri da izuzetak stvarno radi:

```bash
git check-ignore -v scripts/certs/sectigo-intermediate.pem; echo "exit: $?"
```

Očekivano: `exit: 1`, bez ispisa. Ako ispiše pravilo iz `.gitignore`, izuzetak nije uhvatio.

- [ ] **Korak 2: Skini i konvertuj intermediate sertifikat**

```bash
mkdir -p scripts/certs
curl -sSL -o /tmp/sectigo.crt "http://crt.sectigo.com/SSL2BUYEMEARSADomainValidationSecureServerCA.crt"
openssl x509 -inform DER -in /tmp/sectigo.crt -out scripts/certs/sectigo-intermediate.pem
openssl x509 -in scripts/certs/sectigo-intermediate.pem -noout -subject -issuer
```

Očekivano:
```
subject= /C=AE/O=SSL2BUY EMEA LLC/CN=SSL2BUY EMEA RSA Domain Validation Secure Server CA
issuer= /C=GB/O=Sectigo Limited/CN=Sectigo Public Server Authentication Root R46
```

- [ ] **Korak 3: Dokumentuj poreklo sertifikata**

`scripts/certs/README.md`:

```markdown
# Sertifikati

`sectigo-intermediate.pem` je intermediate sertifikat za `openapi.apr.gov.rs`.

APR server šalje samo leaf sertifikat (`CN=*.apr.gov.rs`) i ne šalje intermediate,
pa Node puca sa `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. `curl` prolazi zato što sam
dovlači intermediate preko AIA ekstenzije; Node to ne radi.

Izvor:
`http://crt.sectigo.com/SSL2BUYEMEARSADomainValidationSecureServerCA.crt`

Konverzija iz DER u PEM:

    openssl x509 -inform DER -in sectigo.crt -out sectigo-intermediate.pem

Koren lanca (`Sectigo Public Server Authentication Root R46`) već postoji u Node-ovom
ugrađenom spisku, pa se dodaje samo ovaj jedan sertifikat.

Ako sertifikat istekne, ingest pada sa jasnom TLS porukom. Tada se skida novi sa iste
adrese. **Nikad se ne rešava sa `rejectUnauthorized: false`.**
```

- [ ] **Korak 4: Napiši scripts/lib/apr-client.ts**

```ts
import https from "node:https";
import tls from "node:tls";
import path from "node:path";
import { createWriteStream, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
// ClientRequest se uvozi iz node:http; https ga ne izvozi kao tip.
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
          // I zahtev mora da se prekine, ne samo stream. Ako padne pisanje pre
          // nego što odgovor stigne, https.get i dalje radi, a veza bi visila
          // do isteka od 120 s. Uz ponavljanje na 1 s i 4 s to bi značilo tri
          // otvorene veze prema APR-u u isto vreme. destroy() je idempotentan.
          req.destroy();
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
```

- [ ] **Korak 5: Proveri klijent nad živim API-jem**

Provera ide kroz privremeni fajl u korenu repoa, jer relativni uvoz mora da se
razrešava iz korena. Fajl se briše odmah posle.

Ekstenzija je `.mts`, ne `.ts`: `package.json` nema `"type": "module"`, pa `tsx`
tretira `.ts` kao CommonJS i top-level `await` puca. Isto važi za svaku
privremenu skriptu u ovom planu.

```bash
cat > provera-tls.mts <<'TS'
import { APR_ENDPOINTI, procitajDatumPreseka } from "./scripts/lib/apr-client";

for (const endpoint of APR_ENDPOINTI) {
  console.log(endpoint.kljuc, await procitajDatumPreseka(endpoint.url));
}
TS
npx tsx provera-tls.mts; rm provera-tls.mts
```

Očekivano: tri reda sa datumom oblika `2026-07-31`, gotovo za par sekundi.
Ako izađe TLS greška, sertifikat iz Koraka 2 nije na mestu.

- [ ] **Korak 6: Commit**

```bash
git add .gitignore scripts/certs scripts/lib/apr-client.ts
git commit -m "APR klijent sa Sectigo intermediate sertifikatom u CA lancu"
```

Posle commita **obavezno** potvrdi da je `.pem` stvarno ušao:

```bash
git show --stat HEAD | grep pem
```

Očekivano: red sa `scripts/certs/sectigo-intermediate.pem`.

---

### Zadatak 4: Šifarnici delatnosti i opština

**Fajlovi:**
- Kreiraj: `scripts/data/nace-2010.json`
- Kreiraj: `scripts/data/opstine.json`
- Kreiraj: `scripts/data/README.md`
- Kreiraj: `scripts/seed-sifarnici.ts`

**Interfejsi:**
- Koristi: `cirilicaULatinicu` iz Zadatka 1, `APR_ENDPOINTI` i `preuzmiUFajl` iz Zadatka 3
- Proizvodi: popunjene tabele `nace_codes` (615 redova) i `municipalities` (192 reda)

- [ ] **Korak 1: Skini zvaničnu klasifikaciju i konvertuj u JSON**

Klasifikacija je legacy `.xls`, pa se konverzija radi jednom, van repoa, a u repo ide
samo rezultat. `xlrd` se instalira u privremeni direktorijum da ne dira sistem.

```bash
mkdir -p scripts/data
cd /tmp
curl -sSL -o kd2010.xls "https://www.stat.gov.rs/media/2620/klasifikacija-delatnosti-2010-puni-nazivi.xls"
pip3 install --quiet --target /tmp/pylibs xlrd
PYTHONPATH=/tmp/pylibs python3 - <<'PY'
import xlrd, json, re
s = xlrd.open_workbook('/tmp/kd2010.xls').sheet_by_index(0)
sektor, redovi = None, []
for i in range(1, s.nrows):
    sifra = str(s.cell_value(i, 0)).strip()
    naziv = str(s.cell_value(i, 1)).strip()
    if not sifra:
        continue
    if re.fullmatch(r'[A-U]', sifra):
        sektor = sifra
    elif re.fullmatch(r'\d{4}', sifra):
        redovi.append({'sifra': sifra, 'naziv': naziv, 'sektor': sektor})
print('cetvorocifrenih sifara:', len(redovi))
json.dump(redovi, open('/tmp/nace-cir.json', 'w'), ensure_ascii=False, indent=0)
PY
```

Očekivano: `cetvorocifrenih sifara: 615`.

- [ ] **Korak 2: Transliteruj nazive i upiši u repo**

```bash
cd "$(git rev-parse --show-toplevel)"
cat > gen-nace.mts <<'TS'
import { readFileSync, writeFileSync } from "node:fs";
import { cirilicaULatinicu } from "./lib/transliterate";

type Ulaz = { sifra: string; naziv: string; sektor: string | null };

const redovi: Ulaz[] = JSON.parse(readFileSync("/tmp/nace-cir.json", "utf8"));
const izlaz = redovi.map((r) => ({
  sifra: r.sifra,
  naziv: cirilicaULatinicu(r.naziv),
  sektor: r.sektor,
}));

writeFileSync("scripts/data/nace-2010.json", `${JSON.stringify(izlaz, null, 2)}\n`);
console.log("upisano", izlaz.length, "sifara, primer:", izlaz.find((r) => r.sifra === "4532"));
TS
npx tsx gen-nace.mts; rm gen-nace.mts
```

Očekivano:
```
upisano 615 sifara, primer: { sifra: '4532', naziv: 'Trgovina na malo delovima i opremom za motorna vozila', sektor: 'G' }
```

- [ ] **Korak 3: Izvedi šifarnik opština iz APR seta**

Opštine ne postoje kao zaseban izvor, pa se izvode iz `companies` seta jednom i
komituju, da seed ostane offline i determinističan.

```bash
cat > gen-opstine.mts <<'TS'
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { APR_ENDPOINTI, preuzmiUFajl } from "./scripts/lib/apr-client";
import { cirilicaULatinicu } from "./lib/transliterate";

const put = path.join(tmpdir(), "companies-za-opstine.json");
await preuzmiUFajl(APR_ENDPOINTI[0].url, put);

const podaci: Record<string, { SifraOpstine: string; NazivOpstine: string }> = JSON.parse(
  readFileSync(put, "utf8"),
).Podaci;

const mapa = new Map<string, string>();
for (const red of Object.values(podaci)) {
  const sifra = String(red.SifraOpstine ?? "").trim();
  if (sifra && !mapa.has(sifra)) mapa.set(sifra, String(red.NazivOpstine ?? "").trim());
}

const izlaz = [...mapa.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([sifra, nazivCir]) => ({
    sifra,
    naziv_lat: cirilicaULatinicu(nazivCir),
    naziv_cir: nazivCir,
    okrug: null,
  }));

writeFileSync("scripts/data/opstine.json", `${JSON.stringify(izlaz, null, 2)}\n`);
console.log("upisano", izlaz.length, "opstina, primer:", izlaz[0]);
TS
npx tsx gen-opstine.mts; rm gen-opstine.mts
```

Očekivano: `upisano 192 opstina`.

- [ ] **Korak 4: Dokumentuj poreklo podataka**

`scripts/data/README.md`:

```markdown
# Statički podaci

## nace-2010.json

615 četvorocifrenih šifara delatnosti, sa nazivom i sektorom.

Izvor: Republički zavod za statistiku, Klasifikacija delatnosti 2010, puni nazivi.
`https://www.stat.gov.rs/media/2620/klasifikacija-delatnosti-2010-puni-nazivi.xls`

Original je legacy `.xls` sa četiri nivoa (21 sektor slovom, 88 oblasti, 219 grupa,
615 šifara). U repo ulaze samo četvorocifrene šifre, jer se samo one upisuju u APR.
Sektor se dodeljuje praćenjem poslednjeg viđenog slova pri prolasku kroz redove.
Nazivi su transliterisani iz ćirilice.

Provereno: pokriva svih 571 šifru koje se pojavljuju u APR `companies` setu.

## opstine.json

192 opštine, izvedene iz APR `companies` seta (`SifraOpstine`, `NazivOpstine`).
`naziv_lat` je transliteracija, `naziv_cir` je original.

`okrug` je `null`. APR ga ne daje, rutiranje ga ne koristi u v1. Popunjava se iz
zvaničnog izvora kad zatreba, ne procenom.

Oba fajla se generišu jednom i komituju, da seed radi offline i deterministički.
Postupak je opisan u planu, Zadatak 4.
```

- [ ] **Korak 5: Napiši scripts/seed-sifarnici.ts**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSupabaseServerClient } from "../lib/supabase";

type NaceRed = { sifra: string; naziv: string; sektor: string | null };
type OpstinaRed = { sifra: string; naziv_lat: string; naziv_cir: string; okrug: string | null };

function ucitaj<T>(imeFajla: string): T[] {
  return JSON.parse(readFileSync(path.join(process.cwd(), "scripts/data", imeFajla), "utf8"));
}

async function glavna(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // U GitHub Actions fajla nema, vrednosti stižu iz secrets.
  }

  const supabase = getSupabaseServerClient();

  const nace = ucitaj<NaceRed>("nace-2010.json");
  const { error: greskaNace } = await supabase.from("nace_codes").upsert(nace, { onConflict: "sifra" });
  if (greskaNace) throw new Error(`nace_codes: ${greskaNace.message}`);
  console.log(`nace_codes: ${nace.length} šifara`);

  const opstine = ucitaj<OpstinaRed>("opstine.json");
  const { error: greskaOpstina } = await supabase
    .from("municipalities")
    .upsert(opstine, { onConflict: "sifra" });
  if (greskaOpstina) throw new Error(`municipalities: ${greskaOpstina.message}`);
  console.log(`municipalities: ${opstine.length} opština`);
}

glavna().catch((greska) => {
  console.error("Seed nije uspeo:", greska instanceof Error ? greska.message : greska);
  process.exit(1);
});
```

- [ ] **Korak 6: Pusti seed i proveri rezultat**

```bash
npx tsx scripts/seed-sifarnici.ts
```

Očekivano:
```
nace_codes: 615 šifara
municipalities: 192 opština
```

Pusti ga i drugi put — mora da prođe isto, jer je upsert idempotentan.

- [ ] **Korak 7: Commit**

```bash
git add scripts/data scripts/seed-sifarnici.ts
git commit -m "Sifarnici delatnosti i opstina, seed skripta"
```

---

### Zadatak 5: Mapiranje APR redova u redove baze

**Fajlovi:**
- Kreiraj: `scripts/lib/map-apr.ts`
- Test: `tests/map-apr.test.ts`

**Interfejsi:**
- Koristi: `normalizeIme`, `slugify`, `parseDatum`, `trimMb` iz Zadatka 2,
  `cirilicaULatinicu` iz Zadatka 1
- Proizvodi:
  - tipovi `SirovaFirma`, `SirovFi`, `RedFirme`, `RedFinansija`, `RedIstorije`
  - `mapirajFirmu(mb: string, sirovo: SirovaFirma, postojeciSlug: string | null): RedFirme`
  - `mapirajFinansije(mb: string, sirovo: SirovFi): RedFinansija`
  - `firmaIzmenjena(nova: RedFirme, stara: RedFirme): boolean`
  - `finansijeIzmenjene(nove: RedFinansija, stare: RedFinansija): boolean`

Ovaj modul nema I/O, pa se testira bez mreže i baze.

- [ ] **Korak 1: Napiši test koji pada**

`tests/map-apr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  finansijeIzmenjene,
  firmaIzmenjena,
  mapirajFinansije,
  mapirajFirmu,
  type SirovaFirma,
  type SirovFi,
} from "../scripts/lib/map-apr";

const SIROVA: SirovaFirma = {
  PoslovnoIme: "TRGOVINSKO PREDUZEĆE LJUBA-PROMET DOO  KRUŠEVAC",
  SifraOpstine: "70670",
  NazivOpstine: "КРУШЕВАЦ",
  NazivStatus: "Активан",
  DatumOsnivanja: "1994-06-30",
  NazivPravneForme: "Друштво са ограниченом одговорношћу",
  SifraDelatnosti: "4532",
};

describe("mapirajFirmu", () => {
  it("mapira sva polja", () => {
    const red = mapirajFirmu("17246771", SIROVA, null);

    expect(red.maticni_broj).toBe("17246771");
    expect(red.poslovno_ime).toBe(SIROVA.PoslovnoIme); // original, netaknut
    expect(red.poslovno_ime_norm).toBe("trgovinsko preduzece ljuba promet doo krusevac");
    expect(red.slug).toBe("trgovinsko-preduzece-ljuba-promet-doo-krusevac-17246771");
    expect(red.sifra_opstine).toBe("70670");
    expect(red.opstina).toBe("KRUŠEVAC");
    expect(red.status).toBe("Aktivan");
    expect(red.status_aktivan).toBe(true);
    expect(red.datum_osnivanja).toBe("1994-06-30");
    expect(red.pravna_forma).toBe("Društvo sa ograničenom odgovornošću");
    expect(red.sifra_delatnosti).toBe("4532");
  });

  it("zamrznuti slug se ne menja kad se ime promeni", () => {
    const red = mapirajFirmu("17246771", { ...SIROVA, PoslovnoIme: "NOVO IME" }, "stari-slug-17246771");
    expect(red.slug).toBe("stari-slug-17246771");
    expect(red.poslovno_ime).toBe("NOVO IME");
  });

  it("status_aktivan je tacan samo za Активан", () => {
    // sve cetiri vrednosti koje postoje u setu
    expect(mapirajFirmu("1", { ...SIROVA, NazivStatus: "Активан" }, null).status_aktivan).toBe(true);
    expect(mapirajFirmu("1", { ...SIROVA, NazivStatus: "У ликвидацији" }, null).status_aktivan).toBe(false);
    expect(mapirajFirmu("1", { ...SIROVA, NazivStatus: "У стечају" }, null).status_aktivan).toBe(false);
    expect(
      mapirajFirmu("1", { ...SIROVA, NazivStatus: "У принудној ликвидацији" }, null).status_aktivan,
    ).toBe(false);
  });

  it("cuva vodecu nulu u sifri delatnosti", () => {
    expect(mapirajFirmu("1", { ...SIROVA, SifraDelatnosti: "0161" }, null).sifra_delatnosti).toBe("0161");
  });

  it("prazna polja postaju null, ne prazan string", () => {
    const red = mapirajFirmu(
      "1",
      { ...SIROVA, SifraDelatnosti: "", SifraOpstine: "", DatumOsnivanja: "" },
      null,
    );
    expect(red.sifra_delatnosti).toBeNull();
    expect(red.sifra_opstine).toBeNull();
    expect(red.datum_osnivanja).toBeNull();
  });

  it("sifra opstine iz broja postaje string", () => {
    // u FI setu je broj, u companies setu string; mapper prima oba
    const red = mapirajFirmu("1", { ...SIROVA, SifraOpstine: 70670 as unknown as string }, null);
    expect(red.sifra_opstine).toBe("70670");
  });
});

const SIROV_FI: SirovFi = {
  GodinaFi: 2025,
  PoslovnoIme: "LJUBA-PROMET",
  SifraOpstine: 70670,
  NazivOpstine: "КРУШЕВАЦ",
  PoslovnaImovina: 41414,
  Kapital: 27920,
  Gubitak: 0,
  UkupniPrihodi: 38543,
  NetoDobitak: 1962,
  NetoGubitak: 0,
  ProsecanBrojZaposlenih: 2,
};

describe("mapirajFinansije", () => {
  it("prenosi vrednosti nepromenjene, u hiljadama dinara", () => {
    const red = mapirajFinansije("17246771", SIROV_FI);

    expect(red.maticni_broj).toBe("17246771");
    expect(red.godina).toBe(2025);
    expect(red.poslovna_imovina).toBe(41414); // bez mnozenja sa 1000
    expect(red.kapital).toBe(27920);
    expect(red.ukupni_prihodi).toBe(38543);
    expect(red.neto_dobitak).toBe(1962);
    expect(red.neto_gubitak).toBe(0);
    expect(red.prosecan_broj_zaposlenih).toBe(2);
  });

  it("cuva nule kakve jesu, jer ih UI tumaci kao nema podataka", () => {
    const prazan = mapirajFinansije("1", {
      ...SIROV_FI,
      PoslovnaImovina: 0, Kapital: 0, Gubitak: 0, UkupniPrihodi: 0,
      NetoDobitak: 0, NetoGubitak: 0, ProsecanBrojZaposlenih: 0,
    });
    expect(prazan.ukupni_prihodi).toBe(0);
    expect(prazan.kapital).toBe(0);
  });
});

describe("detekcija izmena", () => {
  it("prepoznaje nepromenjenu firmu", () => {
    const a = mapirajFirmu("17246771", SIROVA, null);
    expect(firmaIzmenjena(a, { ...a })).toBe(false);
  });

  it("prepoznaje promenjeno ime", () => {
    const a = mapirajFirmu("17246771", SIROVA, null);
    const b = mapirajFirmu("17246771", { ...SIROVA, PoslovnoIme: "DRUGO" }, a.slug);
    expect(firmaIzmenjena(b, a)).toBe(true);
  });

  it("prepoznaje promenjene finansije", () => {
    const a = mapirajFinansije("1", SIROV_FI);
    const b = mapirajFinansije("1", { ...SIROV_FI, UkupniPrihodi: 99 });
    expect(finansijeIzmenjene(b, a)).toBe(true);
    expect(finansijeIzmenjene(a, { ...a })).toBe(false);
  });
});
```

- [ ] **Korak 2: Pusti test i potvrdi da pada**

```bash
npx vitest run tests/map-apr.test.ts
```

Očekivano: FAIL, `Failed to resolve import "../scripts/lib/map-apr"`.

- [ ] **Korak 3: Napiši scripts/lib/map-apr.ts**

```ts
import { cirilicaULatinicu } from "../../lib/transliterate";
import { normalizeIme, parseDatum, slugify } from "../../lib/normalize";

export type SirovaFirma = {
  PoslovnoIme: string;
  SifraOpstine: string;
  NazivOpstine: string;
  NazivStatus: string;
  DatumOsnivanja: string;
  NazivPravneForme: string;
  SifraDelatnosti: string;
};

export type SirovFi = {
  GodinaFi: number;
  PoslovnoIme: string;
  SifraOpstine: number;
  NazivOpstine: string;
  PoslovnaImovina: number;
  Kapital: number;
  Gubitak: number;
  UkupniPrihodi: number;
  NetoDobitak: number;
  NetoGubitak: number;
  ProsecanBrojZaposlenih: number;
};

export type RedFirme = {
  maticni_broj: string;
  slug: string;
  poslovno_ime: string;
  poslovno_ime_norm: string;
  sifra_opstine: string | null;
  opstina: string | null;
  status: string | null;
  status_aktivan: boolean;
  datum_osnivanja: string | null;
  pravna_forma: string | null;
  sifra_delatnosti: string | null;
};

export type RedFinansija = {
  maticni_broj: string;
  godina: number;
  poslovna_imovina: number;
  kapital: number;
  gubitak: number;
  ukupni_prihodi: number;
  neto_dobitak: number;
  neto_gubitak: number;
  prosecan_broj_zaposlenih: number;
};

export type RedIstorije = RedFinansija & { datum_preseka: string };

/**
 * Jedina vrednost koja znači aktivnu firmu. U setu postoje tačno četiri statusa:
 * Активан, У ликвидацији, У стечају, У принудној ликвидацији.
 * Eksplicitno poređenje, nikad provera sadržanosti.
 */
const STATUS_AKTIVAN = "Активан";

/** Prazan string i nedostajuća vrednost su isto: null u bazi. */
function tekstIliNull(vrednost: unknown): string | null {
  const ocisceno = String(vrednost ?? "").trim();
  return ocisceno === "" ? null : ocisceno;
}

/**
 * Novčano polje. Nula je ovde stvaran signal (firma nije predala izveštaj, UI
 * je prikazuje kao "Nema podataka"), pa se ne sme tiho zameniti nulom kad je
 * ulaz null, string ili nedostaje. Takav ulaz baca grešku umesto da izmisli
 * vrednost; poziv iz Zadatka 8 hvata grešku po redu i broji je kao preskočenu.
 */
function broj(poljeIme: string, vrednost: unknown): number {
  if (typeof vrednost === "number" && Number.isFinite(vrednost)) return vrednost;
  throw new Error(
    `APR mapiranje: polje "${poljeIme}" nije ispravan broj, primljeno: ${JSON.stringify(vrednost)}`,
  );
}

// GodinaFi je deo primarnog ključa u financials (maticni_broj, godina). Ako bi
// neispravna vrednost tiho postala 0, dva različita izveštajna perioda iste
// firme bi se mapirala na isti ključ i upsert bi tiho prepisao jedan red drugim.
const MIN_GODINA_FI = 2000;
const MAX_GODINA_FI = new Date().getFullYear() + 1;

/** GodinaFi mora biti ceo broj u uverljivom opsegu; nikad se ne izmišlja zamenska godina. */
function godinaFi(vrednost: unknown): number {
  if (
    typeof vrednost === "number" &&
    Number.isInteger(vrednost) &&
    vrednost >= MIN_GODINA_FI &&
    vrednost <= MAX_GODINA_FI
  ) {
    return vrednost;
  }
  throw new Error(
    `APR mapiranje: polje "GodinaFi" nije ispravna izveštajna godina, primljeno: ${JSON.stringify(vrednost)}`,
  );
}

export function mapirajFirmu(
  maticniBroj: string,
  sirovo: SirovaFirma,
  postojeciSlug: string | null,
): RedFirme {
  // Nedostajuće ime postaje "", pa slugify(ime, mb) vraća samo matični broj -
  // namerno, ne previd; slug i dalje mora da bude jedinstven i definisan.
  const ime = String(sirovo.PoslovnoIme ?? "").trim();
  const opstinaCir = tekstIliNull(sirovo.NazivOpstine);
  const status = tekstIliNull(sirovo.NazivStatus);
  const pravnaForma = tekstIliNull(sirovo.NazivPravneForme);

  return {
    maticni_broj: maticniBroj,
    // Slug se zamrzava pri prvom upisu: 133k indeksiranih URL-ova ne sme da se menja.
    slug: postojeciSlug ?? slugify(ime, maticniBroj),
    poslovno_ime: ime, // original, i kad je ćirilicom
    poslovno_ime_norm: normalizeIme(ime),
    sifra_opstine: tekstIliNull(sirovo.SifraOpstine),
    opstina: opstinaCir === null ? null : cirilicaULatinicu(opstinaCir),
    status: status === null ? null : cirilicaULatinicu(status),
    status_aktivan: String(sirovo.NazivStatus ?? "").trim() === STATUS_AKTIVAN,
    datum_osnivanja: parseDatum(sirovo.DatumOsnivanja),
    pravna_forma: pravnaForma === null ? null : cirilicaULatinicu(pravnaForma),
    sifra_delatnosti: tekstIliNull(sirovo.SifraDelatnosti),
  };
}

/**
 * Vrednosti se prenose nepromenjene, u hiljadama dinara. Baca grešku umesto da
 * tiho izmisli 0 za neispravan ili nedostajući ulaz - videti broj() i godinaFi().
 */
export function mapirajFinansije(maticniBroj: string, sirovo: SirovFi): RedFinansija {
  return {
    maticni_broj: maticniBroj,
    godina: godinaFi(sirovo.GodinaFi),
    poslovna_imovina: broj("PoslovnaImovina", sirovo.PoslovnaImovina),
    kapital: broj("Kapital", sirovo.Kapital),
    gubitak: broj("Gubitak", sirovo.Gubitak),
    ukupni_prihodi: broj("UkupniPrihodi", sirovo.UkupniPrihodi),
    neto_dobitak: broj("NetoDobitak", sirovo.NetoDobitak),
    neto_gubitak: broj("NetoGubitak", sirovo.NetoGubitak),
    prosecan_broj_zaposlenih: broj("ProsecanBrojZaposlenih", sirovo.ProsecanBrojZaposlenih),
  };
}

const POLJA_FIRME: (keyof RedFirme)[] = [
  "slug", "poslovno_ime", "poslovno_ime_norm", "sifra_opstine", "opstina",
  "status", "status_aktivan", "datum_osnivanja", "pravna_forma", "sifra_delatnosti",
];

const POLJA_FINANSIJA: (keyof RedFinansija)[] = [
  "poslovna_imovina", "kapital", "gubitak", "ukupni_prihodi",
  "neto_dobitak", "neto_gubitak", "prosecan_broj_zaposlenih",
];

export function firmaIzmenjena(nova: RedFirme, stara: RedFirme): boolean {
  return POLJA_FIRME.some((polje) => nova[polje] !== stara[polje]);
}

export function finansijeIzmenjene(nove: RedFinansija, stare: RedFinansija): boolean {
  return POLJA_FINANSIJA.some((polje) => nove[polje] !== stare[polje]);
}
```

- [ ] **Korak 4: Pusti test i potvrdi da prolazi**

```bash
npx vitest run tests/map-apr.test.ts
```

Očekivano: PASS, 11 testova.

- [ ] **Korak 5: Commit**

```bash
git add scripts/lib/map-apr.ts tests/map-apr.test.ts
git commit -m "Mapiranje APR redova u redove baze, bez I/O"
```

---

### Zadatak 6: Arhiviranje preseka u Storage

**Fajlovi:**
- Kreiraj: `scripts/lib/archive.ts`

**Interfejsi:**
- Proizvodi:
  - `osigurajBucket(supabase: SupabaseClient): Promise<void>`
  - `arhiviraj(supabase: SupabaseClient, lokalniPut: string, ciljniPut: string): Promise<number>`
    (vraća veličinu gzipovanog sadržaja u bajtovima)

- [ ] **Korak 1: Napiši scripts/lib/archive.ts**

```ts
import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "snapshots";

/**
 * Bucket mora da postoji i pre prvog pokretanja na čistom okruženju,
 * jer mesečni cron nema ručni korak. Privatan je, sirovi preseci nisu javni.
 */
export async function osigurajBucket(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data && !error) return;

  const { error: greskaKreiranja } = await supabase.storage.createBucket(BUCKET, { public: false });

  if (!greskaKreiranja) {
    console.log(`  Napravljen privatan bucket "${BUCKET}".`);
    return;
  }

  // Trka između dva pokretanja nije greška; bucket je tu, a to je jedino bitno.
  // Prepoznaje se po HTTP 409, ne po tekstu poruke: storage-js dokumentuje
  // statusCode kao signal, a tekst se menja izmedju verzija i lokalizacija.
  const konflikt =
    (greskaKreiranja as { statusCode?: string | number }).statusCode === "409" ||
    (greskaKreiranja as { statusCode?: string | number }).statusCode === 409 ||
    (greskaKreiranja as { status?: number }).status === 409 ||
    /already exists|duplicate/i.test(greskaKreiranja.message);

  if (!konflikt) {
    throw new Error(`Ne mogu da napravim bucket ${BUCKET}: ${greskaKreiranja.message}`);
  }
}

/** Gzipuje lokalni fajl i uploaduje ga. Vraća veličinu gzipovanog sadržaja. */
export async function arhiviraj(
  supabase: SupabaseClient,
  lokalniPut: string,
  ciljniPut: string,
): Promise<number> {
  const delovi: Buffer[] = [];
  const gzip = createGzip();

  gzip.on("data", (deo: Buffer) => delovi.push(deo));
  await pipeline(createReadStream(lokalniPut), gzip);

  const sadrzaj = Buffer.concat(delovi);

  const { error } = await supabase.storage.from(BUCKET).upload(ciljniPut, sadrzaj, {
    contentType: "application/gzip",
    upsert: true, // ponovno pokretanje uz --force sme da pregazi isti presek
  });

  if (error) throw new Error(`Upload ${ciljniPut} nije uspeo: ${error.message}`);

  return sadrzaj.length;
}
```

- [ ] **Korak 2: Proveri nad živim Storage-om**

```bash
cat > provera-storage.mts <<'TS'
import { writeFileSync } from "node:fs";
import { getSupabaseServerClient } from "./lib/supabase";
import { arhiviraj, BUCKET, osigurajBucket } from "./scripts/lib/archive";

process.loadEnvFile(".env.local");
const sb = getSupabaseServerClient();

await osigurajBucket(sb);
writeFileSync("/tmp/proba.json", JSON.stringify({ proba: true }));
console.log("gz bajtova:", await arhiviraj(sb, "/tmp/proba.json", "proba/proba.json.gz"));

const { data } = await sb.storage.from(BUCKET).list("proba");
console.log("u bucketu:", data?.map((f) => f.name));

await sb.storage.from(BUCKET).remove(["proba/proba.json.gz"]);
console.log("probni fajl obrisan");
TS
npx tsx provera-storage.mts; rm provera-storage.mts
```

Očekivano: ispis broja bajtova, pa `u bucketu: [ 'proba.json.gz' ]`, pa potvrda brisanja.

- [ ] **Korak 3: Commit**

```bash
git add scripts/lib/archive.ts
git commit -m "Arhiviranje preseka u Supabase Storage, gzip i privatan bucket"
```

---

### Zadatak 7: Čitanje postojećeg stanja i batch upis

**Fajlovi:**
- Kreiraj: `scripts/lib/upsert.ts`

**Interfejsi:**
- Koristi: tipove `RedFirme`, `RedFinansija` iz Zadatka 5
- Proizvodi:
  - `ucitajPostojeceFirme(supabase): Promise<Map<string, RedFirme>>`
  - `ucitajPostojeceFinansije(supabase): Promise<Map<string, RedFinansija>>` (ključ `"{mb}:{godina}"`)
  - `upsertUBatchevima<T>(supabase, tabela: string, redovi: T[], onConflict: string): Promise<void>`
  - `insertUBatchevima<T>(supabase, tabela: string, redovi: T[]): Promise<void>`
  - `obrisiIstorijuZaPresek(supabase, datumPreseka: string): Promise<number>`

- [ ] **Korak 1: Napiši scripts/lib/upsert.ts**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RedFinansija, RedFirme } from "./map-apr";

const BATCH = 1000;
const STRANA = 1000; // supabase-js podrazumevano vraća najviše 1000 redova po upitu

/**
 * Čita celu tabelu kroz stranice. Bez ovoga bi se dobilo prvih 1000 redova,
 * pa bi 132.634 firme izgledale kao nove i slug bi im se regenerisao.
 */
async function ucitajSve<T>(
  supabase: SupabaseClient,
  tabela: string,
  kolone: string,
  poredak: string[],
): Promise<T[]> {
  const sve: T[] = [];

  for (let od = 0; ; od += STRANA) {
    // Poredak mora da pokrije ceo primarni ključ. Ako dve vrste dele vrednost
    // po kojoj se sortira, njihov međusobni redosled nije definisan i stranica
    // može da preskoči ili udvoji red.
    let upit = supabase.from(tabela).select(kolone);
    for (const kolona of poredak) upit = upit.order(kolona, { ascending: true });

    const { data, error } = await upit.range(od, od + STRANA - 1);

    if (error) throw new Error(`Čitanje ${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;

    sve.push(...(data as T[]));
    if (data.length < STRANA) break;
  }

  return sve;
}

export async function ucitajPostojeceFirme(
  supabase: SupabaseClient,
): Promise<Map<string, RedFirme>> {
  const redovi = await ucitajSve<RedFirme>(
    supabase,
    "companies",
    "maticni_broj, slug, poslovno_ime, poslovno_ime_norm, sifra_opstine, opstina, status, status_aktivan, datum_osnivanja, pravna_forma, sifra_delatnosti",
    ["maticni_broj"],
  );

  return new Map(redovi.map((red) => [red.maticni_broj, red]));
}

export async function ucitajPostojeceFinansije(
  supabase: SupabaseClient,
): Promise<Map<string, RedFinansija>> {
  const redovi = await ucitajSve<RedFinansija>(
    supabase,
    "financials",
    "maticni_broj, godina, poslovna_imovina, kapital, gubitak, ukupni_prihodi, neto_dobitak, neto_gubitak, prosecan_broj_zaposlenih",
    ["maticni_broj", "godina"],
  );

  return new Map(redovi.map((red) => [`${red.maticni_broj}:${red.godina}`, red]));
}

export async function upsertUBatchevima<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  tabela: string,
  redovi: T[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < redovi.length; i += BATCH) {
    const deo = redovi.slice(i, i + BATCH);
    // Kasting je neophodan: bez poznatog tipa baze (Database generic), postgrest-js
    // ne ume da izvede tip kolone za proizvoljnu tabelu prosleđenu kao string.
    const { error } = await supabase.from(tabela).upsert(deo as Record<string, unknown>[], { onConflict });

    if (error) {
      throw new Error(
        `Upsert u ${tabela} pao na redovima ${i}-${i + deo.length - 1}: ${error.message}`,
      );
    }

    if ((i / BATCH) % 20 === 0 && i > 0) {
      console.log(`    ${tabela}: ${i} / ${redovi.length}`);
    }
  }
}

/**
 * Čist insert, bez on conflict. Za financials_history, koja je append only i čiji je
 * ključ bigserial: redovi se šalju bez id-a, pa upsert ovde ne bi imao smisla.
 */
export async function insertUBatchevima<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  tabela: string,
  redovi: T[],
): Promise<void> {
  for (let i = 0; i < redovi.length; i += BATCH) {
    const deo = redovi.slice(i, i + BATCH);
    // Isti razlog za kasting kao u upsertUBatchevima.
    const { error } = await supabase.from(tabela).insert(deo as Record<string, unknown>[]);

    if (error) {
      throw new Error(
        `Insert u ${tabela} pao na redovima ${i}-${i + deo.length - 1}: ${error.message}`,
      );
    }
  }
}

/** Jedini dozvoljen delete: ponovna obrada istog preseka uz --force. */
export async function obrisiIstorijuZaPresek(
  supabase: SupabaseClient,
  datumPreseka: string,
): Promise<number> {
  const { error, count } = await supabase
    .from("financials_history")
    .delete({ count: "exact" })
    .eq("datum_preseka", datumPreseka);

  if (error) throw new Error(`Brisanje istorije za ${datumPreseka}: ${error.message}`);

  return count ?? 0;
}
```

- [ ] **Korak 2: Proveri straničenje nad živom bazom**

```bash
cat > provera-stranica.mts <<'TS'
import { getSupabaseServerClient } from "./lib/supabase";
import { ucitajPostojeceFirme } from "./scripts/lib/upsert";

process.loadEnvFile(".env.local");
const mapa = await ucitajPostojeceFirme(getSupabaseServerClient());
console.log("procitano firmi:", mapa.size);
TS
npx tsx provera-stranica.mts; rm provera-stranica.mts
```

Očekivano: `procitano firmi: 0` (baza je još prazna). Posle Zadatka 8 ista komanda
mora da vrati `133634`, čime se dokazuje da straničenje radi.

- [ ] **Korak 3: Commit**

```bash
git add scripts/lib/upsert.ts
git commit -m "Citanje postojeceg stanja kroz stranice i batch upsert"
```

---

### Zadatak 8: Orkestrator ingesta

**Fajlovi:**
- Kreiraj: `scripts/ingest.ts`

**Interfejsi:**
- Koristi sve iz Zadataka 1 do 7.

- [ ] **Korak 1: Napiši scripts/ingest.ts**

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "../lib/supabase";
import { trimMb } from "../lib/normalize";
import { APR_ENDPOINTI, preuzmiUFajl, procitajDatumPreseka } from "./lib/apr-client";
import { arhiviraj, osigurajBucket } from "./lib/archive";
import {
  finansijeIzmenjene,
  firmaIzmenjena,
  mapirajFinansije,
  mapirajFirmu,
  type RedFinansija,
  type RedFirme,
  type RedIstorije,
  type SirovaFirma,
  type SirovFi,
} from "./lib/map-apr";
import {
  insertUBatchevima,
  obrisiIstorijuZaPresek,
  ucitajPostojeceFinansije,
  ucitajPostojeceFirme,
  upsertUBatchevima,
} from "./lib/upsert";

const FORCE = process.argv.includes("--force");
const PRAG_ODSTUPANJA = 0.05; // 5%, po CLAUDE.md
const PRAG_PRESKOCENIH = 0.01; // 1%

type Sirov<T> = { DatumPreseka: string; Podaci: Record<string, T> };

function ucitajJson<T>(put: string): Sirov<T> {
  return JSON.parse(readFileSync(put, "utf8"));
}

function trajanje(od: number): string {
  return `${((Date.now() - od) / 1000).toFixed(1)} s`;
}

/** Prekida ingest ako bi pokvaren odgovor pregazio bazu. */
async function proveriOdstupanje(
  supabase: SupabaseClient,
  datumPreseka: string,
  brojFirmi: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("snapshots")
    .select("datum_preseka, broj_firmi")
    .order("datum_preseka", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Čitanje snapshots: ${error.message}`);

  const prethodni = data?.[0];
  if (!prethodni) return; // prvi ingest, nema sa čim da se poredi

  if (prethodni.datum_preseka >= datumPreseka && !FORCE) {
    throw new Error(
      `Presek ${datumPreseka} nije noviji od poslednjeg obrađenog (${prethodni.datum_preseka}). ` +
        "Pokreni sa --force ako je namerno.",
    );
  }

  const odstupanje = Math.abs(brojFirmi - prethodni.broj_firmi) / prethodni.broj_firmi;

  if (odstupanje > PRAG_ODSTUPANJA && !FORCE) {
    throw new Error(
      `Broj firmi odstupa ${(odstupanje * 100).toFixed(1)}% od preseka ` +
        `${prethodni.datum_preseka} (${prethodni.broj_firmi} -> ${brojFirmi}). ` +
        "Prag je 5%. Proveri izvor, pa pokreni sa --force ako je odstupanje stvarno.",
    );
  }
}

async function glavna(): Promise<void> {
  const pocetak = Date.now();

  try {
    process.loadEnvFile(".env.local");
  } catch {
    // U GitHub Actions fajla nema, vrednosti stižu iz secrets.
  }

  const supabase = getSupabaseServerClient();
  const radni = mkdtempSync(path.join(tmpdir(), "apr-ingest-"));

  try {
    // --- Korak 0: presek, uz 8 KB umesto 147 MB ---------------------------
    const datumPreseka = await procitajDatumPreseka(APR_ENDPOINTI[0].url);
    console.log(`Presek: ${datumPreseka}${FORCE ? " (--force)" : ""}`);

    const { data: postojeci, error: greskaSnapshota } = await supabase
      .from("snapshots")
      .select("datum_preseka")
      .eq("datum_preseka", datumPreseka)
      .maybeSingle();

    if (greskaSnapshota) throw new Error(`Čitanje snapshots: ${greskaSnapshota.message}`);

    if (postojeci && !FORCE) {
      console.log("presek već obrađen");
      return;
    }

    // --- Korak 1: povlačenje ---------------------------------------------
    console.log("\nPovlačenje:");
    const putanje: Record<string, string> = {};

    for (const endpoint of APR_ENDPOINTI) {
      const put = path.join(radni, endpoint.imeFajla);
      const bajtova = await preuzmiUFajl(endpoint.url, put);
      putanje[endpoint.kljuc] = put;
      console.log(`  ${endpoint.kljuc}: ${(bajtova / 1024 / 1024).toFixed(1)} MB`);
    }

    // --- Korak 2: arhiviranje --------------------------------------------
    console.log("\nArhiviranje:");
    await osigurajBucket(supabase);

    for (const endpoint of APR_ENDPOINTI) {
      const cilj = `${datumPreseka}/${endpoint.imeFajla}.gz`;
      const gzBajtova = await arhiviraj(supabase, putanje[endpoint.kljuc], cilj);
      console.log(`  ${cilj}: ${(gzBajtova / 1024 / 1024).toFixed(1)} MB`);
    }

    // --- Korak 3: companies ----------------------------------------------
    console.log("\nFirme:");
    const sirovFirme = ucitajJson<SirovaFirma>(putanje.companies);
    const unosiFirmi = Object.entries(sirovFirme.Podaci);

    await proveriOdstupanje(supabase, datumPreseka, unosiFirmi.length);

    const postojeceFirme = await ucitajPostojeceFirme(supabase);
    // updated_at nije deo RedFirme jer ne učestvuje u poređenju; dodaje se samo
    // izmenjenim redovima, da kolona ne laže da je red diran svakog meseca.
    const zaUpisFirme: (RedFirme & { updated_at?: string })[] = [];
    const poznatiMb = new Set<string>();
    const preskoceneFirme: string[] = [];
    let novihFirmi = 0;

    for (const [kljuc, sirovo] of unosiFirmi) {
      const mb = trimMb(kljuc);
      if (!mb) {
        preskoceneFirme.push(kljuc);
        continue;
      }

      poznatiMb.add(mb);
      const staro = postojeceFirme.get(mb) ?? null;

      // mapirajFirmu baca na neispravan podatak umesto da ga tiho pretvori u
      // nulu. Red se preskače i broji, a prag od 1% niže prekida ingest ako
      // takvih bude mnogo.
      let novo: RedFirme;
      try {
        novo = mapirajFirmu(mb, sirovo, staro?.slug ?? null);
      } catch (greska) {
        preskoceneFirme.push(`${mb}: ${greska instanceof Error ? greska.message : greska}`);
        continue;
      }

      if (!staro) {
        novihFirmi++;
        zaUpisFirme.push(novo);
      } else if (firmaIzmenjena(novo, staro)) {
        zaUpisFirme.push({ ...novo, updated_at: new Date().toISOString() });
      }
    }

    if (unosiFirmi.length === 0) {
      throw new Error("APR je vratio nula firmi. Izvor je pokvaren, ništa se ne upisuje.");
    }

    if (preskoceneFirme.length / unosiFirmi.length > PRAG_PRESKOCENIH) {
      throw new Error(
        `Preskočeno ${preskoceneFirme.length} od ${unosiFirmi.length} firmi zbog neispravnog ` +
          `matičnog broja, prag je 1%. Primeri: ${preskoceneFirme.slice(0, 10).join(", ")}`,
      );
    }

    console.log(`  ukupno ${unosiFirmi.length}, novih ${novihFirmi}, ` +
      `izmenjenih ${zaUpisFirme.length - novihFirmi}, preskočenih ${preskoceneFirme.length}`);
    await upsertUBatchevima(supabase, "companies", zaUpisFirme, "maticni_broj");

    // --- Korak 4 i 5: financials i istorija -------------------------------
    console.log("\nFinansije:");
    const sirovFi = ucitajJson<SirovFi>(putanje["financial-statements"]);
    const unosiFi = Object.entries(sirovFi.Podaci);

    if (sirovFi.DatumPreseka !== datumPreseka) {
      console.warn(
        `  Upozorenje: financial-statements ima presek ${sirovFi.DatumPreseka}, ` +
          `a companies ${datumPreseka}. Koristi se ${datumPreseka}.`,
      );
    }

    const postojeceFinansije = await ucitajPostojeceFinansije(supabase);
    const zaUpisFinansije: RedFinansija[] = [];
    const zaIstoriju: RedIstorije[] = [];
    const preskoceniFi: string[] = [];
    let siroca = 0;
    let novihFi = 0;

    for (const [kljuc, sirovo] of unosiFi) {
      const mb = trimMb(kljuc); // 11.099 ključeva ima razmak na kraju
      if (!mb) {
        preskoceniFi.push(kljuc);
        continue;
      }

      // Isto kao kod firmi: neispravan broj ili godina bacaju, red se preskače.
      // Godina je deo primarnog ključa, pa tiha nula ovde znači da bi dva
      // izveštaja iste firme pregazila jedan drugi.
      let red: RedFinansija;
      try {
        red = mapirajFinansije(mb, sirovo);
      } catch (greska) {
        preskoceniFi.push(`${mb}: ${greska instanceof Error ? greska.message : greska}`);
        continue;
      }

      zaIstoriju.push({ ...red, datum_preseka: datumPreseka });

      // Siročići nemaju firmu u companies, pa bi pukli na stranom ključu.
      // Ostaju samo u istoriji, koja nema FK.
      if (!poznatiMb.has(mb)) {
        siroca++;
        continue;
      }

      const staro = postojeceFinansije.get(`${mb}:${red.godina}`) ?? null;
      if (!staro) {
        novihFi++;
        zaUpisFinansije.push(red);
      } else if (finansijeIzmenjene(red, staro)) {
        zaUpisFinansije.push(red);
      }
    }

    if (unosiFi.length > 0 && preskoceniFi.length / unosiFi.length > PRAG_PRESKOCENIH) {
      throw new Error(
        `Preskočeno ${preskoceniFi.length} od ${unosiFi.length} finansijskih redova, prag je 1%. ` +
          `Primeri: ${preskoceniFi.slice(0, 10).join(", ")}`,
      );
    }

    console.log(`  ukupno ${unosiFi.length}, novih ${novihFi}, ` +
      `izmenjenih ${zaUpisFinansije.length - novihFi}, siročića ${siroca}, ` +
      `preskočenih ${preskoceniFi.length}`);
    await upsertUBatchevima(supabase, "financials", zaUpisFinansije, "maticni_broj,godina");

    // Uvek, ne samo uz --force. Red u snapshots se upisuje tek na kraju, pa
    // ingest prekinut u pola upisa istorije ostavlja deo redova bez ikakvog
    // traga. Sledeće pokretanje bi ih onda udvojilo. Brisanje je ograničeno na
    // tekući datum_preseka, dakle na tačno one redove koje upravo pišemo; pri
    // prvom uspešnom prolazu obriše nula redova.
    const obrisano = await obrisiIstorijuZaPresek(supabase, datumPreseka);
    if (obrisano > 0) {
      console.log(`  istorija: obrisano ${obrisano} redova iz ranijeg pokušaja za ovaj presek`);
    }

    await insertUBatchevima(supabase, "financials_history", zaIstoriju);
    console.log(`  istorija: upisano ${zaIstoriju.length} redova`);

    // --- Korak 6: zatvaranje ---------------------------------------------
    // Refresh ide PRE upisa u snapshots. Red u snapshots znači "presek u
    // potpunosti obrađen", a osvežena statistika je deo toga. Obrnut redosled
    // znači da pad refresha ostavlja presek označen kao gotov, pa svako
    // sledeće pokretanje kratko spaja na "presek već obrađen" i view-ovi
    // ostaju zastareli dok neko to ručno ne primeti.
    console.log("\nOsvežavanje statistike...");
    const { error: greskaRefresha } = await supabase.rpc("refresh_all_stats");
    if (greskaRefresha) throw new Error(`refresh_all_stats: ${greskaRefresha.message}`);

    const { error: greskaUpisa } = await supabase.from("snapshots").upsert(
      {
        datum_preseka: datumPreseka,
        storage_path: `${datumPreseka}/`,
        broj_firmi: unosiFirmi.length,
        broj_fi: unosiFi.length,
      },
      { onConflict: "datum_preseka" },
    );

    if (greskaUpisa) throw new Error(`Upis u snapshots: ${greskaUpisa.message}`);

    console.log(`\nGotovo za ${trajanje(pocetak)}.`);
  } finally {
    rmSync(radni, { recursive: true, force: true });
  }
}

glavna().catch((greska) => {
  console.error("\nIngest nije uspeo:", greska instanceof Error ? greska.message : greska);
  process.exit(1);
});
```

- [ ] **Korak 2: Pusti ingest prvi put**

```bash
npm run ingest
```

Očekivano, uz brojeve izmerene nad presekom `2026-07-31`:

```
Presek: 2026-07-31

Povlačenje:
  companies: 55.0 MB
  financial-statements: 54.2 MB
  ngo: 30.5 MB

Arhiviranje:
  Napravljen privatan bucket "snapshots".
  2026-07-31/companies.json.gz: ... MB
  ...

Firme:
  ukupno 133634, novih 133634, izmenjenih 0, preskočenih 0

Finansije:
  ukupno 123360, novih 116847, izmenjenih 0, siročića 6513, preskočenih 0
  istorija: upisano 123360 redova

Osvežavanje statistike...

Gotovo za ... s.
```

Ako se brojevi razlikuju zato što je APR objavio noviji presek, to je u redu; bitno je
da `novih` odgovara `ukupno` pri prvom punjenju i da je broj siročića oko 5%.

- [ ] **Korak 3: Pusti ingest drugi put i potvrdi idempotenciju**

```bash
npm run ingest
```

Očekivano, za par sekundi:

```
Presek: 2026-07-31
presek već obrađen
```

- [ ] **Korak 4: Potvrdi da --force radi ponovnu obradu bez duplikata**

```bash
npm run ingest -- --force
```

Očekivano: pun prolaz, ali `novih 0, izmenjenih 0` i za firme i za finansije, plus red
`istorija: obrisano 123360 starih redova za ovaj presek`. Istorija posle ovoga mora i
dalje da ima 123.360 redova, ne 246.720.

- [ ] **Korak 5: Commit**

```bash
git add scripts/ingest.ts
git commit -m "Orkestrator ingesta, idempotentan uz --force"
```

---

### Zadatak 9: Integracioni testovi nad bazom

**Fajlovi:**
- Kreiraj: `tests/ingest.test.ts`
- Izmeni: `supabase/README.md`

**Interfejsi:**
- Koristi: `getSupabaseServerClient` iz `lib/supabase.ts`

Testovi samo čitaju bazu. Pokreću se posle uspešnog ingesta.

- [ ] **Korak 1: Napiši tests/ingest.test.ts**

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "../lib/supabase";

let supabase: SupabaseClient;

beforeAll(() => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // u CI-ju vrednosti stižu iz secrets
  }
  supabase = getSupabaseServerClient();
});

/** Čita jednu kolonu iz cele tabele kroz stranice. */
async function svaKolona<T>(tabela: string, kolona: string, poredak: string): Promise<T[]> {
  const sve: T[] = [];

  for (let od = 0; ; od += 1000) {
    const { data, error } = await supabase
      .from(tabela)
      .select(kolona)
      .order(poredak, { ascending: true })
      .range(od, od + 999);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    sve.push(...data.map((red) => (red as Record<string, T>)[kolona]));
    if (data.length < 1000) break;
  }

  return sve;
}

describe("ingest, stanje baze", () => {
  it("ima više od 100.000 firmi", async () => {
    const { count, error } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true });

    expect(error).toBeNull();
    expect(count ?? 0).toBeGreaterThan(100_000);
  });

  it("nema duplikata slugova", async () => {
    const slugovi = await svaKolona<string>("companies", "slug", "maticni_broj");
    expect(slugovi.length).toBeGreaterThan(100_000);
    expect(new Set(slugovi).size).toBe(slugovi.length);
  });

  it("nema reda bez maticnog broja", async () => {
    const { count, error } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .or("maticni_broj.is.null,maticni_broj.eq.");

    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("poslovno_ime_norm nema velika slova ni interpunkciju", async () => {
    const imena = await svaKolona<string>("companies", "poslovno_ime_norm", "maticni_broj");
    const losa = imena.filter((ime) => !/^[a-z0-9 ]*$/.test(ime ?? ""));

    expect(losa.slice(0, 10)).toEqual([]);
  });

  it("svaka sifra delatnosti iz companies postoji u nace_codes", async () => {
    const izFirmi = new Set(
      (await svaKolona<string | null>("companies", "sifra_delatnosti", "maticni_broj")).filter(
        (s): s is string => Boolean(s),
      ),
    );
    const izSifarnika = new Set(await svaKolona<string>("nace_codes", "sifra", "sifra"));
    const nedostaju = [...izFirmi].filter((s) => !izSifarnika.has(s));

    expect(izSifarnika.size).toBeGreaterThan(600);
    expect(nedostaju).toEqual([]);
  });

  it("financials ima manje redova od financials_history, zbog sirocica", async () => {
    const { count: fin } = await supabase
      .from("financials")
      .select("*", { count: "exact", head: true });
    const { count: ist } = await supabase
      .from("financials_history")
      .select("*", { count: "exact", head: true });

    expect(fin ?? 0).toBeGreaterThan(100_000);
    expect(ist ?? 0).toBeGreaterThan(fin ?? 0);
  });

  it("snapshots ima red za obradjen presek", async () => {
    const { data, error } = await supabase
      .from("snapshots")
      .select("datum_preseka, broj_firmi, broj_fi, storage_path")
      .order("datum_preseka", { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(data?.[0]?.broj_firmi ?? 0).toBeGreaterThan(100_000);
    expect(data?.[0]?.storage_path).toBeTruthy();
  });
});
```

- [ ] **Korak 2: Pusti ceo test paket**

```bash
npm test
```

Očekivano: sva četiri fajla zelena, `tests/transliterate.test.ts`,
`tests/normalize.test.ts`, `tests/map-apr.test.ts`, `tests/ingest.test.ts`.

- [ ] **Korak 3: Dopuni supabase/README.md**

U sekciju „Stanje" dodaj, sa brojevima koje je ingest stvarno ispisao:

```markdown
Ingest pipeline pokrenut 14.08.2026. nad presekom 2026-07-31.
companies 133.634, financials 116.847, financials_history 123.360,
nace_codes 615, municipalities 192. Sirovi preseci su u Storage bucketu
`snapshots` pod `2026-07-31/`. Bucket je privatan.
```

- [ ] **Korak 4: Commit**

```bash
git add tests/ingest.test.ts supabase/README.md
git commit -m "Integracioni testovi nad bazom, zabelezi stanje posle ingesta"
```

---

## Provera pred kraj sesije

- [ ] `npm test` — sve zeleno
- [ ] `npx tsc --noEmit` — bez grešaka
- [ ] `npm run lint` — bez grešaka
- [ ] `npm run build` — prolazi, ingest nije ušao u bundle
- [ ] `grep -rn "rejectUnauthorized" scripts/ lib/` — nema pogodaka
- [ ] `git status` — `.env.local` nije u indeksu
- [ ] Drugi `npm run ingest` ispisuje `presek već obrađen`
