"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { useValuta } from "@/components/layout/valuta";
import { formatBroj, formatDatum, formatNovac, NEMA_PODATAKA } from "@/lib/format";
import { imeOpstine, kratkoIme } from "@/lib/prikaz";
import type { KarticaFirme } from "@/lib/queries";

/**
 * Poređenje firmi iz liste (D3).
 *
 * Sve je klijentski i iz podataka koje lista već nosi — nijedan novi upit.
 * Lista ostaje serverski renderovana (SEO), a ovde su samo kućice za izbor,
 * traka i tabela.
 *
 * Najviše tri firme: četvrta kolona na telefonu pravi tabelu koja se ne čita,
 * a poređenje preko tri stavke ionako prestaje da bude poređenje.
 */

const MAKS = 3;

type Kontekst = {
  izabrane: KarticaFirme[];
  prebaci: (firma: KarticaFirme) => void;
  jeIzabrana: (maticniBroj: string) => boolean;
  popunjeno: boolean;
};

const PoredjenjeKontekst = createContext<Kontekst | null>(null);

export function PoredjenjeProvider({ children }: { children: React.ReactNode }) {
  const [izabrane, setIzabrane] = useState<KarticaFirme[]>([]);

  const prebaci = useCallback((firma: KarticaFirme) => {
    setIzabrane((trenutne) => {
      const ima = trenutne.some((f) => f.maticni_broj === firma.maticni_broj);
      if (ima) return trenutne.filter((f) => f.maticni_broj !== firma.maticni_broj);
      if (trenutne.length >= MAKS) return trenutne;
      return [...trenutne, firma];
    });
  }, []);

  const vrednost = useMemo<Kontekst>(
    () => ({
      izabrane,
      prebaci,
      jeIzabrana: (mb) => izabrane.some((f) => f.maticni_broj === mb),
      popunjeno: izabrane.length >= MAKS,
    }),
    [izabrane, prebaci],
  );

  return (
    <PoredjenjeKontekst.Provider value={vrednost}>
      <TrakaPoredjenja ocisti={() => setIzabrane([])} />
      {children}
    </PoredjenjeKontekst.Provider>
  );
}

/** Kućica u redu liste. Van providera se ne prikazuje ništa. */
export function CmpCheckbox({ firma }: { firma: KarticaFirme }) {
  const kontekst = useContext(PoredjenjeKontekst);
  if (!kontekst) return null;

  const izabrana = kontekst.jeIzabrana(firma.maticni_broj);
  const ime = kratkoIme({
    poslovno_ime: firma.ime,
    poslovno_ime_kratko: firma.imeKratko,
    opstina: firma.opstina,
  });

  return (
    <label className="flex cursor-pointer items-start pt-1.5" title={`Izaberi ${ime} za poređenje`}>
      <input
        type="checkbox"
        checked={izabrana}
        disabled={!izabrana && kontekst.popunjeno}
        onChange={() => kontekst.prebaci(firma)}
        aria-label={`Izaberi ${ime} za poređenje`}
        className="h-4 w-4 accent-[var(--primary)] disabled:opacity-40"
      />
    </label>
  );
}

function TrakaPoredjenja({ ocisti }: { ocisti: () => void }) {
  const kontekst = useContext(PoredjenjeKontekst);
  const [otvoreno, setOtvoreno] = useState(false);
  const valuta = useValuta();

  if (!kontekst?.izabrane.length) return null;

  const { izabrane } = kontekst;
  const dovoljno = izabrane.length >= 2;

  return (
    <div className="my-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-ring bg-accent-soft px-4 py-2.5">
        <span className="text-[13.5px] font-semibold">
          Izabrano: <b className="text-accent-strong">{izabrane.length}</b>{" "}
          {izabrane.length === 1 ? "firma" : "firme"} ·{" "}
          <span className="font-normal text-muted-foreground">
            {dovoljno ? "spremno za poređenje" : "izaberite još jednu firmu"}
          </span>
        </span>
        <span className="flex gap-2">
          {dovoljno ? (
            <button
              type="button"
              onClick={() => setOtvoreno((o) => !o)}
              className="rounded-ui bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              {otvoreno ? "Sakrij" : "Uporedi"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              ocisti();
              setOtvoreno(false);
            }}
            className="rounded-ui border border-accent-ring px-3 py-1.5 text-[13px] font-semibold text-accent-strong transition-colors hover:bg-card"
          >
            Očisti
          </button>
        </span>
      </div>

      {otvoreno && dovoljno ? (
        <div className="mt-3 overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full border-collapse text-[13.5px]">
            <caption className="px-4 pt-3 pb-1 text-left text-[12.5px] text-muted-foreground">
              Izabrane firme, po poslednjem predatom finansijskom izveštaju.
            </caption>
            <thead>
              <tr>
                {["Firma", "Prihod", "Zaposleni", "Status", "Godina"].map((naslov) => (
                  <th
                    key={naslov}
                    scope="col"
                    className="border-b border-border bg-muted px-3 py-2 text-right text-[11.5px] font-semibold tracking-[0.05em] text-muted-foreground uppercase first:text-left"
                  >
                    {naslov}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {izabrane.map((firma) => (
                <tr key={firma.maticni_broj} className="hover:bg-muted">
                  <th scope="row" className="border-b border-border px-3 py-2.5 text-left font-semibold">
                    {kratkoIme({
                      poslovno_ime: firma.ime,
                      poslovno_ime_kratko: firma.imeKratko,
                      opstina: firma.opstina,
                    })}
                    <span className="block text-[12px] font-normal text-muted-foreground">
                      {imeOpstine(firma.opstina)}
                    </span>
                  </th>
                  <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">
                    {firma.ukupni_prihodi
                      ? formatNovac(firma.ukupni_prihodi * 1000, valuta, { kompaktno: true })
                      : NEMA_PODATAKA}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">
                    {formatBroj(firma.zaposleni)}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-right">
                    {firma.status ?? NEMA_PODATAKA}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">
                    {firma.godina ? formatDatum(`${firma.godina}-12-31`).slice(-5) : NEMA_PODATAKA}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
