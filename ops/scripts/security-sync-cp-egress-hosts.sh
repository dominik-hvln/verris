#!/usr/bin/env bash
# Uzupełnia /etc/verris/security/egress-allow-hostnames.local.txt domenami klientów z Postgres.
# Uruchamiaj przed --strict na control-plane (cron co godzinę lub po nowej subskrypcji).
#
#   sudo bash ops/scripts/security-sync-cp-egress-hosts.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE_FILE="${BASE_FILE:-/etc/verris/security/egress-allow-hostnames.txt}"
LOCAL_FILE="${LOCAL_FILE:-/etc/verris/security/egress-allow-hostnames.local.txt}"
MERGED_FILE="${MERGED_FILE:-/etc/verris/security/egress-allow-hostnames.merged.txt}"
WORKDIR="${WORKDIR:-/opt/verris}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Run as root"
install -d /etc/verris/security

if [ ! -f "$BASE_FILE" ]; then
  install -m 0644 "$REPO_ROOT/ops/etc/verris/security/egress-allow-hostnames.txt" "$BASE_FILE"
fi

PG_CONTAINER="${PG_CONTAINER:-${COMPOSE_PROJECT_NAME}-postgres-1}"
DOMAINS=""

if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  DOMAINS="$(
    docker exec "$PG_CONTAINER" psql -U verris -d verris -tAc \
      "SELECT DISTINCT lower(trim(domain)) FROM \"Account\" WHERE domain IS NOT NULL AND trim(domain) <> '' ORDER BY 1;" \
      2>/dev/null | sed '/^$/d' || true
  )"
  # Domeny z tabeli Domain (rejestracja / hosting)
  EXTRA="$(
    docker exec "$PG_CONTAINER" psql -U verris -d verris -tAc \
      "SELECT DISTINCT lower(trim(\"domainName\")) FROM \"Domain\" WHERE \"domainName\" IS NOT NULL AND trim(\"domainName\") <> '' ORDER BY 1;" \
      2>/dev/null | sed '/^$/d' || true
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

{
  grep -v '^[[:space:]]*#' "$BASE_FILE" | sed '/^$/d' || true
  grep -v '^[[:space:]]*#' "$LOCAL_FILE" | sed '/^$/d' || true
} | awk 'NF && !seen[$0]++' >"$MERGED_FILE"

COUNT="$(wc -l <"$MERGED_FILE" | tr -d ' ')"
log "Merged allowlist: $COUNT host(s) -> $MERGED_FILE"
log "Re-apply strict egress: sudo ALLOW_HOSTS=$MERGED_FILE bash $REPO_ROOT/ops/scripts/security-control-plane-egress.sh --strict"
