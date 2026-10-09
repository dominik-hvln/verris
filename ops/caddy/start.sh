#!/bin/sh
# =============================================================================
# Verris — start Caddy (command usługi `caddy` w docker-compose.prod.yml)
# -----------------------------------------------------------------------------
# Jedno zadanie: zła składnia CADDY_INTERNAL_ALLOW_CIDR nie może położyć CAŁEGO
# Caddy (panel klienta, API, www) ani otworzyć paneli wewnętrznych.
#
# Caddy odrzuca konfigurację z niepoprawnym zakresem w remote_ip. Przy reloadzie
# to bezpieczne (zostaje poprzednia konfiguracja), ale przy starcie kontenera
# oznaczałoby pętlę restartów i brak wszystkich stron. Dlatego: jeśli Caddyfile
# nie przechodzi `caddy validate` z podaną listą, a przechodzi z pustą — startujemy
# z pustą listą, czyli staff/admin odpowiadają 403 (fail-closed, Caddyfile →
# vpn_only), a reszta stron działa. Głośny wpis w logu kontenera.
#
# Każdy inny błąd Caddyfile (nie związany z listą) — start jak dotąd, Caddy sam
# zgłosi błąd. Reload z wdrożenia (`caddy reload` przez exec) czyta env kontenera,
# nie ten skrypt — wtedy zła lista = reload odrzucony = działa poprzednia
# konfiguracja (i wdrożenie kończy się głośnym błędem).
# =============================================================================
set -eu

KONFIG="${CADDY_CONFIG:-/etc/caddy/Caddyfile}"

if ! caddy validate --config "$KONFIG" --adapter caddyfile >/dev/null 2>&1 \
  && CADDY_INTERNAL_ALLOW_CIDR= caddy validate --config "$KONFIG" --adapter caddyfile >/dev/null 2>&1; then
  echo "[verris] CADDY_INTERNAL_ALLOW_CIDR='${CADDY_INTERNAL_ALLOW_CIDR-}' jest niepoprawne — panele wewnętrzne zamknięte (403) do czasu poprawki w .env.prod i 'up -d caddy'." >&2
  CADDY_INTERNAL_ALLOW_CIDR=
  export CADDY_INTERNAL_ALLOW_CIDR
fi

exec caddy run --config "$KONFIG" --adapter caddyfile
