# Razvojni plan: firme.biznisprice.com

Radna knjiga za vibe coding kroz Claude Code (Opus model).
Svaka sesija ima: cilj, prompt koji kopiraš doslovno, i uslov završetka.
Ne prelazi na sledeću sesiju dok uslov završetka nije ispunjen.

Preduslov: fajl `CLAUDE.md` (dobio si ga uz ovaj plan) mora biti u korenu repoa PRE prve sesije.

---

## Kako radiš sa modelom, pet pravila

1. **Nova sesija za svaku stavku.** Posle svake završene sesije uradi `/clear` ili otvori novu. Dugačak kontekst kvari kvalitet i troši tokene.
2. **Plan mode za veće sesije.** Za sesije označene sa [PLAN] prvo uključi plan mode (Shift+Tab dva puta), pusti model da izloži plan, pregledaj ga, pa tek onda odobri izvršavanje.
3. **Commit posle svake sesije.** Model neka sam napiše commit poruku. Grana po funkcionalnosti, merge u main tek kad vidiš preview na Vercelu.
4. **Ako model krene da menja šemu baze, prekini ga.** Šema je zaključana u CLAUDE.md. Reci "šema je zaključana, nađi rešenje bez izmene šeme".
5. **Uslov završetka je zakon.** Ako testovi ne prolaze, sesija nije gotova, pa makar sve izgledalo lepo.

---

## FAZA 0: Priprema (bez modela, tvojih 60 minuta)

Ovo uradi ručno, nije za AI:

- [ ] GitHub repo `biznisprice-firme`, privatan
- [ ] Supabase projekat (region Frankfurt, najbliži)
- [ ] Vercel projekat povezan sa repoom
- [ ] U Vercel env varijable: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
- [ ] Kod svog DNS provajdera: CNAME `firme` → `cname.vercel-dns.com`
- [ ] Google Search Console: dodaj `firme.biznisprice.com` kao property (verifikacija preko DNS TXT zapisa)
- [ ] Kopiraj `CLAUDE.md` u koren repoa
- [ ] Otvori nalog za Plausible ili uključi Vercel Analytics

---

## SESIJA 1: Inicijalizacija projekta

**Grana:** `main` (jedina sesija direktno na main)

**Prompt:**

```
Pročitaj CLAUDE.md. Inicijalizuj Next.js 15 projekat u ovom repou:
- App Router, TypeScript strict, Tailwind CSS, ESLint
- Instaliraj i podesi shadcn/ui (default tema, neutral boja)
- Instaliraj @supabase/supabase-js
- Napravi lib/supabase.ts sa dva klijenta: browser klijent (anon key) i
  server klijent (service role key), čitaj iz env varijabli
- Napravi .env.example sa imenima svih potrebnih varijabli, bez vrednosti
- .gitignore mora da pokriva .env i .env.local
- Napravi minimalni app/page.tsx sa naslovom "Biznis priče | Firme" i
  placeholder tekstom, samo da build prolazi
- Proveri da npm run build prolazi bez grešaka i bez warninga
```

**Uslov završetka:** `npm run build` prolazi, deploy na Vercel zelen, otvara se placeholder stranica na firme.biznisprice.com.

---

## SESIJA 2: Šema baze

**Grana:** `feat/schema`

**Prompt:**

```
Pročitaj CLAUDE.md, sekciju "Šema baze je ZAKLJUČANA".
Napravi supabase/migrations/001_initial_schema.sql koji kreira:

1. Sve tabele tačno kako su definisane u CLAUDE.md: companies, financials,
   financials_history, nace_codes, municipalities, ai_summaries, snapshots
2. Ekstenziju pg_trgm
3. GIN indeks na companies.poslovno_ime_norm sa gin_trgm_ops
4. Indekse: companies(sifra_delatnosti), companies(sifra_opstine),
   companies(status_aktivan), financials(godina),
   financials_history(maticni_broj, datum_preseka)
5. Materijalizovane view-ove mv_delatnost_stats, mv_opstina_stats,
   mv_company_ranks kako su opisani u CLAUDE.md. Za medijanu koristi
   percentile_cont(0.5). mv_company_ranks koristi rank() over particiju
   po delatnosti odnosno opštini, sortirano po ukupni_prihodi desc.
6. Funkciju refresh_all_stats() koja osvežava sva tri view-a
7. RLS: uključi na svim tabelama, SELECT dozvoljen za anon rolu na svim
   tabelama osim snapshots, INSERT/UPDATE/DELETE samo za service role

Napiši i kratak README u supabase/ kako se migracija primenjuje.
Ne primenjuj ništa, samo napiši fajl.
```

