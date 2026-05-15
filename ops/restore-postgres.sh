#!/usr/bin/env bash
# =============================================================================
# Verris — Postgres restore
# -----------------------------------------------------------------------------
# Restores a `pg_dump` archive (.sql.gz) into the running `postgres` container.
# Refuses to run unless --confirm is passed because this DROPS all existing
# objects (the dump uses --clean --if-exists).
#
# Usage:
#   ops/restore-postgres.sh <path/to/verris-YYYY-MM-DD-HHMM.sql.gz> --confirm
# =============================================================================

set -Eeuo pipefail

POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-verris}"
POSTGRES_DB="${POSTGRES_DB:-verris_db}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

if [[ $# -lt 1 ]]; then
  fail "Usage: $0 <backup.sql.gz> --confirm"
fi

DUMP_FILE="$1"
shift

CONFIRM=0
for arg in "$@"; do
  [[ "$arg" == "--confirm" ]] && CONFIRM=1
done

[[ -f "$DUMP_FILE" ]] || fail "dump not found: $DUMP_FILE"
[[ "$CONFIRM" -eq 1 ]] || fail "Refusing to restore without --confirm. This drops the existing database!"

log "restoring ${DUMP_FILE} → ${POSTGRES_SERVICE} (${POSTGRES_DB})"

gunzip -c "$DUMP_FILE" \
  | docker compose \
      --project-name "$COMPOSE_PROJECT_NAME" \
      --file "$COMPOSE_FILE" \
      exec -T "$POSTGRES_SERVICE" \
      psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --quiet --single-transaction

log "restore complete"
