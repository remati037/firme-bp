# Biznis priče

Next.js skelet (App Router, TypeScript, Tailwind CSS) — landing sa logom i porukom "Uskoro više informacija".

## Pokretanje lokalno

```bash
npm install
npm run dev
```

Otvori [http://localhost:3000](http://localhost:3000).

## Skripte

- `npm run dev` — development server
- `npm run build` — produkcijski build
- `npm run start` — pokretanje produkcijskog builda
- `npm run lint` — ESLint

## Struktura

- `src/app/layout.tsx` — root layout, fontovi i meta podaci
- `src/app/page.tsx` — početna stranica (logo + tekst)
- `src/app/globals.css` — globalni stilovi i boje (crna pozadina)
- `public/bp-logo.png` — logo

## Deploy

Repo je spreman za [Vercel](https://vercel.com/new) — import GitHub repoa, bez dodatne konfiguracije.
