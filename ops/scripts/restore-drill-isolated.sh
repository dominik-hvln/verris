#!/usr/bin/env bash
# =============================================================================
# Verris — non-destructive Postgres restore drill (pre-LIVE, single server)
#
# Restores MinIO backup into a TEMPORARY database (default: verris_restore_drill).
# Does NOT touch verris_db — safe on the same host used for pre-LIVE testing.
#
# H-20 (2026-08-22) — skrypt ASERTUJE i ZOSTAWIA ŚLAD.
#
# Do tej pory robił dwie rzeczy, których nie robił naprawdę:
#   1. liczył wiersze w tabeli "User" i tylko je LOGOWAŁ — pusta baza dawała
#      "RESTORE DRILL OK", bo psql kończy się zerem także wtedy, gdy nic nie
#      wgrał;
#   2. nie zapisywał nigdzie, że się odbył — a runbook wymagał drilla przed
#      startem i nie było jak sprawdzić, czy ktoś go kiedykolwiek uruchomił.
#
# Teraz: progi wierszy na kilku tabelach, pomiar czasu (to jest realne RTO),
# i zapis wyniku do tabeli "RestoreDrill" — RÓWNIEŻ przy niepowodzeniu, bo
# brak wpisu nie może znaczyć jednocześnie "nigdy nie było" i "padło".
#
# Usage (on control-plane):
#   cd /opt/verris && ./ops/scripts/restore-drill-isolated.sh --owner "Imię Nazwisko"
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
# D4 wymaga WŁAŚCICIELA, nie tylko daty. Domyślnie bierzemy użytkownika
# systemowego, ale wolno go nadpisać — „root" nie jest osobą odpowiedzialną.
DRILL_OWNER="${DRILL_OWNER:-$(id -un)@$(hostname -s)}"
# Tabele kontrolne i ich minima. Zero znaczy „ma istnieć, może być pusta".
declare -A MIN_ROWS=( ["User"]=1 ["Plan"]=1 ["Subscription"]=0 ["Invoice"]=0 ["Account"]=0 )
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
STARTED_EPOCH="$(date +%s)"

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
    --owner)
      DRILL_OWNER="$2"
      shift 2
      ;;
    *)
      fail "Unknown arg: $1"
      ;;
  esac
done


# ── Ślad wykonania ───────────────────────────────────────────────────────────
#
# Zapis idzie do PRODUKCYJNEJ bazy, nie do drillowej — drillowa zaraz zniknie,
# a ślad ma zostać. Zapisujemy RÓWNIEŻ niepowodzenie: brak wpisu nie może
# znaczyć jednocześnie „nigdy nie było" i „padło".
ZAPISANO=0
zapisz_probe() {
  local WYNIK="$1" ROWS="$2" NOTATKI="$3"
  [[ "$ZAPISANO" -eq 1 ]] && return 0
  ZAPISANO=1
  local FINISHED EPOCH_END TRWALO
  FINISHED="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  EPOCH_END="$(date +%s)"
  TRWALO=$(( EPOCH_END - STARTED_EPOCH ))
  (( TRWALO < 1 )) && TRWALO=1

  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    exec -T "$POSTGRES_SERVICE" \
    psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --quiet -v ON_ERROR_STOP=1 <<SQL || log "UWAGA: nie udało się zapisać śladu próby"
INSERT INTO "RestoreDrill"
  ("id", "startedAt", "finishedAt", "durationSec", "result", "objectName", "source", "rowCounts", "owner", "notes")
VALUES
  (gen_random_uuid(), '${STARTED_AT}', '${FINISHED}', ${TRWALO}, '${WYNIK}',
   \$\$${OBJECT_NAME}\$\$, \$\$${S3_BUCKET_BACKUPS}/postgres\$\$, \$\$${ROWS}\$\$::jsonb,
   \$\$${DRILL_OWNER}\$\$, NULLIF(\$\$${NOTATKI}\$\$, ''));
SQL
  log "ślad próby zapisany: wynik=${WYNIK} czas=${TRWALO}s właściciel=${DRILL_OWNER}"
}

# Każde wyjście przez błąd też zostawia ślad — awaria w połowie odtwarzania
# jest informacją, nie brakiem informacji.
trap 'zapisz_probe "FAILED" "{}" "Skrypt przerwany w linii ${LINENO}"' ERR

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

# ── Progi wierszy ───────────────────────────────────────────────────────────
#
# To jest sedno poprawki z H-20. Wcześniej skrypt liczył wiersze w "User"
# i tylko je logował — odtworzenie pustego pliku kończyło się komunikatem
# "RESTORE DRILL OK", bo psql wychodzi z zerem także wtedy, gdy nic nie wgrał.
# Sprawdzamy kilka tabel, nie jedną: sam "User" nie powie nic o tym, czy
# przetrwały faktury i subskrypcje, a to one bolą przy utracie.
ROW_JSON="{"
FIRST=1
MISSING=""
for TABLE in "${!MIN_ROWS[@]}"; do
  COUNT="$(psql_drill -tAc "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "")"
  if [[ -z "$COUNT" || ! "$COUNT" =~ ^[0-9]+$ ]]; then
    MISSING="${MISSING}${TABLE} (brak tabeli albo błąd zapytania); "
    COUNT=-1
  elif (( COUNT < MIN_ROWS[$TABLE] )); then
    MISSING="${MISSING}${TABLE} (${COUNT} < ${MIN_ROWS[$TABLE]}); "
  fi
  [[ $FIRST -eq 1 ]] || ROW_JSON="${ROW_JSON},"
  ROW_JSON="${ROW_JSON}\"${TABLE}\":${COUNT}"
  FIRST=0
  log "  ${TABLE}: ${COUNT} (min ${MIN_ROWS[$TABLE]})"
done
ROW_JSON="${ROW_JSON}}"

if [[ "$KEEP_DB" -eq 0 ]]; then
  log "drop drill database ${DRILL_DB}"
  psql_admin -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DRILL_DB}\";" || true
else
  log "keeping ${DRILL_DB} for manual inspection"
fi

if [[ -n "$MISSING" ]]; then
  zapisz_probe "FAILED" "$ROW_JSON" "Odtworzenie bez danych: ${MISSING}"
  fail "RESTORE DRILL NIEUDANY — tabele bez wymaganych danych: ${MISSING}"
fi

zapisz_probe "OK" "$ROW_JSON" ""
log "RESTORE DRILL OK — object=${OBJECT_NAME} rows=${ROW_JSON} (production ${POSTGRES_DB} untouched)"
