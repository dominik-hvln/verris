#!/usr/bin/env bash
# =============================================================================
# EkoHost — Postgres backup
# -----------------------------------------------------------------------------
# Streams a logical dump of the application database via `pg_dump` running
# inside the running `postgres` container. Output is gzip-compressed and
# written to $BACKUP_DIR with a timestamped filename:
#
#   ekohost-2026-04-28-0300.sql.gz
#
# Old backups are pruned after $RETENTION_DAYS days. Designed to be invoked by
# a host-side cron job (see /etc/cron.d/ekohost-backup) or by `cron` inside a
# scheduler container.
#
# Required env vars (pass via cron `--env-file` or systemd):
#   POSTGRES_USER         — db user with read access (defaults to "ekohost")
#   POSTGRES_DB           — db name (defaults to "ekohost_db")
#
# Optional:
#   COMPOSE_FILE          — path to docker-compose.prod.yml (default: ./docker-compose.prod.yml)
#   COMPOSE_PROJECT_NAME  — compose project name to scope `docker compose exec`
#   BACKUP_DIR            — destination dir on the host (default: /var/backups/ekohost)
#   RETENTION_DAYS        — how many days of dumps to keep (default: 14)
#   POSTGRES_SERVICE      — compose service name (default: postgres)
#
# Exit codes:
#   0 — backup written and verified non-empty
#   1 — invocation problem (compose missing, container not running, …)
#   2 — pg_dump failed
#   3 — gzip verification failed (corrupted dump)
# =============================================================================

set -Eeuo pipefail

POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-ekohost}"
POSTGRES_DB="${POSTGRES_DB:-ekohost_db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ekohost}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ekohost}"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
fail() { log "ERROR: $*"; exit "${2:-1}"; }

command -v docker >/dev/null 2>&1 || fail "docker not in PATH"

if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose plugin not available (need v2)"
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  fail "compose file not found: $COMPOSE_FILE"
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y-%m-%d-%H%M)"
OUT_FILE="${BACKUP_DIR}/ekohost-${TIMESTAMP}.sql.gz"
TMP_FILE="${OUT_FILE}.partial"

log "starting pg_dump → ${OUT_FILE}"

# `pg_dump --clean --if-exists` makes the dump idempotent for restores.
# `--no-owner --no-privileges` keeps it portable across environments.
if ! docker compose \
        --project-name "$COMPOSE_PROJECT_NAME" \
        --file "$COMPOSE_FILE" \
        exec -T "$POSTGRES_SERVICE" \
        pg_dump \
            --username "$POSTGRES_USER" \
            --dbname "$POSTGRES_DB" \
            --no-owner --no-privileges \
            --clean --if-exists \
            --format=plain \
        | gzip -9 > "$TMP_FILE"; then
  rm -f "$TMP_FILE"
  fail "pg_dump failed" 2
fi

if ! gzip -t "$TMP_FILE" 2>/dev/null; then
  rm -f "$TMP_FILE"
  fail "dump file is not a valid gzip archive" 3
fi

SIZE_BYTES=$(wc -c < "$TMP_FILE")
if [[ "$SIZE_BYTES" -lt 1024 ]]; then
  rm -f "$TMP_FILE"
  fail "dump file suspiciously small (${SIZE_BYTES} bytes)" 3
fi

mv "$TMP_FILE" "$OUT_FILE"
log "wrote ${OUT_FILE} (${SIZE_BYTES} bytes)"

log "pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'ekohost-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/  removed: /' >&2 || true

log "backup complete"