Zatim migraciju primeni sam kroz Supabase SQL editor (kopiraš sadržaj fajla, pokreneš, pogledaš da li je prošlo). Ako imaš Supabase MCP konektovan u Claude Code, možeš reći modelu da je primeni, ali pregledaj SQL pre toga.

**Uslov završetka:** sve tabele i view-ovi postoje u Supabase, `select * from companies limit 1` radi (prazno je, ali ne puca).

---

## SESIJA 3: Ingest pipeline [PLAN]

**Grana:** `feat/ingest`

Ovo je najvažnija sesija u projektu. Koristi plan mode.

**Prompt:**

```
Pročitaj CLAUDE.md, sekcije "Izvori podataka" i "Normalizacija".
Napravi scripts/ingest.ts koji se pokreće sa npx tsx scripts/ingest.ts:

1. Povlači sva tri APR open data endpointa. Pazi na TLS napomenu iz
   CLAUDE.md: dodaj Sectigo intermediate sertifikat u CA lanac
   (fajl scripts/certs/sectigo-intermediate.pem, skini ga i komituj).
   Timeout 120s, 3 pokušaja sa eksponencijalnim backoffom.
2. Sirove JSON odgovore gzipuje i arhivira u Supabase Storage bucket
   "snapshots" pod putanjom {DatumPreseka}/companies.json.gz itd.
   Upiši red u tabelu snapshots.
3. Ako red za taj DatumPreseka već postoji u snapshots, prekini sa
   porukom "presek već obrađen" i exit code 0.
4. Normalizacija po pravilima iz CLAUDE.md: transliteracija opština
   ćirilica u latinicu (eksplicitna mapa u lib/transliterate.ts),
   slugify po definisanom pravilu, poslovno_ime_norm za pretragu.
5. Upsert u companies (on conflict maticni_broj) i financials
   (on conflict maticni_broj, godina). Batch od po 1000 redova.
6. Svaki red iz financial-statements upiši i u financials_history
   sa tekućim datum_preseka.
7. Na kraju pozovi refresh_all_stats() i ispiši statistiku:
   ukupno redova, novih, izmenjenih, trajanje.

Napravi i scripts/seed-sifarnici.ts koji puni nace_codes i municipalities.
Za nace_codes koristi zvaničnu klasifikaciju delatnosti Republike Srbije
(Uredba o klasifikaciji delatnosti 2010), ugradi je kao statički JSON u
scripts/data/. Za municipalities isto, sa šiframa opština iz APR seta.

Napravi tests/ingest.test.ts (vitest) koji nad bazom proverava:
- broj firmi veći od 100.000
- nema duplikata slugova
- nema reda bez maticni_broj
- nijedna vrednost u poslovno_ime_norm nema velika slova ni interpunkciju
- svaka šifra delatnosti iz companies postoji u nace_codes
```

**Uslov završetka:** ingest prošao dva puta zaredom bez greške (drugi put mora da kaže "presek već obrađen"), svi testovi zeleni, u Supabase vidiš ~133.000 firmi i ~123.000 finansijskih redova, snapshot arhiviran u Storage.

---

## SESIJA 4: PIB mapiranje iz NBS

**Grana:** `feat/pib`

Pre sesije: registruj se na NBS sistem veb servisa (nbs.rs, sekcija Servisi), besplatno je. Dobijaš pristupne parametre za registar imalaca računa.

**Prompt:**

```
Napravi scripts/enrich-pib.ts koji preko NBS veb servisa za Jedinstveni
registar računa mapira matični broj na PIB i radi update companies.pib.
Pristupni parametri iz env varijabli NBS_USERNAME i NBS_PASSWORD.
NBS servis je SOAP, koristi minimalan ručni XML, ne uvodi tešku SOAP
biblioteku. Obrađuj u batchevima, loguj napredak na svakih 5000.
Idempotentno: preskoči firme koje već imaju pib.
Test: posle obrade, više od 90% aktivnih firmi ima pib.
```

