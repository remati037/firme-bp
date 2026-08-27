# MIGRATION BRIEF — Firme Biznis Price

Ovaj fajl je kontekst za migraciju sa Vercela na self-hosted infrastrukturu.
Ne menjaj ga tokom audita — on je ulaz, ne izlaz.

## Trenutno stanje

- **Projekat:** Firme Biznis Price — https://firme.biznisprice.com
- **Hosting:** Vercel (production)
- **Stack:** Next.js 16 App Router, Supabase (hosted), Clerk, shadcn/ui, Tailwind
- **Šta radi:** javna pretraga privrednih društava u Srbiji iz APR podataka.
  ~133.634 firme, detail stranica po firmi (`/firma/[slug]`), liste po delatnosti
  (`/delatnost/[sifra]`), po opštini (`/grad/[slug]`), rang liste (`/najvece`), blog.
  Podaci se osvežavaju mesečno (presek APR-a).
- **Saobraćaj:** značajan organski, SEO je primarni kanal akvizicije.
- **Repo:** GitHub, **public**.

## Ciljna infrastruktura

- **Hetzner Cloud VPS** — CX serija, region Nemačka (FSN1/NBG1) ili Finska (HEL1)
- **Coolify Cloud** — $5/mes control plane, BYO server (Coolify ne živi na našem serveru)
- **Cloudflare** ispred domena — DNS + proxy + CDN
- **Supabase i Clerk ostaju gde jesu** — ne migriraju se, ne diraju se

## Tvrda ograničenja

1. **Zero downtime.** Sajt je u produkciji i nosi organski saobraćaj.
2. **SEO ne sme da regresira.** Nijedan indeksirani URL ne sme da vrati 404, 5xx
   ili da promeni canonical. Redirects/rewrites moraju da se prenesu 1:1.
3. **Rollback na Vercel mora da bude moguć u roku od 48h**, bez ponovnog build-a.
4. Repo je public — nijedan secret ne sme da završi u git-u niti u build argumentima
   koji se loguju.

## Pitanja na koja audit mora da odgovori

Numeracija je fiksna; koristi iste brojeve u izlaznom fajlu.

**Iz koda (odgovara Claude Code):**

1. Rendering strategija za `/firma/[slug]` i ostale dinamičke rute: full SSG preko
   `generateStaticParams`, ISR sa `revalidate`, ili čist SSR? Koliko stranica se
   generiše u build-u? Koliko traje `next build` i kolika je veličina `.next`?
2. Postoji li `output: 'standalone'` u `next.config`? Postoji li `Dockerfile`?
3. Kompletan spisak `redirects()`, `rewrites()`, `headers()` iz `next.config`.
4. `middleware.ts`: matcher, šta radi po requestu, koliko je Clerk uključen u njega.
5. Spisak SVIH `process.env` imena (samo imena, bez vrednosti), razdvojeno na
   server-only i `NEXT_PUBLIC_*`.
6. Vercel-specific zavisnosti: `@vercel/*` paketi, `runtime = 'edge'`, `vercel.json`
   (posebno `crons`), Vercel Analytics/Speed Insights.
7. Cron / scheduled poslovi: gde su definisani, šta rade, koliko traju, da li zovu
   `revalidatePath` / `revalidateTag` posle importa APR podataka.
8. `next/image` upotreba: da li ima remote slika, koji `remotePatterns`, da li je
   `sharp` u dependencies.
9. Auth površina: koje rute su iza Clerk-a, ima li Clerk webhook route handler-a.
10. Supabase pristup: koji klijent (`@supabase/ssr` / `postgres.js` / Prisma / Drizzle),
    da li se koristi service role key, da li se ide preko pooler-a ili direktno.
11. Package manager, Node verzija (`engines`, `.nvmrc`), build i start skripte.
12. Sitemap i robots: kako se generišu i koliko URL-ova, da li je split na više fajlova.

**Van koda (popunjava vlasnik ručno u `INFRA-FACTS.md`):**

- Brojke saobraćaja, Supabase region, Cloudflare/DNS stanje, Clerk custom domain,
  Vercel build settings i cron definicije iz dashboard-a.

## Pravila za izlaz

- Piši na srpskom, tehnički termini i kod na engleskom.
- Bez opštih saveta. Samo činjenice iz koda, sa putanjama do fajlova i brojevima linija.
- Ako nešto ne možeš da utvrdiš iz koda, napiši `NEPOZNATO — treba proveriti u <gde>`.
  Nemoj da nagađaš.
- Nikada ne ispisuj vrednosti env varijabli, samo imena.
