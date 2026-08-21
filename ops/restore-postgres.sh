#!/usr/bin/env bash
# =============================================================================
# Verris — Postgres restore
# -----------------------------------------------------------------------------
# Restores a `pg_dump` archive (.sql.gz). Refuses without --confirm.
#
# Usage:
#   ops/restore-postgres.sh <path/to/verris-....sql.gz[.age]> --confirm
#   ops/restore-postgres.sh --from-minio [object-name] --confirm
#     object-name default: latest.sql.gz.age (bucket S3_BUCKET_BACKUPS/postgres/)
#
# Zaszyfrowane backupy (*.age) są automatycznie deszyfrowane — wymaga
# BACKUP_AGE_IDENTITY_FILE (klucz prywatny age, trzymany OFFLINE).
# Jeśli obok jest plik .sha256, integralność jest weryfikowana przed restore.
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
OBJECT_NAME="latest.sql.gz.age"
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
  # Pobierz też sumę kontrolną (jeśli istnieje) do weryfikacji integralności.
  backup_minio_download_file "${OBJECT_NAME}.sha256" "${DUMP_FILE}.sha256" 2>/dev/null || true
fi

[[ -n "$DUMP_FILE" ]] || fail "Usage: $0 <backup.sql.gz[.age]> --confirm  OR  $0 --from-minio [name] --confirm"
[[ -f "$DUMP_FILE" ]] || fail "dump not found: $DUMP_FILE"

cd "$REPO_ROOT"

# --- Weryfikacja integralności (SHA-256) na szyfrogramie, przed deszyfrowaniem ---
if [[ -f "${DUMP_FILE}.sha256" ]]; then
  log "weryfikacja SHA-256…"
  EXPECTED="$(awk '{print $1}' "${DUMP_FILE}.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL="$(sha256sum "$DUMP_FILE" | awk '{print $1}')"
  else
    ACTUAL="$(shasum -a 256 "$DUMP_FILE" | awk '{print $1}')"
  fi
  [[ "$EXPECTED" == "$ACTUAL" ]] || fail "checksum mismatch! oczekiwano ${EXPECTED}, jest ${ACTUAL} — backup uszkodzony lub zmanipulowany"
  log "integralność OK (${ACTUAL})"
fi

# --- Deszyfrowanie (age) gdy plik jest zaszyfrowany --------------------------
if [[ "$DUMP_FILE" == *.age ]]; then
  # shellcheck source=ops/lib/backup-crypto.sh
  source "${SCRIPT_DIR}/lib/backup-crypto.sh"
  log "deszyfrowanie backupu (age)…"
  DUMP_FILE="$(backup_crypto_decrypt_file "$DUMP_FILE")"
  log "odszyfrowano → ${DUMP_FILE}"
fi

log "restoring ${DUMP_FILE} → ${POSTGRES_SERVICE} (${POSTGRES_DB})"

gunzip -c "$DUMP_FILE" \
  | docker compose \
      --project-name "$COMPOSE_PROJECT_NAME" \
      --file "$COMPOSE_FILE" \
      exec -T "$POSTGRES_SERVICE" \
      psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --quiet --single-transaction

# Sprzątanie: usuń odszyfrowany plaintext ze stagingu (dane osobowe!)
if [[ "$FROM_MINIO" -eq 1 && "$DUMP_FILE" == "${RESTORE_STAGING}/"* && "$DUMP_FILE" != *.age ]]; then
  shred -u "$DUMP_FILE" 2>/dev/null || rm -f "$DUMP_FILE"
fi

log "restore complete"