Ako NBS registracija potraje (ume da traje par dana), preskoči ovu sesiju i vrati se kasnije. Ništa drugo ne zavisi od nje, stranice rade i bez PIB-a, samo prikazuju "PIB: uskoro".

**Uslov završetka:** preko 90% aktivnih firmi ima popunjen PIB, ili je sesija svesno odložena.

---

## SESIJA 5: Pretraga

**Grana:** `feat/search`

**Prompt:**

```
Pročitaj CLAUDE.md, sekcije "Rutiranje" i "ISR i performanse".

1. Napravi app/api/search/route.ts: prima query parametar q, minimum 2
   karaktera. Pretražuje companies.poslovno_ime_norm pg_trgm sličnošću
   (similarity + ilike kombinacija), a ako je q čisto numerički sa 8 ili
   9 cifara, traži i po maticni_broj i pib tačnim poklapanjem.
   Vraća top 10: poslovno_ime, opstina, status, slug. Cache header
   s-maxage=3600. Napravi za ovo Postgres funkciju search_companies(q text)
   preko migracije 002 (ovo je dozvoljena izmena: funkcija, ne šema).
2. Napravi komponentu components/search-box.tsx: input sa debounce 300ms,
   dropdown sa rezultatima, navigacija strelicama, enter vodi na
   /firma/[slug]. Status firme prikaži bojom po pravilu iz CLAUDE.md.
3. Postavi je na app/page.tsx kao hero: naslov "Proveri svaku firmu u
   Srbiji", podnaslov "Besplatni podaci iz APR za 133.000+ firmi",
   ispod pretrage tri linka: Najveće firme, Po delatnosti, Po gradu.
```

**Uslov završetka:** pretraga "delta" vraća Delta Holding za manje od 300ms, pretraga po matičnom broju radi, radi na preview deploju.

---

## SESIJA 6: Stranica firme [PLAN]

**Grana:** `feat/company-page`

Srce proizvoda. Plan mode obavezno.

**Prompt:**

```
Pročitaj CLAUDE.md, sekciju "Struktura stranice firme" i drži se
redosleda sekcija doslovno.

Napravi app/firma/[slug]/page.tsx:

1. Server komponenta. Podaci: companies + financials (poslednja godina) +
   mv_delatnost_stats + mv_opstina_stats + mv_company_ranks, jedan RPC
   poziv get_company_page(slug) koji napravi kao Postgres funkciju
   (migracija 003), vraća sve kao jedan JSON. Nema vodopada upita.
2. Sekcije 1 do 4 i 6 do 8 iz CLAUDE.md renderuj odmah (sekcija 5,
   AI sažetak, ide u sledećoj sesiji: ostavi <Suspense> placeholder).
3. Pokazatelje računaj u lib/metrics.ts sa unit testovima:
   prihodPoZaposlenom, netoMarza, odnosKapitalImovina,
   poredjenjeSaMedijanom (vraća procenat i smer), signali (niz stringova
   po pravilima iz CLAUDE.md sekcija Signali).
4. Novčane vrednosti formatiraj po pravilu iz CLAUDE.md (hiljade RSD
   puta 1000, sr-RS format, nula je "Nema podataka").
5. generateMetadata po šablonu iz CLAUDE.md. JSON-LD Organization.
6. generateStaticParams: top 10.000 po prihodima. revalidate = 2592000.
7. notFound() za nepostojeći slug, sa predlogom pretrage.
8. Dizajn: čisto, mnogo belog prostora, shadcn Card komponente,
   maksimalna širina 4xl, mobilni prvo. Bez grafikona.
```

**Uslov završetka:** stranica bilo koje firme se otvara ispod sekunde, Lighthouse SEO 100, sve sekcije prikazuju tačne brojeve (ručno uporedi tri firme sa podacima na pretraga.apr.gov.rs), unit testovi za metrics zeleni.

---

## SESIJA 7: AI sažetak

**Grana:** `feat/ai-summary`

**Prompt:**

