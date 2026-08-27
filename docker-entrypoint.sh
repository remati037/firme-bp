#!/bin/sh
# Entrypoint za self-hosted deploy.
#
# Posao je jedan: pripremiti ISR keš na trajnom volumenu pre nego što se server
# digne, pa spustiti privilegije.
#
# Zašto uopšte postoji:
#
# 1. Volumen se montira PREKO /app/.next/server/app i sakriva 795 stranica koje
#    su prerenderovane u build-u. Zato se drži netaknuta kopija u app-baked/ i
#    odatle se keš zaseje.
#
# 2. RSC payload-i u kešu referišu hash-eve JS chunk-ova iz SVOG build-a. Ako
#    keš prethodnog build-a dočeka nov BUILD_ID, dobijaju se 404 na chunk-ove i
#    hydration mismatch. Zato se keš briše čim se BUILD_ID promeni — to je
#    namerno, ne optimizacija koju treba "popraviti".
#
#    Praktična posledica: keš preživljava restart kontejnera, ali NE preživljava
#    deploy novog koda. Hladan start posle deploy-a pokriva Cloudflare
#    (edge TTL 30 dana, vidi docs/migration/RUNBOOK-MIGRACIJA.md).
#
# 3. Coolify pravi volumen kao root, a server radi kao `nextjs`. Bez chown-a bi
#    svaki ISR upis pao na EACCES i svaka stranica bi se renderovala iznova.

set -e

KES=/app/.next/server/app
ZASEJANO=/app/.next/server/app-baked
BUILD_ID_FAJL=/app/.next/BUILD_ID

if [ ! -f "$BUILD_ID_FAJL" ]; then
  echo "entrypoint: nema $BUILD_ID_FAJL — image nije ispravno sastavljen." >&2
  exit 1
fi

BID=$(cat "$BUILD_ID_FAJL")
mkdir -p "$KES"

if [ "$(cat "$KES/.build-id" 2>/dev/null)" != "$BID" ]; then
  echo "entrypoint: nov build ($BID) — brišem ISR keš prethodnog build-a."
  rm -rf "${KES:?}"/* "${KES:?}"/.build-id 2>/dev/null || true
  cp -a "$ZASEJANO"/. "$KES"/
  printf '%s' "$BID" > "$KES/.build-id"
  # Samo pri zasejavanju: na punom kešu od ~133k stranica ovo traje, a nema
  # svrhe — fajlove koje upiše server ionako pravi `nextjs`.
  chown -R nextjs:nodejs "$KES"
  echo "entrypoint: keš zasejan iz app-baked."
else
  echo "entrypoint: ISR keš odgovara build-u $BID, zadržavam ga."
  chown nextjs:nodejs "$KES"
fi

exec su-exec nextjs:nodejs node server.js
