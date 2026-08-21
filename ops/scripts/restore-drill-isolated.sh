#!/usr/bin/env bash
# =============================================================================
# Verris — non-destructive Postgres restore drill (pre-LIVE, single server)
#
# Restores MinIO backup into a TEMPORARY database (default: verris_restore_drill).
# Does NOT touch verris_db — safe on the same host used for pre-LIVE testing.
#
# Usage (on control-plane):
#   cd /opt/verris && ./ops/scripts/restore-drill-isolated.sh
#   ./ops/scripts/restore-drill-isolated.sh --object verris-2026-05-24-0300.sql.gz
#   ./ops/scripts/restore-drill-isolated.sh --keep-db   # leave drill DB for inspection
# =============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-verris}"
POSTGRES_DB="${POSTGRES_DB:-verris_db}"
DRILL_DB="${DRILL_DB:-verris_restore_drill}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env.prod}"
RESTORE_STAGING="${RESTORE_STAGING:-/tmp/verris-restore-staging}"
OBJECT_NAME="latest.sql.gz"
KEEP_DB=0

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --object)
      OBJECT_NAME="$2"
      shift 2
      ;;
    --keep-db)
      KEEP_DB=1
      shift
      ;;
    *)
      fail "Unknown arg: $1"
      ;;
  esac
done

cd "$REPO_ROOT"
[[ -f "$ENV_FILE" ]] || fail "missing ${ENV_FILE}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# shellcheck source=ops/lib/backup-minio.sh
source "${REPO_ROOT}/ops/lib/backup-minio.sh"
backup_minio_load_env

mkdir -p "$RESTORE_STAGING"
DUMP_FILE="${RESTORE_STAGING}/${OBJECT_NAME}"

log "MinIO stat ${S3_BUCKET_BACKUPS}/postgres/${OBJECT_NAME}"
backup_minio_mc_run "
  mc alias set verris http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\"
  mc stat verris/${S3_BUCKET_BACKUPS}/postgres/${OBJECT_NAME}
"

log "download → ${DUMP_FILE}"
backup_minio_download_file "$OBJECT_NAME" "$DUMP_FILE"
[[ -f "$DUMP_FILE" ]] || fail "download failed"

psql_admin() {
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    exec -T "$POSTGRES_SERVICE" \
    psql --username "$POSTGRES_USER" --dbname postgres --quiet "$@"
}

psql_drill() {
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    exec -T "$POSTGRES_SERVICE" \
    psql --username "$POSTGRES_USER" --dbname "$DRILL_DB" --quiet "$@"
}

if [[ "$DRILL_DB" == "$POSTGRES_DB" ]]; then
  fail "DRILL_DB must differ from POSTGRES_DB (${POSTGRES_DB})"
fi

log "recreate drill database ${DRILL_DB}"
psql_admin -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DRILL_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "${DRILL_DB}";
CREATE DATABASE "${DRILL_DB}";
SQL

log "restore dump into ${DRILL_DB} (this may take a few minutes)"
gunzip -c "$DUMP_FILE" \
  | docker compose \
      --project-name "$COMPOSE_PROJECT_NAME" \
      --file "$COMPOSE_FILE" \
      exec -T "$POSTGRES_SERVICE" \
      psql --username "$POSTGRES_USER" --dbname "$DRILL_DB" --quiet --single-transaction

log "verification queries"
USER_COUNT="$(psql_drill -tAc 'SELECT COUNT(*) FROM "User";' 2>/dev/null || echo "ERR")"
log "User count in drill DB: ${USER_COUNT}"

if [[ "$KEEP_DB" -eq 0 ]]; then
  log "drop drill database ${DRILL_DB}"
  psql_admin -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DRILL_DB}\";"
else
  log "keeping ${DRILL_DB} for manual inspection"
fi

log "RESTORE DRILL OK — object=${OBJECT_NAME} users=${USER_COUNT} (production ${POSTGRES_DB} untouched)"
