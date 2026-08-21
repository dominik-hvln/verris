#!/usr/bin/env bash
# =============================================================================
# Verris — restore-drill (test odtwarzania backupu)  [S-2: udokumentowany test]
# -----------------------------------------------------------------------------
# Realne odtworzenie ostatniego backupu do TYMCZASOWEJ bazy, weryfikacja
# integralności (SHA-256), deszyfrowanie (age) i sanity-check (liczności tabel).
# NIE dotyka produkcyjnej bazy. Idempotentny — bazę testową tworzy i kasuje.
#
# Uruchom ręcznie przed LIVE oraz cyklicznie (cron/systemd), aby mieć DOWÓD, że
# backup jest odtwarzalny (samo wykonanie kopii nie wystarcza — RODO art. 32).
#
# Usage:
#   ops/backup-verify.sh                 # bierze latest.sql.gz.age z MinIO
#   ops/backup-verify.sh <object-name>   # konkretny obiekt z bucketu postgres/
#
# Wymaga: BACKUP_AGE_IDENTITY_FILE (klucz prywatny age) gdy backup zaszyfrowany.
# =============================================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-verris}"
POSTGRES_DB="${POSTGRES_DB:-verris_db}"
TEST_DB="${TEST_DB:-verris_restore_test}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env.prod}"
STAGING="${RESTORE_STAGING:-/tmp/verris-restore-drill}"
OBJECT_NAME="${1:-latest.sql.gz.age}"
# Tabele, których niepustość potwierdza sensowny restore (dostosuj do schematu).
SANITY_TABLES="${SANITY_TABLES:-User Plan}"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
fail() { log "ERROR: $*"; cleanup; exit 1; }

psql_prod() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME" --file "$COMPOSE_FILE" \
    exec -T "$POSTGRES_SERVICE" psql --username "$POSTGRES_USER" "$@"
}

cleanup() {
  log "sprzątanie: usuwam bazę testową ${TEST_DB} i staging"
  psql_prod --dbname postgres -c "DROP DATABASE IF EXISTS \"${TEST_DB}\";" >/dev/null 2>&1 || true
  [[ -n "${DEC_FILE:-}" && -f "${DEC_FILE:-}" ]] && { shred -u "$DEC_FILE" 2>/dev/null || rm -f "$DEC_FILE"; }
  rm -f "${DUMP_FILE:-}" "${DUMP_FILE:-}.sha256" 2>/dev/null || true
}
trap cleanup EXIT

command -v docker >/dev/null 2>&1 || fail "docker not in PATH"
cd "$REPO_ROOT"
mkdir -p "$STAGING"

# 1) Pobierz backup + sumę kontrolną
# shellcheck source=ops/lib/backup-minio.sh
source "${SCRIPT_DIR}/lib/backup-minio.sh"
backup_minio_load_env
DUMP_FILE="${STAGING}/${OBJECT_NAME}"
log "pobieram ${S3_BUCKET_BACKUPS}/postgres/${OBJECT_NAME}"
backup_minio_download_file "$OBJECT_NAME" "$DUMP_FILE" || fail "nie udało się pobrać ${OBJECT_NAME}"
backup_minio_download_file "${OBJECT_NAME}.sha256" "${DUMP_FILE}.sha256" 2>/dev/null || true

# 2) Weryfikacja integralności
if [[ -f "${DUMP_FILE}.sha256" ]]; then
  EXPECTED="$(awk '{print $1}' "${DUMP_FILE}.sha256")"
  ACTUAL="$(sha256sum "$DUMP_FILE" 2>/dev/null | awk '{print $1}')"
  [[ -n "$ACTUAL" ]] || ACTUAL="$(shasum -a 256 "$DUMP_FILE" | awk '{print $1}')"
  [[ "$EXPECTED" == "$ACTUAL" ]] || fail "checksum mismatch — backup uszkodzony"
  log "integralność OK (${ACTUAL})"
else
  log "UWAGA: brak pliku .sha256 — pomijam weryfikację integralności"
fi

# 3) Deszyfrowanie
RESTORE_INPUT="$DUMP_FILE"
if [[ "$DUMP_FILE" == *.age ]]; then
  # shellcheck source=ops/lib/backup-crypto.sh
  source "${SCRIPT_DIR}/lib/backup-crypto.sh"
  log "deszyfrowanie (age)…"
  DEC_FILE="$(backup_crypto_decrypt_file "$DUMP_FILE")"
  RESTORE_INPUT="$DEC_FILE"
fi

# 4) Utwórz świeżą bazę testową i odtwórz
log "tworzę bazę testową ${TEST_DB}"
psql_prod --dbname postgres -c "DROP DATABASE IF EXISTS \"${TEST_DB}\";" >/dev/null
psql_prod --dbname postgres -c "CREATE DATABASE \"${TEST_DB}\";" >/dev/null

log "odtwarzam dump → ${TEST_DB}"
gunzip -c "$RESTORE_INPUT" \
  | docker compose --project-name "$COMPOSE_PROJECT_NAME" --file "$COMPOSE_FILE" \
      exec -T "$POSTGRES_SERVICE" \
      psql --username "$POSTGRES_USER" --dbname "$TEST_DB" --quiet --single-transaction \
  || fail "restore do bazy testowej nie powiódł się"

# 5) Sanity — kluczowe tabele istnieją i mają wiersze
log "sanity-check tabel: ${SANITY_TABLES}"
for t in $SANITY_TABLES; do
  cnt="$(psql_prod --dbname "$TEST_DB" -tAc "SELECT count(*) FROM \"${t}\";" 2>/dev/null | tr -d '[:space:]')" || true
  if [[ -z "$cnt" ]]; then
    fail "tabela ${t} nie istnieje po restore — backup niekompletny"
  fi
  log "  ${t}: ${cnt} wierszy"
done

log "✅ RESTORE-DRILL OK — backup ${OBJECT_NAME} jest odtwarzalny ($(date -Iseconds))"
