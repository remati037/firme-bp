import { Search } from "lucide-react";

/**
 * Polje za pretragu — placeholder iz Faze A.
 *
 * Izgled je konačan (prototip, `.searchbox`), ponašanje nije: autocomplete,
 * tastatura i `/api/search` dolaze u Fazi C, kada ova komponenta postaje
 * klijentska. Do tada je polje onemogućeno da ne obećava ono što ne radi.
 */
export function SearchBox({ napomena }: { napomena?: string }) {
  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-border-strong bg-card px-4 py-3.5 text-base">
        <Search size={19} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          disabled
          placeholder="Naziv firme, matični broj ili PIB…"
          aria-label="Pretraga firmi"
          autoComplete="off"
          className="w-full flex-1 border-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <kbd className="rounded-md border border-border bg-muted px-[7px] py-0.5 text-[11.5px] text-muted-foreground max-sm:hidden">
          /
        </kbd>
      </div>
      {napomena ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">{napomena}</p>
      ) : null}
    </div>
  );
}
