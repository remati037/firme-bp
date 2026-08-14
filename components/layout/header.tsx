import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";

/**
 * Sticky zaglavlje sa blurom, po prototipu (`.site-header`).
 *
 * Server komponenta: aktivna stavka navigacije se ne označava jer bi to
 * tražilo `usePathname`, a jedina dozvoljena klijentska komponenta u ovoj
 * fazi je ThemeToggle. Označavanje aktivne stavke dolazi u Fazi D, prosleđeno
 * kao prop sa stranice.
 *
 * Rute u navigaciji nastaju u Fazama C–F; do tada vraćaju 404.
 */
const NAVIGACIJA = [
  { href: "/delatnost", tekst: "Delatnosti" },
  { href: "/grad", tekst: "Opštine" },
  { href: "/najvece", tekst: "Najveće" },
  { href: "/blog", tekst: "Blog" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] w-full max-w-[1120px] items-center gap-6 px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center text-[19px] font-extrabold tracking-[-0.02em] text-foreground no-underline"
        >
          <span
            className="mr-2 inline-block h-[9px] w-[9px] -translate-y-px rounded-[3px] bg-primary"
            aria-hidden
          />
          Firme
        </Link>

        <nav
          aria-label="Glavna navigacija"
          className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {NAVIGACIJA.map((stavka) => (
            <Link
              key={stavka.href}
              href={stavka.href}
              className="rounded-lg px-3 py-1.5 text-[14.5px] font-medium whitespace-nowrap text-muted-foreground no-underline transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              {stavka.tekst}
            </Link>
          ))}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
