"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Autocomplete pretraga firmi.
 *
 * Klijentska je jer je interaktivna, ali NIJEDAN podatak stranice ne zavisi od
 * nje — sve što crawler treba je već u serverskom HTML-u (SEO.md §1.5).
 *
 * Gađa `/api/search`, koji vraća skraćeno ime (isto ono iz H1), opštinu,
 * delatnost i status. Upit se normalizuje na serveru, pa ćirilica radi bez
 * posebne kolone: „ЧАЧАК" i „cacak" daju isti rezultat.
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

const ODLAGANJE_MS = 150;
const MIN_ZNAKOVA = 2;

export function SearchBox({
  predlozi = [],
  autoFokus = false,
}: {
  /** Firme koje se nude dok polje još nije kucano. */
  predlozi?: { slug: string; ime: string }[];
  autoFokus?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const poljeRef = useRef<HTMLInputElement>(null);
  const omotacRef = useRef<HTMLDivElement>(null);

  const [upit, setUpit] = useState("");
  const [rezultati, setRezultati] = useState<Rezultat[]>([]);
  const [otvoreno, setOtvoreno] = useState(false);
  const [ucitava, setUcitava] = useState(false);
  const [izabrani, setIzabrani] = useState(-1);

  // Kosa crta fokusira polje, kao u pretraživačima. Ne otima kucanje u formi.
  useEffect(() => {
    function naTaster(dogadjaj: KeyboardEvent) {
      const cilj = dogadjaj.target as HTMLElement | null;
      const kuca = cilj?.tagName === "INPUT" || cilj?.tagName === "TEXTAREA";
      if (dogadjaj.key === "/" && !kuca) {
        dogadjaj.preventDefault();
        poljeRef.current?.focus();
      }
    }
    document.addEventListener("keydown", naTaster);
    return () => document.removeEventListener("keydown", naTaster);
  }, []);

  // Klik izvan zatvara listu.
  useEffect(() => {
    function naKlik(dogadjaj: MouseEvent) {
      if (!omotacRef.current?.contains(dogadjaj.target as Node)) setOtvoreno(false);
    }
    document.addEventListener("mousedown", naKlik);
    return () => document.removeEventListener("mousedown", naKlik);
  }, []);

  // Debounce 150 ms; svaki novi upit prekida prethodni zahtev.
  // Stanje se ne dira sinhrono u telu efekta — kratak upit se rešava izvedenom
  // vrednošću (`vidljivi`), pa nema kaskadnog rendera.
  useEffect(() => {
    const ocisceno = upit.trim();
    if (ocisceno.length < MIN_ZNAKOVA) return;

    const kontroler = new AbortController();
    const tajmer = setTimeout(async () => {
      setUcitava(true);
      try {
        const odgovor = await fetch(`/api/search?q=${encodeURIComponent(ocisceno)}&limit=8`, {
          signal: kontroler.signal,
        });
        const telo = (await odgovor.json()) as { rezultati?: Rezultat[] };
        // Izbor se NE poništava ovde: rezultati stižu 200 ms posle kucanja, pa bi
        // strelica pritisnuta u međuvremenu bila progutana. Poništava se u onChange.
        setRezultati(telo.rezultati ?? []);
      } catch {
        // Prekinut zahtev ili mreža; polje ostaje upotrebljivo.
      } finally {
        setUcitava(false);
      }
    }, ODLAGANJE_MS);

    return () => {
      clearTimeout(tajmer);
      kontroler.abort();
    };
  }, [upit]);

  function otvori(slug: string) {
    setOtvoreno(false);
    router.push(`/firma/${slug}`);
  }

  function naTasteru(dogadjaj: React.KeyboardEvent<HTMLInputElement>) {
    if (dogadjaj.key === "Escape") {
      setOtvoreno(false);
      return;
    }
    const lista = upit.trim().length >= MIN_ZNAKOVA ? rezultati : [];
    if (!lista.length) return;

    if (dogadjaj.key === "ArrowDown") {
      dogadjaj.preventDefault();
      setOtvoreno(true);
      setIzabrani((i) => (i + 1) % lista.length);
    } else if (dogadjaj.key === "ArrowUp") {
      dogadjaj.preventDefault();
      setIzabrani((i) => (i <= 0 ? lista.length - 1 : i - 1));
    } else if (dogadjaj.key === "Enter") {
      dogadjaj.preventDefault();
      // Enter bez izbora vodi na prvi rezultat.
      const meta = lista[izabrani >= 0 ? izabrani : 0];
      if (meta) otvori(meta.slug);
    }
  }

  const dovoljnoDugo = upit.trim().length >= MIN_ZNAKOVA;
  // Kad korisnik obriše znakove, stari rezultati prestaju da važe.
  const vidljivi = dovoljnoDugo ? rezultati : [];
  const kratak = upit.trim().length > 0 && !dovoljnoDugo;
  const nemaPogodaka = !ucitava && dovoljnoDugo && !vidljivi.length;
  const prikaziListu = otvoreno && (vidljivi.length > 0 || nemaPogodaka || kratak);

  return (
    <div className="relative" ref={omotacRef}>
      <div className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-border-strong bg-card px-4 py-3.5 text-base focus-within:border-primary focus-within:shadow-[0_0_0_4px_var(--accent-ring)]">
        <Search size={19} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={poljeRef}
          type="text"
          role="combobox"
          autoComplete="off"
          autoFocus={autoFokus}
          aria-expanded={prikaziListu}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={izabrani >= 0 ? `${id}-stavka-${izabrani}` : undefined}
          aria-label="Pretraga firmi po nazivu ili matičnom broju"
          placeholder="Naziv firme, matični broj ili PIB…"
          value={upit}
          onChange={(e) => {
            setUpit(e.target.value);
            setIzabrani(-1);
            setOtvoreno(true);
          }}
          onFocus={() => setOtvoreno(true)}
          onKeyDown={naTasteru}
          className="w-full flex-1 border-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        {ucitava ? (
          <span className="text-[12px] text-muted-foreground">tražim…</span>
        ) : (
          <kbd className="rounded-md border border-border bg-muted px-[7px] py-0.5 text-[11.5px] text-muted-foreground max-sm:hidden">
            /
          </kbd>
        )}
      </div>

      {prikaziListu ? (
        <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-60 overflow-hidden rounded-card border border-border bg-card text-left shadow-pop">
          {kratak ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              Ukucaj bar dva znaka.
            </p>
          ) : nemaPogodaka ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">
              <p>
                Nema firme koja odgovara upitu <b className="text-foreground">{upit.trim()}</b>.
              </p>
              <p className="mt-1.5">
                Probaj kraći deo naziva, ili matični broj. Set sadrži samo privredna društva,
                ne i preduzetnike.
              </p>
            </div>
          ) : (
            <ul id={`${id}-lista`} role="listbox" className="list-none">
              {vidljivi.map((r, i) => (
                <li
                  key={r.maticni_broj}
                  id={`${id}-stavka-${i}`}
                  role="option"
                  aria-selected={i === izabrani}
                  onMouseEnter={() => setIzabrani(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    otvori(r.slug);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 ${
                    i === izabrani ? "bg-accent-soft" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold">
                      {podvuci(r.ime, upit)}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                      {[r.opstina, r.delatnost_naziv].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                      r.status_aktivan
                        ? "bg-success text-white"
                        : "border border-border-strong text-neutral"
                    }`}
                  >
                    {r.status ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {predlozi.length && !upit ? (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
          <span>Najtraženije:</span>
          {predlozi.map((p) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => otvori(p.slug)}
              className="text-accent-strong underline-offset-2 hover:underline"
            >
              {p.ime}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Podebljava pogodak u imenu. Poređenje ide preko preslikavanja jedan znak u
 * jedan znak (č→c, đ→d), da se indeksi u originalu ne pomere.
 */
function podvuci(tekst: string, upit: string): React.ReactNode {
  const trazeno = fold(upit.trim());
  if (!trazeno) return tekst;

  const pozicija = fold(tekst).indexOf(trazeno);
  if (pozicija < 0) return tekst;

  return (
    <>
      {tekst.slice(0, pozicija)}
      <mark className="bg-transparent font-bold text-accent-strong">
        {tekst.slice(pozicija, pozicija + trazeno.length)}
      </mark>
      {tekst.slice(pozicija + trazeno.length)}
    </>
  );
}

const SLOVA: Record<string, string> = { č: "c", ć: "c", š: "s", ž: "z", đ: "d" };

function fold(tekst: string): string {
  return tekst.toLowerCase().replace(/[čćšžđ]/g, (znak) => SLOVA[znak]);
}
