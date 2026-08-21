#!/usr/bin/env bash
# =============================================================================
# Migracje Payload dla apps/www (schemat `payload` w Postgresie).
#
# Uruchamiane przez prod-deploy-ghcr.sh PRZED startem nowego obrazu www —
# schemat musi wyprzedzać kod (expand → contract). Nieudana migracja przerywa deploy.
#
# Obraz produkcyjny www jest „standalone" i nie zawiera CLI Payloada, dlatego
# migracja idzie z jednorazowego kontenera Node z zamontowanym repo.
#
# Połączenie przez zmienne PG* (nie DATABASE_URI) — payload.config.ts preferuje je,
# dzięki czemu hasło ze znakami specjalnymi nie wymaga enkodowania URL.
# =============================================================================
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

ENV_FILE="${ENV_FILE:-.env.prod}"
NODE_IMAGE="${MIGRATE_NODE_IMAGE:-node:22-bookworm-slim}"

[ -f "$ENV_FILE" ] || { echo "[migrate-www] brak $ENV_FILE"; exit 1; }

# Sieć wewnętrzna, w której działa postgres.
NET="${MIGRATE_NETWORK:-$(docker network ls --format '{{.Name}}' | grep -m1 verris_internal || true)}"
[ -n "$NET" ] || { echo "[migrate-www] nie znaleziono sieci verris_internal"; exit 1; }

val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

PG_USER="$(val POSTGRES_USER)"; PG_USER="${PG_USER:-verris}"
PG_DB="$(val POSTGRES_DB)";     PG_DB="${PG_DB:-verris_db}"
PG_PASS="$(val POSTGRES_PASSWORD)"
PL_SECRET="$(val PAYLOAD_SECRET)"

[ -n "$PG_PASS" ]   || { echo "[migrate-www] brak POSTGRES_PASSWORD w $ENV_FILE"; exit 1; }
[ -n "$PL_SECRET" ] || { echo "[migrate-www] brak PAYLOAD_SECRET w $ENV_FILE"; exit 1; }

echo "[migrate-www] sieć=$NET db=$PG_DB user=$PG_USER"

docker run --rm \
  --network "$NET" \
  -v "$PWD":/repo -w /repo/apps/www \
  -e PGHOST=postgres \
  -e PGPORT=5432 \
  -e PGUSER="$PG_USER" \
  -e PGPASSWORD="$PG_PASS" \
  -e PGDATABASE="$PG_DB" \
  -e PAYLOAD_SECRET="$PL_SECRET" \
  "$NODE_IMAGE" bash -lc '
    set -e
    corepack enable
    pnpm install --filter @verris/www... --frozen-lockfile
    pnpm --filter @verris/www exec payload migrate
  '

echo "[migrate-www] OK"
