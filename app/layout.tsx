import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { BREND, SITE_URL } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

/**
 * Postavlja klasu `.dark` PRE prvog paint-a, pa nema treperenja pri učitavanju.
 * Prvi izbor je zapamćena tema, zatim sistemska (`prefers-color-scheme`).
 * Namerno bez biblioteke i bez React stanja — ovo mora da se izvrši sinhrono
 * u <head>, pre nego što se telo stranice iscrta.
 */
const TEMA_SKRIPTA = `
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    if (t === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Proveri firmu pre nego što posluješ s njom | " + BREND,
  description:
    "Finansijski izveštaji, broj zaposlenih, status i pokazatelji za privredna društva u Srbiji, iz zvaničnih podataka Agencije za privredne registre.",
  applicationName: BREND,
  openGraph: {
    type: "website",
    siteName: BREND,
    locale: "sr_RS",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b10" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="sr", ne "sr-Latn": jedna verzija sajta, bez hreflang-a (SEO.md §1.8).
    // suppressHydrationWarning jer skripta iznad menja klasu na <html> pre hidratacije.
    <html
      lang="sr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_SKRIPTA }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        {/* Google Analytics (vlasnik, 15.08.2026). afterInteractive = učitava se
            posle hidratacije, ne usporava prvi crtež. */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-DXXKVQEJ7C"
          strategy="afterInteractive"
        />
        <Script id="gtag-config" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-DXXKVQEJ7C');`}
        </Script>
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
