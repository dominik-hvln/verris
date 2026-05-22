#!/usr/bin/env bash
# =============================================================================
# Verris — Postgres restore
# -----------------------------------------------------------------------------
# Restores a `pg_dump` archive (.sql.gz). Refuses without --confirm.
#
# Usage:
#   ops/restore-postgres.sh <path/to/verris-....sql.gz> --confirm
#   ops/restore-postgres.sh --from-minio [object-name] --confirm
#     object-name default: latest.sql.gz (bucket S3_BUCKET_BACKUPS/postgres/)
# =============================================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-verris}"
POSTGRES_DB="${POSTGRES_DB:-verris_db}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env.prod}"
RESTORE_STAGING="${RESTORE_STAGING:-/tmp/verris-restore-staging}"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

FROM_MINIO=0
DUMP_FILE=""
OBJECT_NAME="latest.sql.gz"
CONFIRM=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-minio)
      FROM_MINIO=1
      shift
      if [[ $# -gt 0 && "$1" != --* ]]; then
        OBJECT_NAME="$1"
        shift
      fi
      ;;
    --confirm)
      CONFIRM=1
      shift
      ;;
    *)
      if [[ -z "$DUMP_FILE" ]]; then
        DUMP_FILE="$1"
      fi
      shift
      ;;
  esac
done

[[ "$CONFIRM" -eq 1 ]] || fail "Refusing to restore without --confirm. This drops the existing database!"

if [[ "$FROM_MINIO" -eq 1 ]]; then
  cd "$REPO_ROOT"
  # shellcheck source=ops/lib/backup-minio.sh
  source "${SCRIPT_DIR}/lib/backup-minio.sh"
  backup_minio_load_env
  mkdir -p "$RESTORE_STAGING"
  DUMP_FILE="${RESTORE_STAGING}/${OBJECT_NAME}"
  log "downloading MinIO ${S3_BUCKET_BACKUPS}/postgres/${OBJECT_NAME} → ${DUMP_FILE}"
  backup_minio_download_file "$OBJECT_NAME" "$DUMP_FILE"
fi

[[ -n "$DUMP_FILE" ]] || fail "Usage: $0 <backup.sql.gz> --confirm  OR  $0 --from-minio [name] --confirm"
[[ -f "$DUMP_FILE" ]] || fail "dump not found: $DUMP_FILE"

cd "$REPO_ROOT"
log "restoring ${DUMP_FILE} → ${POSTGRES_SERVICE} (${POSTGRES_DB})"

gunzip -c "$DUMP_FILE" \
  | docker compose \
      --project-name "$COMPOSE_PROJECT_NAME" \
      --file "$COMPOSE_FILE" \
      exec -T "$POSTGRES_SERVICE" \
      psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --quiet --single-transaction

log "restore complete"