```
Pročitaj CLAUDE.md, sekciju "AI sažetak, stroga pravila". Sve iz nje
je obavezno: zabrane, keširanje, rate limit, fallback.

1. lib/prompts/summary.ts: system prompt na srpskom koji sprovodi sva
   pravila iz CLAUDE.md. User poruka je JSON sa podacima firme,
   pokazateljima i medijanima delatnosti.
2. app/api/summary/[mb]/route.ts: keš iz ai_summaries po maticni_broj i
   datum_preseka, generisanje najjeftinijim dostupnim Claude modelom,
   upis u keš, vraćanje. Rate limit 30/IP/sat u memoriji procesa.
3. components/ai-summary.tsx: klijentska komponenta, fetch na mount,
   skeleton dok čeka, ništa ne renderuje ako je summary null.
   Ispod sažetka sitnim slovima: "Sažetak je generisan automatski na
   osnovu javnih podataka APR i ne predstavlja bonitetnu ocenu."
4. Ubaci u Suspense slot na stranici firme iz prošle sesije.
5. Test za prompt: pozovi generisanje za firmu sa svim nulama i proveri
   da odgovor pominje nepredat izveštaj a ne izmišlja brojeve.
```

**Uslov završetka:** sažetak se generiše za manje od 5 sekundi, drugi poziv za istu firmu ide iz keša (proveri u bazi), firma bez izveštaja dobija korektan tekst, trošak po sažetku ispod 0,01 USD.

---

## SESIJA 8: Kategorijske stranice [PLAN]

**Grana:** `feat/categories`

**Prompt:**

```
Pročitaj CLAUDE.md, sekciju "Rutiranje".

1. app/delatnost/[sifra]/page.tsx: naziv delatnosti, statistika iz
   mv_delatnost_stats (broj firmi, medijan prihoda, medijan marže),
   tabela top 100 firmi po prihodu sa linkovima, paginacija po 100.
   Title: "Najveće firme: {naziv delatnosti} u Srbiji ({godina}) |
   Biznis priče"
2. app/grad/[opstina]/page.tsx: isto po opštini, iz mv_opstina_stats.
   Slug opštine je latinična verzija malim slovima.
3. app/delatnosti/page.tsx i app/gradovi/page.tsx: indeksne liste svih
   delatnosti odnosno opština sa brojem firmi, grupisano (delatnosti po
   sektoru, opštine po okrugu).
4. app/najvece/page.tsx i app/najvece/[metrika]/page.tsx za metrike:
   prihod, dobit, zaposleni, prihod-po-zaposlenom. Top 100, tabela.
5. Sve stranice: revalidate 2592000, generateStaticParams za sve
   delatnosti i opštine (ima ih ukupno ispod 800, sve statički),
   breadcrumb JSON-LD, interni linkovi na firme.
6. Na stranici firme dodaj linkove ka delatnosti i gradu firme.
```

**Uslov završetka:** /delatnost/6201 prikazuje IT firme sa tačnim medijanima, /grad/nis radi, /najvece/prihod ima smislen redosled (proveri da je vrh liste realan: NIS, EPS, Delta i slično).

---

## SESIJA 9: Sitemap, robots, SEO tehnika

**Grana:** `feat/seo`

**Prompt:**

```
1. app/sitemap.xml/route.ts: sitemap INDEX koji lista
   /sitemaps/staticne.xml, /sitemaps/kategorije.xml i
   /sitemaps/firme-1.xml do firme-N.xml (po 45.000 URL-ova po fajlu).
2. app/sitemaps/[file]/route.ts: generiše konkretan sitemap iz baze.
   Firme sortirane po prihodu opadajuće (najbitnije prve).
   lastmod = datum_preseka. Cache s-maxage=86400.
3. app/robots.txt/route.ts: dozvoli sve, disallow /api/, referenca
   na sitemap.
4. Proveri da SVAKA stranica ima: canonical URL, og:title, og:description,
   og:image (statična brendirana slika za sada), lang="sr-Latn".
5. app/o-podacima/page.tsx: statična stranica po CLAUDE.md, odakle su
   podaci, licenca, disclaimer, kontakt za ispravke, datum preseka.
6. Footer komponenta na svim stranicama sa obaveznim tekstom izvora
   iz CLAUDE.md i linkom na o-podacima i na biznisprice.com.
```

