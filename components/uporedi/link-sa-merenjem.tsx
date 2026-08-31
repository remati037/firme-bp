"use client";

import Link from "next/link";

import { dogadjaj } from "@/lib/analitika";

/**
 * Link koji uz navigaciju prijavi događaj u GA4.
 *
 * Postoji da stranica poređenja ostane serverska: tabela i predlozi se
 * renderuju na serveru, a klijentski je samo ovaj omotač oko `<a href>`.
 * U HTML-u je i dalje običan link — radi bez JS-a, prima srednji klik i ne
 * pomera raspored.
 */
export function LinkSaMerenjem({
  href,
  dogadjajIme,
  parametri,
  className,
  title,
  ariaLabel,
  children,
}: {
  href: string;
  dogadjajIme: string;
  parametri?: Record<string, string | number>;
  className?: string;
  title?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => dogadjaj(dogadjajIme, parametri)}
      className={className}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}
