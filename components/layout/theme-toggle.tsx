"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Prebacivanje svetle i tamne teme.
 *
 * Jedina klijentska komponenta u temelju frontenda (Faza A).
 * Ne drži stanje u Reactu: klasa `.dark` na <html> je izvor istine, a nju
 * postavlja inline skripta u <head> pre prvog paint-a (vidi app/layout.tsx).
 * Ikone se biraju CSS-om (`dark:` varijanta), pa nema hydration mismatch-a
 * ni treperenja pogrešne ikone.
 */
export function ThemeToggle() {
  function prebaci() {
    const koren = document.documentElement;
    const tamna = koren.classList.toggle("dark");
    try {
      localStorage.setItem("theme", tamna ? "dark" : "light");
    } catch {
      // Privatni režim ume da zabrani localStorage. Tema i dalje radi, samo se ne pamti.
    }
  }

  return (
    <button
      type="button"
      onClick={prebaci}
      aria-label="Promeni temu, svetla ili tamna"
      title="Promeni temu"
      className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-ui border border-border bg-card text-foreground transition-colors duration-150 hover:border-accent-ring hover:text-primary"
    >
      <Moon size={18} strokeWidth={2} className="block dark:hidden" aria-hidden />
      <Sun size={18} strokeWidth={2} className="hidden dark:block" aria-hidden />
    </button>
  );
}