**Uslov završetka:** sitemap index se otvara i validira, nasumični sitemap fajl ima ispravne URL-ove, svaka stranica ima canonical i footer sa izvorom.

---

## SESIJA 10: Mesečni cron

**Grana:** `feat/cron`

**Prompt:**

```
Napravi .github/workflows/monthly-ingest.yml:
- cron: 5. u mesecu u 03:00 UTC, plus workflow_dispatch za ručno
- koraci: checkout, node 20, npm ci, npx tsx scripts/ingest.ts,
  npx tsx scripts/enrich-pib.ts, npm test
- env iz GitHub Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  NBS_USERNAME, NBS_PASSWORD
- posle uspešnog ingesta pozovi Vercel deploy hook (secret
  VERCEL_DEPLOY_HOOK) da se regenerišu statičke stranice
- ako bilo koji korak padne, workflow je crven (bez skrivanja greške)
- dodaj u scripts/ingest.ts proveru: ako novi broj firmi odstupa više
  od 5% od prethodnog preseka, prekini PRE upserta i izađi sa greškom
```

Zatim ručno dodaj secrets u GitHub repo settings i pokreni workflow_dispatch jednom da vidiš da prolazi.

**Uslov završetka:** ručno pokrenut workflow zelen od početka do kraja (reći će "presek već obrađen", to je uspeh).

---

## SESIJA 11: Poliranje pred lansiranje

**Grana:** `feat/polish`

**Prompt:**

```
Prođi kroz ceo sajt i sredi:
1. 404 stranica sa pretragom. error.tsx sa porukom na srpskom.
2. loading.tsx skeleton za stranicu firme i kategorijske stranice.
3. Mobilni pregled: tabele moraju biti skrolabilne horizontalno,
   pretraga upotrebljiva palcem, font minimum 16px u inputima.
4. Meta og:image: napravi dinamičku OG sliku (next/og, ImageResponse)
   za stranice firmi: ime firme, opština, prihod, status. Brendirana,
   tamna pozadina, logotip tekstom "Biznis priče | Firme".
5. Plausible ili Vercel Analytics snippet.
6. Lighthouse na 5 tipova stranica: sve kategorije preko 90,
   SEO tačno 100. Ispravi šta ne valja.
7. npm run build bez ijednog warninga.
```

**Uslov završetka:** Lighthouse ciljevi ispunjeni, sajt izgleda pristojno na telefonu, OG slika se prikazuje kad podeliš link u Viber/WhatsApp.

---

## SESIJA 12: Lansiranje (bez modela, tvoj posao)

- [ ] Merge svega u main, produkcioni deploy
- [ ] Search Console: pošalji sitemaps/staticne.xml i kategorije.xml odmah
- [ ] Posle 7 dana: pošalji firme-1.xml (top 45.000 po prihodu)
- [ ] Posle još 14 dana: ostatak
- [ ] Link u meniju biznisprice.com ka firme.biznisprice.com
- [ ] Objava: Reel "koliko stvarno zarađuju firme u Srbiji", newsletter, spominjanje u podkastu
- [ ] Prvi sadržajni komad iz podataka (top lista delatnosti koju pokrivaš u epizodi)

---

## Redosled i zavisnosti

```
S1 → S2 → S3 → S5 → S6 → S7 → S8 → S9 → S10 → S11 → S12
            ↘ S4 (nezavisna, čim stigne NBS pristup)
```

Realan tempo: S1 i S2 u jednom danu. S3 jedan do dva dana (tu će biti iteracija). S4 čeka NBS. S5 pola dana. S6 jedan dan. S7 pola dana. S8 jedan dan. S9 do S11 po pola dana. Ukupno 8 do 10 radnih dana čistog rada, raspoređeno kako ti odgovara, unutar budžeta od 40 sati.

## Kad nešto zapne, tri pravila za debug

1. Zalepi modelu celu grešku, ne prepričavaj je.
2. Ako isti problem ne reši iz dva pokušaja, uradi /clear i opiši problem iznova u svežoj sesiji, sa greškom i relevantnim fajlom. Svež kontekst rešava ono što zaglavljeni ne može.
3. Ako model predlaže da "privremeno isključi" test, RLS ili TLS proveru, to je uvek pogrešan put. Traži pravo rešenje.
