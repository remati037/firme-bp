import Link from "next/link";

import { formatBroj } from "@/lib/format";

/**
 * Paginacija kao pravi `<a href>`, nikad JS dugme (SEO.md §2.3).
 * Svaka strana ima svoj URL i svoj ISR keš, pa Googlebot može da prošeta
 * kroz celu listu i dođe do svake firme.
 *
 * Prva strana je čist URL bez sufiksa, da canonical ne bi imao dva oblika.
 */
export function Paginacija({
  osnova,
  strana,
  brojStrana,
}: {
  osnova: string;
  strana: number;
  brojStrana: number;
}) {
  if (brojStrana <= 1) return null;

  // Paginacija ide kroz putanju, ne kroz ?strana=N: stranica koja čita
  // searchParams je dinamična, pa je Next ne prerenderuje ni ne kešira ISR-om.
  const href = (n: number) => (n === 1 ? osnova : `${osnova}/strana/${n}`);
  const stranice = rasporedStrana(strana, brojStrana);

  return (
    <nav aria-label="Paginacija" className="mt-7 flex flex-wrap justify-center gap-1.5">
      {strana > 1 ? (
        <Link href={href(strana - 1)} rel="prev" className={stilLinka}>
          ← Prethodna
        </Link>
      ) : null}

      {stranice.map((n, i) =>
        n === null ? (
          <span key={`tacke-${i}`} className="flex h-[38px] items-center px-2 text-muted-foreground">
            …
          </span>
        ) : n === strana ? (
          <span key={n} aria-current="page" className={`${stilLinka} ${stilAktivne}`}>
            {formatBroj(n)}
          </span>
        ) : (
          <Link key={n} href={href(n)} className={stilLinka}>
            {formatBroj(n)}
          </Link>
        ),
      )}

      {strana < brojStrana ? (
        <Link href={href(strana + 1)} rel="next" className={stilLinka}>
          Sledeća →
        </Link>
      ) : null}
    </nav>
  );
}

const stilLinka =
  "inline-flex h-[38px] min-w-[38px] items-center justify-center rounded-ui border border-border px-3 text-sm font-medium text-foreground no-underline tabular-nums transition-colors hover:border-primary hover:bg-accent-soft hover:text-primary";

const stilAktivne = "border-primary bg-primary font-bold text-primary-foreground";

/** Prva, poslednja, tekuća i po dve oko nje; ostalo su tri tačke. */
function rasporedStrana(strana: number, ukupno: number): (number | null)[] {
  const skup = new Set<number>([1, ukupno, strana]);
  for (let i = 1; i <= 2; i++) {
    if (strana - i > 1) skup.add(strana - i);
    if (strana + i < ukupno) skup.add(strana + i);
  }

  const poredak = [...skup].filter((n) => n >= 1 && n <= ukupno).sort((a, b) => a - b);
  const izlaz: (number | null)[] = [];

  poredak.forEach((n, i) => {
    if (i > 0 && n - poredak[i - 1] > 1) izlaz.push(null);
    izlaz.push(n);
  });

  return izlaz;
}
