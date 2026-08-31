/**
 * Slanje događaja u Google Analytics 4.
 *
 * `gtag` se učitava u `app/layout.tsx` sa `strategy="afterInteractive"`, pa ga
 * u trenutku prvog rendera još nema. Zato se ovde nikad ne pretpostavlja da
 * postoji: bez njega poziv tiho prođe. Merenje ne sme da obori stranicu, a
 * blokatori reklama ga rutinski uklanjaju.
 *
 * Parametri događaja u GA4 ne pojavljuju se u izveštajima sami od sebe — svaki
 * mora da se registruje kao prilagođena dimenzija u Admin → Custom definitions.
 */

declare global {
  interface Window {
    gtag?: (komanda: string, ime: string, parametri?: Record<string, unknown>) => void;
  }
}

export function dogadjaj(ime: string, parametri: Record<string, string | number> = {}): void {
  if (typeof window === "undefined") return;
  window.gtag?.("event", ime, parametri);
}
