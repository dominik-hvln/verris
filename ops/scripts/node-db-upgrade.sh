#!/usr/bin/env bash
# =============================================================================
# Verris — upgrade silnika MariaDB węzła (VER-UPG). Uruchamiany przez agenta
# zadań (NodeTask DB_UPGRADE) z env:
#   DB_TARGET_VERSION   docelowa wersja MariaDB, np. "11.4", "11.8", "12.3"
#
# Mechanizm: DirectAdmin CustomBuild (./build set mariadb X.Y && ./build mariadb) albo — gdy na węźle
# jest CloudLinux MySQL Governor — mysqlgovernor.py (oficjalna procedura CloudLinux, krok po kroku),
# poprzedzony PEŁNYM zrzutem wszystkich baz (mysqldump). Idempotentny względem
# wersji docelowej (jeśli już zainstalowana — kończy bez zmian). NIGDY nie robi
# downgrade'u (MariaDB nie wspiera downgrade między majorami — chroni dane).
#
# Markery dla panelu (przeżywają obcięcie logu):
#   [VERRIS_DB_UPGRADE] from=<x> to=<y> status=<...>
# =============================================================================
set -Eeuo pipefail

TARGET="${DB_TARGET_VERSION:?Brak DB_TARGET_VERSION}"
ALLOWED="10.11 11.4 11.8 12.3"
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
# Dostęp jak w oficjalnej dokumentacji DA (MariaDB/MySQL): --defaults-extra-file=/usr/local/directadmin/conf/my.cnf.
MYCNF=/usr/local/directadmin/conf/my.cnf
[ -r "$MYCNF" ] || { log "Brak $MYCNF (dane da_admin)."; marker "to=$TARGET status=failed reason=no_da_mycnf"; exit 1; }
MYA=(--defaults-extra-file="$MYCNF")

# CloudLinux MySQL Governor: przy zainstalowanym Governorze wersję zmienia się jego narzędziem
# (oficjalny artykuł CloudLinux „How to upgrade MySQL/MariaDB with Governor over multiple versions”):
#   mysqlgovernor.py --mysql-version=<id>; mysqlgovernor.py --install — i tylko o jedną wersję naraz.
GOV=/usr/share/lve/dbgovernor/mysqlgovernor.py
GOV_LISTA=(mariadb104 mariadb105 mariadb106 mariadb1011 mariadb1104)
gov_id() { case "$1" in 10.4) echo mariadb104;; 10.5) echo mariadb105;; 10.6) echo mariadb106;; 10.11) echo mariadb1011;; 11.4) echo mariadb1104;; *) echo "";; esac; }
gov_idx() { local i; for i in "${!GOV_LISTA[@]}"; do [ "${GOV_LISTA[$i]}" = "$1" ] && { echo "$i"; return; }; done; echo -1; }
if [ -x "$GOV" ]; then
  GOV_CEL="$(gov_id "$TARGET")"
  [ -n "$GOV_CEL" ] || { log "MariaDB $TARGET nie jest dostępna przez MySQL Governor — wybierz 11.4."; marker "from=${CURRENT:-unknown} to=$TARGET status=rejected reason=governor_version_unsupported"; exit 1; }
  if [ -n "$CURRENT" ] && [ "$(gov_idx "$(gov_id "$CURRENT")")" -ge 0 ] \
     && [ "$(( $(gov_idx "$GOV_CEL") - $(gov_idx "$(gov_id "$CURRENT")") ))" -ne 1 ]; then
    log "MySQL Governor: aktualizacja tylko o jedną wersję naraz ($CURRENT → następna na liście, nie $TARGET)."
    marker "from=$CURRENT to=$TARGET status=rejected reason=governor_step_by_step"; exit 1
  fi
fi

# --- 4. PEŁNY backup przed jakąkolwiek zmianą ----------------------------
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
DUMP_FILE="$BACKUP_DIR/predump-${CURRENT:-unknown}-to-${TARGET}-${TS}.sql.gz"
log "Backup wszystkich baz → $DUMP_FILE (to może chwilę potrwać)…"
# --single-transaction: spójny zrzut bez długiej blokady InnoDB; +routines/triggers/events.
if ! "$DUMP_BIN" "${MYA[@]}" --all-databases --single-transaction --routines --triggers --events 2>/dev/null | gzip -c > "$DUMP_FILE"; then
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

# --- 5. Upgrade: MySQL Governor albo CustomBuild -------------------------
if [ -x "$GOV" ]; then
  log "MySQL Governor: --mysql-version=$GOV_CEL, --install (NIE przerywaj)…"
  "$GOV" --mysql-version="$GOV_CEL"
  "$GOV" --install --yes
else
  # Oficjalna dokumentacja DA: da build set mysql_inst mariadb; da build set mariadb X.Y; da build mariadb.
  cd "$CB"
  log "CustomBuild: aktualizacja skryptów…"
  ./build update >/dev/null 2>&1 || true
  log "CustomBuild: set mysql_inst mariadb, set mariadb $TARGET"
  ./build set mysql_inst mariadb
  ./build set mariadb "$TARGET"
  log "CustomBuild: build mariadb (instalacja/upgrade silnika — NIE przerywaj)…"
  ./build mariadb
fi

# --- 6. Post-upgrade: mysql_upgrade + weryfikacja ------------------------
log "Aktualizacja tabel systemowych (mariadb-upgrade)…"
if command -v mariadb-upgrade >/dev/null 2>&1; then
  mariadb-upgrade "${MYA[@]}" --force >/dev/null 2>&1 || log "UWAGA: mariadb-upgrade zwrócił błąd"
elif command -v mysql_upgrade >/dev/null 2>&1; then
  mysql_upgrade "${MYA[@]}" --force >/dev/null 2>&1 || log "UWAGA: mysql_upgrade zwrócił błąd"
fi

NEW="$(detect_version)"
log "Wersja po upgrade: ${NEW:-nieznana}"

# Sanity: serwer DB odpowiada?
if mysql "${MYA[@]}" -e "SELECT VERSION();" >/dev/null 2>&1; then
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
