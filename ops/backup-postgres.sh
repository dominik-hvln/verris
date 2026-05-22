#!/usr/bin/env bash
# =============================================================================
# Verris — Postgres backup → MinIO (S3)
# -----------------------------------------------------------------------------
# 1. pg_dump z kontenera postgres → gzip (staging na hoście)
# 2. Upload do MinIO: s3://<S3_BUCKET_BACKUPS>/postgres/verris-YYYY-MM-DD-HHMM.sql.gz
#    oraz postgres/latest.sql.gz (do szybkiego restore)
# 3. Retencja: lifecycle na buckecie (minio-bootstrap) + opcjonalny lokalny staging
#
# Zewnętrzny serwer (faza 2): ops/backup-mirror-external.sh mirroruje cały bucket.
#
# Env (.env.prod lub cron):
#   MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
#   S3_BUCKET_BACKUPS (default: verris-backups)
#   BACKUP_STAGING_DIR (default: /tmp/verris-backup-staging)
#   UPLOAD_TO_MINIO (default: 1)
#   RETENTION_DAYS (default: 14) — ILM na buckecie
# =============================================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-verris}"
POSTGRES_DB="${POSTGRES_DB:-verris_db}"
BACKUP_STAGING_DIR="${BACKUP_STAGING_DIR:-/tmp/verris-backup-staging}"
UPLOAD_TO_MINIO="${UPLOAD_TO_MINIO:-1}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env.prod}"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
fail() { log "ERROR: $*"; exit "${2:-1}"; }

command -v docker >/dev/null 2>&1 || fail "docker not in PATH"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin not available"

cd "$REPO_ROOT"
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE"

mkdir -p "$BACKUP_STAGING_DIR"
TIMESTAMP="$(date -u +%Y-%m-%d-%H%M)"
OBJECT_NAME="verris-${TIMESTAMP}.sql.gz"
OUT_FILE="${BACKUP_STAGING_DIR}/${OBJECT_NAME}"
TMP_FILE="${OUT_FILE}.partial"

log "starting pg_dump → ${OUT_FILE}"

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
log "staging dump ${OUT_FILE} (${SIZE_BYTES} bytes)"

if [[ "$UPLOAD_TO_MINIO" == "1" ]]; then
  # shellcheck source=ops/lib/backup-minio.sh
  source "${SCRIPT_DIR}/lib/backup-minio.sh"
  backup_minio_load_env
  log "uploading to MinIO bucket ${S3_BUCKET_BACKUPS}/postgres/${OBJECT_NAME}"
  backup_minio_ensure_bucket
  backup_minio_upload_file "$OUT_FILE" "$OBJECT_NAME"
  log "MinIO upload OK (latest.sql.gz updated)"
else
  log "UPLOAD_TO_MINIO=0 — dump left in ${BACKUP_STAGING_DIR} only"
fi

# Staging: usuń starsze niż 2 dni (tylko tymczasowe pliki przed uploadem)
find "$BACKUP_STAGING_DIR" -maxdepth 1 -type f -name 'verris-*.sql.gz' -mtime +2 -print -delete \
  | sed 's/^/  removed staging: /' >&2 || true

log "backup complete"
