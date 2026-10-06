#!/usr/bin/env bash
# Uzupełnia /etc/verris/security/egress-allow-hostnames.local.txt domenami klientów z Postgres.
# security-control-plane-egress.sh czyta ten plik obok egress-allow-hostnames.txt (budowa zbioru,
# start hosta, timer --odswiez) — osobnego pliku scalonego już nie ma.
#
#   sudo bash ops/scripts/security-sync-cp-egress-hosts.sh
set -euo pipefail

LOCAL_FILE="${LOCAL_FILE:-/etc/verris/security/egress-allow-hostnames.local.txt}"
WORKDIR="${WORKDIR:-/opt/verris}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"

# Na stderr: log() bywa wołany wewnątrz $(psql_cp …) — na stdout ostrzeżenie trafiało do listy domen.
log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Run as root"
install -d "$(dirname "$LOCAL_FILE")"

PG_CONTAINER="${PG_CONTAINER:-${COMPOSE_PROJECT_NAME}-postgres-1}"
# Baza i użytkownik z env kontenera (docker-compose.prod.yml: POSTGRES_DB domyślnie verris_db). Do 2026-10-06
# stało tu na sztywno `-d verris` — baza nie istniała, błąd szedł do /dev/null i domeny klientów nigdy nie
# trafiały do allowlisty.
psql_cp() {
  docker exec "$PG_CONTAINER" sh -c 'psql -U "${POSTGRES_USER:-verris}" -d "${POSTGRES_DB:-verris_db}" -tAc "$1"' sh "$1" | sed '/^$/d' \
    || { log "WARN: zapytanie do Postgresa nie powiodło się — domeny klientów pominięte"; true; }
}
DOMAINS=""

if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  DOMAINS="$(
    psql_cp "SELECT DISTINCT lower(trim(domain)) FROM \"Account\" WHERE domain IS NOT NULL AND trim(domain) <> '' ORDER BY 1;"
  )"
  # Domeny z tabeli Domain (rejestracja / hosting)
  EXTRA="$(
    psql_cp "SELECT DISTINCT lower(trim(\"domainName\")) FROM \"Domain\" WHERE \"domainName\" IS NOT NULL AND trim(\"domainName\") <> '' ORDER BY 1;"
  )"
  DOMAINS="$(printf '%s\n%s' "$DOMAINS" "$EXTRA" | sed '/^$/d' | sort -u)"
else
  log "WARN: Postgres container $PG_CONTAINER not running — only base allowlist"
fi

{
  echo "# Auto-generated $(date -u +%Y-%m-%dT%H:%M:%SZ) — hosting domains for egress allowlist"
  if [ -n "$DOMAINS" ]; then
    printf '%s\n' "$DOMAINS"
  fi
} >"$LOCAL_FILE"

COUNT="$(grep -cv '^#' "$LOCAL_FILE" || true)"
log "Domeny klientów: $COUNT -> $LOCAL_FILE (timer --odswiez dopisze ich adresy do allowlisty w ciągu 15 s)"
