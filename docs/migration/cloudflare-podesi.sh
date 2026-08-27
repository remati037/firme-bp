#!/usr/bin/env bash
#
# Cloudflare podešavanja za firme.biznisprice.com, preko API-ja.
#
# Zašto skripta a ne klikanje: Cloudflare je promenio interfejs (avgust 2026),
# a API je ostao isti. Uz to je ovo ponovljivo i vidi se u gitu šta je podešeno.
#
# POKREĆE SE TEK POSLE CUTOVER-a (korak 8), kad `firme.biznisprice.com` već
# pokazuje na Hetzner i kad je narandžasti oblak upaljen. Ranije bi počelo da
# kešira Vercel verziju sajta.
#
# Upotreba:
#   export CF_API_TOKEN=...        # token sa Zone Settings:Edit + Cache Rules:Edit
#   export CF_ZONE_ID=...          # Cloudflare -> pregled zone -> Zone ID
#   ./docs/migration/cloudflare-podesi.sh              # suvi prolaz, ništa ne menja
#   ./docs/migration/cloudflare-podesi.sh --potvrdi    # stvarno primeni

set -euo pipefail

POTVRDI=0
[[ "${1:-}" == "--potvrdi" ]] && POTVRDI=1

: "${CF_API_TOKEN:?Nedostaje CF_API_TOKEN}"
: "${CF_ZONE_ID:?Nedostaje CF_ZONE_ID}"

API="https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID"

zovi() { # metod putanja telo
  local metod="$1" putanja="$2" telo="${3:-}"
  if [[ $POTVRDI -eq 0 ]]; then
    echo "  [suvi prolaz] $metod $putanja"
    [[ -n "$telo" ]] && echo "$telo" | head -c 400 | sed 's/^/      /'
    echo
    return 0
  fi
  local odgovor
  odgovor=$(curl -sS -X "$metod" "$API$putanja" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    ${telo:+--data "$telo"})
  if echo "$odgovor" | tr -d ' \n' | grep -q '"success":true'; then
    echo "  OK  $metod $putanja"
  else
    echo "  GREŠKA  $metod $putanja"
    echo "$odgovor" | head -c 600
    echo
    return 1
  fi
}

echo "== Osnovna podešavanja =="
# Full (strict): šifrovano i do Cloudflare-a i od njega do servera, uz proveru
# da sertifikat valja. Traži važeći Let's Encrypt na serveru — Coolify ga vadi.
zovi PATCH /settings/ssl                      '{"value":"strict"}'
zovi PATCH /settings/always_use_https         '{"value":"on"}'
zovi PATCH /settings/automatic_https_rewrites '{"value":"on"}'
zovi PATCH /settings/brotli                   '{"value":"on"}'

echo
echo "== Pravila za keš =="
# REDOSLED: kod Cloudflare Cache Rules primenjuju se SVA pravila koja se
# poklope, i POSLEDNJE pobeđuje — suprotno starim Page Rules. Zato ide od
# najopštijeg ka najspecifičnijem: html je prvi (osnova), bypass RSC poslednji
# (mora da pregazi sve). Obrnut redosled je 27.08.2026. dao EXPIRED na OG
# slikama i nekeširan /api/search, jer je pravilo "html" gazilo oba.
#
# Svako pravilo je ograničeno na `http.host eq "firme.biznisprice.com"`.
# Bez toga važe za CELU zonu, uključujući apex biznisprice.com koji je na
# drugom hostingu i nema veze sa ovom selidbom.
#
# Redosled u nizu = redosled primene. Prvo pravilo je najvažnije: bez njega
# Cloudflare meša RSC odgovor i HTML na istoj adresi (poštuje samo
# Vary: Accept-Encoding), pa se stranice raspadaju bez traga u logu.
PRAVILA=$(cat <<'JSON'
{
  "rules": [
    {
      "description": "01 - html (osnova)",
      "expression": "(http.host eq \"firme.biznisprice.com\") and (not starts_with(http.request.uri.path, \"/api/\"))",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl":    { "mode": "respect_origin" },
        "browser_ttl": { "mode": "override_origin", "default": 300 }
      }
    },
    {
      "description": "02 - next static",
      "expression": "(http.host eq \"firme.biznisprice.com\") and (starts_with(http.request.uri.path, \"/_next/static/\"))",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "respect_origin" }
      }
    },
    {
      "description": "03 - api bypass",
      "expression": "(http.host eq \"firme.biznisprice.com\") and (starts_with(http.request.uri.path, \"/api/\"))",
      "action": "set_cache_settings",
      "action_parameters": { "cache": false }
    },
    {
      "description": "04 - api search",
      "expression": "(http.host eq \"firme.biznisprice.com\") and (http.request.uri.path eq \"/api/search\")",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl":    { "mode": "respect_origin" },
        "browser_ttl": { "mode": "respect_origin" }
      }
    },
    {
      "description": "05 - og slike",
      "expression": "(http.host eq \"firme.biznisprice.com\") and (ends_with(http.request.uri.path, \"/opengraph-image\"))",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl":    { "mode": "override_origin", "default": 2592000 },
        "browser_ttl": { "mode": "override_origin", "default": 86400 }
      }
    },
    {
      "description": "06 - bypass RSC",
      "expression": "(http.host eq \"firme.biznisprice.com\") and ((len(http.request.headers[\"rsc\"]) > 0) or (len(http.request.headers[\"next-router-prefetch\"]) > 0) or (http.request.uri.query contains \"_rsc=\"))",
      "action": "set_cache_settings",
      "action_parameters": { "cache": false }
    }
  ]
}
JSON
)
zovi PUT /rulesets/phases/http_request_cache_settings/entrypoint "$PRAVILA"

echo
if [[ $POTVRDI -eq 0 ]]; then
  echo "Ovo je bio suvi prolaz. Ništa nije promenjeno."
  echo "Kad si siguran, pokreni ponovo sa --potvrdi"
else
  echo "Gotovo. Proveri:"
  echo "  curl -sI https://firme.biznisprice.com/firma/<slug> | grep -i cf-cache-status"
  echo "  curl -sI -H 'RSC: 1' https://firme.biznisprice.com/firma/<slug> | grep -i cf-cache-status"
fi

echo
echo "NAPOMENA — ovo skripta NE dira, uradi ručno u panelu:"
echo "  * Bot Fight Mode i 'Block AI Scrapers' moraju biti ISKLJUČENI"
echo "    (app/robots.ts namerno pušta GPTBot, ClaudeBot, PerplexityBot)"
echo "  * Tiered Cache: uključiti"
echo "  * Rate limit 5/min na /api/ujp-proba"
