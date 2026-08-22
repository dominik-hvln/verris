#!/usr/bin/env bash
# =============================================================================
# Verris — upgrade silnika MariaDB węzła (VER-UPG). Uruchamiany przez agenta
# zadań (NodeTask DB_UPGRADE) z env:
#   DB_TARGET_VERSION   docelowa wersja MariaDB, np. "11.4", "11.8", "12.3"
#
# Mechanizm: DirectAdmin CustomBuild (./build set mariadb X.Y && ./build mariadb),
# poprzedzony PEŁNYM zrzutem wszystkich baz (mysqldump). Idempotentny względem
# wersji docelowej (jeśli już zainstalowana — kończy bez zmian). NIGDY nie robi
# downgrade'u (MariaDB nie wspiera downgrade między majorami — chroni dane).
#
# Markery dla panelu (przeżywają obcięcie logu):
#   [VERRIS_DB_UPGRADE] from=<x> to=<y> status=<...>
# =============================================================================
set -Eeuo pipefail

TARGET="${DB_TARGET_VERSION:?Brak DB_TARGET_VERSION}"
ALLOWED="11.4 11.8 12.3"
CB="/usr/local/directadmin/custombuild"
BACKUP_DIR="/var/backups/verris-db"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

log() { echo "[db-upgrade] $*"; }
marker() { echo "[VERRIS_DB_UPGRADE] $*"; }

# --- 0. Walidacja wersji docelowej ---------------------------------------
if ! echo "$ALLOWED" | tr ' ' '\n' | grep -qx "$TARGET"; then
  log "Niedozwolona wersja docelowa: $TARGET (dozwolone: $ALLOWED)"
  marker "to=$TARGET status=rejected reason=version_not_allowed"
  exit 1
fi
if ! echo "$TARGET" | grep -Eq '^[0-9]+\.[0-9]+$'; then
  log "Niepoprawny format wersji: $TARGET"; exit 1
fi

# --- 1. Wykrycie aktualnej wersji ----------------------------------------
detect_version() {
  local v=""
  if command -v mariadbd >/dev/null 2>&1; then
    v="$(mariadbd --version 2>/dev/null || true)"
  elif command -v mysqld >/dev/null 2>&1; then
    v="$(mysqld --version 2>/dev/null || true)"
  fi
  # Wyłuskaj X.Y.Z → zwróć X.Y
  echo "$v" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 | cut -d. -f1,2
}
CURRENT="$(detect_version)"
log "Aktualna wersja MariaDB (major.minor): ${CURRENT:-nieznana}; docelowa: $TARGET"
marker "from=${CURRENT:-unknown} to=$TARGET status=starting"

# --- 2. Idempotencja + ochrona przed downgrade ---------------------------
ver_to_num() { echo "$1" | awk -F. '{ printf("%d%03d", $1, $2) }'; }
if [ -n "$CURRENT" ]; then
  if [ "$(ver_to_num "$CURRENT")" -eq "$(ver_to_num "$TARGET")" ]; then
    log "Węzeł już na MariaDB $TARGET — nic do zrobienia."
    marker "from=$CURRENT to=$TARGET status=noop_already_current"
    exit 0
  fi
  if [ "$(ver_to_num "$CURRENT")" -gt "$(ver_to_num "$TARGET")" ]; then
    log "ODMOWA: downgrade $CURRENT → $TARGET nie jest wspierany przez MariaDB (ryzyko utraty danych)."
    marker "from=$CURRENT to=$TARGET status=rejected reason=downgrade_unsupported"
    exit 1
  fi
fi

# --- 3. Wymagania środowiska ---------------------------------------------
[ -d "$CB" ] || { log "Brak CustomBuild ($CB) — to nie jest węzeł DirectAdmin."; marker "to=$TARGET status=failed reason=no_custombuild"; exit 1; }
command -v mysql >/dev/null 2>&1 || { log "Brak klienta mysql."; exit 1; }
DUMP_BIN="mysqldump"; command -v mariadb-dump >/dev/null 2>&1 && DUMP_BIN="mariadb-dump"

# --- 4. PEŁNY backup przed jakąkolwiek zmianą ----------------------------
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
DUMP_FILE="$BACKUP_DIR/predump-${CURRENT:-unknown}-to-${TARGET}-${TS}.sql.gz"
log "Backup wszystkich baz → $DUMP_FILE (to może chwilę potrwać)…"
# --single-transaction: spójny zrzut bez długiej blokady InnoDB; +routines/triggers/events.
if ! "$DUMP_BIN" --all-databases --single-transaction --routines --triggers --events 2>/dev/null | gzip -c > "$DUMP_FILE"; then
  log "BŁĄD: zrzut baz nie powiódł się — PRZERYWAM (nie ruszam silnika DB)."
  marker "from=${CURRENT:-unknown} to=$TARGET status=failed reason=backup_failed"
  exit 1
fi
DUMP_SIZE="$(stat -c%s "$DUMP_FILE" 2>/dev/null || echo 0)"
if [ "$DUMP_SIZE" -lt 1024 ]; then
  log "BŁĄD: zrzut podejrzanie mały ($DUMP_SIZE B) — PRZERYWAM dla bezpieczeństwa danych."
  marker "from=${CURRENT:-unknown} to=$TARGET status=failed reason=backup_too_small"
  exit 1
fi
log "Backup OK: $DUMP_FILE ($DUMP_SIZE B). Przechowaj go do czasu potwierdzenia poprawności po upgrade."

# --- 5. Upgrade przez CustomBuild ----------------------------------------
cd "$CB"
log "CustomBuild: aktualizacja skryptów…"
./build update >/dev/null 2>&1 || true
log "CustomBuild: set mariadb $TARGET"
./build set mariadb "$TARGET"
./build set mysql_inst mariadb >/dev/null 2>&1 || true
log "CustomBuild: build mariadb (instalacja/upgrade silnika — NIE przerywaj)…"
./build mariadb

# --- 6. Post-upgrade: mysql_upgrade + weryfikacja ------------------------
log "Aktualizacja tabel systemowych (mariadb-upgrade)…"
if command -v mariadb-upgrade >/dev/null 2>&1; then
  mariadb-upgrade --force >/dev/null 2>&1 || true
elif command -v mysql_upgrade >/dev/null 2>&1; then
  mysql_upgrade --force >/dev/null 2>&1 || true
fi

NEW="$(detect_version)"
log "Wersja po upgrade: ${NEW:-nieznana}"

# Sanity: serwer DB odpowiada?
if mysql -e "SELECT VERSION();" >/dev/null 2>&1; then
  DB_OK=1
else
  DB_OK=0
fi

if [ "$NEW" = "$TARGET" ] && [ "$DB_OK" = "1" ]; then
  log "SUKCES: MariaDB na węźle to teraz $NEW, serwer odpowiada."
  marker "from=${CURRENT:-unknown} to=$NEW status=success backup=$DUMP_FILE"
  exit 0
fi

log "UWAGA: oczekiwano $TARGET, wykryto '${NEW:-?}', db_ok=$DB_OK. Sprawdź logi CustomBuild i $DUMP_FILE."
marker "from=${CURRENT:-unknown} to=${NEW:-unknown} status=verify_failed backup=$DUMP_FILE"
exit 1
