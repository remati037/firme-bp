# syntax=docker/dockerfile:1.7
#
# Image za self-hosted deploy (Hetzner + Coolify).
#
# Gradi se u GitHub Actions, gura se u privatan GHCR, Coolify ga samo povlači.
# Razlog: SUPABASE_SERVICE_ROLE_KEY je potreban u BUILD fazi (795 stranica se
# prerenderuje iz baze), a repo je public. BuildKit `--secret` drži ključ samo
# unutar jednog RUN-a — ne ulazi ni u sloj, ni u `docker history`.
#
# Node 24 jer produkcija na Vercelu radi na 24.x (potvrda vlasnika 27.08.2026).

# --- 1. zavisnosti -----------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- 2. build ----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* se inline-uje u klijentski bundle, pa MORA postojati u build-u.
# Sve tri su javne po prirodi (URL projekta, anon ključ, adresa sajta) i smeju
# kao ARG. Tajni ključ NE SME — vidi RUN ispod.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1

# Bez ovog ključa build puca na prerenderu /mapa/[metrika] i /delatnost
# (lib/supabase.ts:21). Mount postoji samo dok traje ova komanda.
RUN --mount=type=secret,id=supabase_service_role \
    SUPABASE_SERVICE_ROLE_KEY="$(cat /run/secrets/supabase_service_role)" \
    npm run build

# lib/blog.ts čita content/blog/*.md preko process.cwd() i u RUNTIME-u: /blog je
# dinamična ruta (čita searchParams), a /sitemaps/staticne.xml zove sviClanci()
# pri svakoj revalidaciji. Next-ovo file tracing ih danas uvlači u standalone
# samo od sebe — ovo je osigurač da tiha promena u tracing-u ne postane 500 u
# produkciji tek kad neko otvori blog.
RUN test -n "$(find .next/standalone/content/blog -name '*.md' 2>/dev/null)" \
 || { echo "GREŠKA: content/blog nije u standalone izlazu."; exit 1; }

# Volumen se u produkciji montira preko .next/server/app i sakrio bi 795
# prerenderovanih stranica. Sklanjaju se u app-baked, odakle ih entrypoint
# zaseje. Premeštanje, ne kopiranje — inače bi image nosio 387 MB dvaput.
RUN mv .next/standalone/.next/server/app .next/standalone/.next/server/app-baked

# --- 3. runtime --------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# su-exec: entrypoint mora kao root da sredi vlasništvo nad volumenom,
# pa tek onda spušta privilegije.
RUN apk add --no-cache su-exec \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder            /app/public                       ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone  ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static      ./.next/static

# standalone već nosi content/blog i .next/server/app-baked (vidi builder).

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
