#!/usr/bin/env bash
# =============================================================================
# Verris — eksport i import bazy MySQL/MariaDB klienta (D-12). Uruchamiany przez agenta
# zadań (DB_TRANSFER) z env:
#   DBT_MODE     export | import | repair | optimize | privileges
#   DBT_USER     (privileges) użytkownik MySQL konta: <login>_<nazwa>
#   DBT_PRIVS    (privileges) full | rw | ro — D-08: pełne / odczyt i zapis danych / tylko odczyt
#   DBT_DA_USER  login konta DA (z rekordu konta w API, nigdy z wejścia klienta)
#   DBT_DB       pełna nazwa bazy: <login>_<nazwa>
#   DBT_FILE     (import) nazwa pliku .sql lub .sql.gz w ~/verris-bazy
#
# Zasady bezpieczeństwa:
#  - każda operacja na plikach klienta idzie jako KLIENT (runuser), nie jako root — dowiązanie
#    symboliczne w katalogu klienta nie da dostępu do plików systemu;
#  - import wykonuje tymczasowy użytkownik MySQL z uprawnieniami WYŁĄCZNIE do tej bazy
#    (`USE inna_baza`, `CREATE DATABASE`, `GRANT` w pliku kończą się odmową), usuwany po zadaniu;
#  - przed importem automatyczna kopia bazy (…-przed-importem-….sql.gz) w tym samym katalogu;
#  - klauzule DEFINER są usuwane (wymagałyby uprawnień SUPER).
# D-18: repair = sprawdzenie tabel z automatyczną naprawą, optimize = odzyskanie miejsca i przebudowa
# indeksów (InnoDB: recreate + analyze) — mysqlcheck tylko na tej jednej bazie.
# Wynik dla API: linie `VERRIS_WYNIK_PLIK=<ścieżka względem katalogu domowego>`;
# repair/optimize: `VERRIS_DB_TABELE=<liczba>` i `VERRIS_DB_UWAGA=<tabela: komunikat>` (do 20).
# =============================================================================
set -Eeuo pipefail

: "${DBT_MODE:?}"; : "${DBT_DA_USER:?}"; : "${DBT_DB:?}"

log() { echo "[db-transfer] $*"; }
fail() { log "BŁĄD: $*"; exit 1; }

KATALOG_WZGL="verris-bazy"
LIMIT_IMPORTU=$((2 * 1024 * 1024 * 1024)) # 2 GB

[[ "$DBT_MODE" =~ ^(export|import|repair|optimize|privileges)$ ]] || fail "nieznany tryb: $DBT_MODE"
[[ "$DBT_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$DBT_DB" =~ ^${DBT_DA_USER}_[A-Za-z0-9_]{1,48}$ ]] || fail "baza nie należy do konta $DBT_DA_USER"
id "$DBT_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $DBT_DA_USER"

HOME_DIR="$(getent passwd "$DBT_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"

DUMP_BIN="mysqldump"; command -v mariadb-dump >/dev/null 2>&1 && DUMP_BIN="mariadb-dump"
DA_MYCNF="/usr/local/directadmin/conf/my.cnf"
# Administrator MySQL: gniazdo roota, a gdy nie działa — konto da_admin z konfiguracji DirectAdmina.
ADMIN_OPTS=()
if ! mysql -Nse 'SELECT 1' >/dev/null 2>&1; then
  [ -r "$DA_MYCNF" ] || fail "brak dostępu administracyjnego do MySQL"
  ADMIN_OPTS=(--defaults-extra-file="$DA_MYCNF")
fi
mysql_admin() { mysql "${ADMIN_OPTS[@]}" "$@"; }

istnieje="$(mysql_admin -Nse "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${DBT_DB}'")"
[ "$istnieje" = "$DBT_DB" ] || fail "baza $DBT_DB nie istnieje"

jako_klient() { runuser -u "$DBT_DA_USER" -- "$@"; }

if [ "$DBT_MODE" = "privileges" ]; then
  : "${DBT_USER:?}"; : "${DBT_PRIVS:?}"
  [[ "$DBT_USER" =~ ^${DBT_DA_USER}_[A-Za-z0-9_]{1,48}$ ]] || fail "użytkownik nie należy do konta $DBT_DA_USER"
  case "$DBT_PRIVS" in
    full) PRAWA="ALL PRIVILEGES" ;;
    rw) PRAWA="SELECT, INSERT, UPDATE, DELETE, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, SHOW VIEW" ;;
    ro) PRAWA="SELECT, SHOW VIEW" ;;
    *) fail "nieznany zestaw uprawnień" ;;
  esac
  HOSTY="$(mysql_admin -Nse "SELECT Host FROM mysql.user WHERE User='${DBT_USER}'")"
  [ -n "$HOSTY" ] || fail "użytkownik $DBT_USER nie istnieje"
  DB_ESC="${DBT_DB//_/\\_}"
  while IFS= read -r h; do
    [[ "$h" =~ ^[A-Za-z0-9.%:_-]{1,255}$ ]] || { log "pomijam nietypowy host"; continue; }
    # DirectAdmin nadaje prawa na nazwę bez ucieczki „_” — zdejmujemy obie formy, nadajemy z ucieczką.
    mysql_admin -e "REVOKE ALL PRIVILEGES ON \`${DBT_DB}\`.* FROM '${DBT_USER}'@'${h}'" 2>/dev/null || true
    mysql_admin -e "REVOKE ALL PRIVILEGES ON \`${DB_ESC}\`.* FROM '${DBT_USER}'@'${h}'" 2>/dev/null || true
    mysql_admin -e "GRANT ${PRAWA} ON \`${DB_ESC}\`.* TO '${DBT_USER}'@'${h}'" || fail "nie udało się nadać uprawnień dla hosta ${h}"
    log "uprawnienia $DBT_PRIVS: $DBT_USER@$h → $DBT_DB"
  done <<< "$HOSTY"
  echo "VERRIS_DB_UPRAWNIENIA=$DBT_PRIVS"
  log "Gotowe."
  exit 0
fi

if [ "$DBT_MODE" = "repair" ] || [ "$DBT_MODE" = "optimize" ]; then
  CHECK_BIN="mysqlcheck"; command -v mariadb-check >/dev/null 2>&1 && CHECK_BIN="mariadb-check"
  if [ "$DBT_MODE" = "repair" ]; then OPCJE=(--check --auto-repair); else OPCJE=(--optimize); fi
  log "$DBT_MODE $DBT_DB…"
  WYJSCIE="$("$CHECK_BIN" "${ADMIN_OPTS[@]}" "${OPCJE[@]}" --databases "$DBT_DB" 2>&1)" || {
    printf '%s\n' "$WYJSCIE" | tail -n 20
    fail "$([ "$DBT_MODE" = repair ] && echo naprawa || echo optymalizacja) nie powiodła się"
  }
  printf '%s\n' "$WYJSCIE" | DB="$DBT_DB" python3 -c '
import os, sys
db = os.environ["DB"] + "."
tabela, tabele, uwagi = None, 0, []
for l in sys.stdin.read().splitlines():
    if l.startswith(db):
        tabela = l.split()[0][len(db):]
        tabele += 1
        reszta = l[len(db) + len(tabela):].strip()
        if reszta and reszta not in ("OK", "Table is already up to date"):
            uwagi.append((tabela, reszta))
    elif tabela and l.strip().lower().startswith(("error", "warning")):
        uwagi.append((tabela, l.strip()))
print("VERRIS_DB_TABELE=%d" % tabele)
for t, u in uwagi[:20]:
    print("VERRIS_DB_UWAGA=%s: %s" % (t[:64], " ".join(u.split())[:200]))
'
  log "Gotowe."
  exit 0
fi
jako_klient mkdir -p "$HOME_DIR/$KATALOG_WZGL"

# zrzut <nazwa-pliku> — zrzut bazy prosto do pliku zapisywanego przez KLIENTA.
zrzut() {
  local cel="$HOME_DIR/$KATALOG_WZGL/$1"
  "$DUMP_BIN" "${ADMIN_OPTS[@]}" --single-transaction --quick --routines --triggers --no-tablespaces "$DBT_DB" \
    | gzip -c \
    | jako_klient sh -c 'umask 077; cat > "$1"' _ "$cel"
  local rozmiar
  rozmiar="$(jako_klient stat -c%s "$cel")"
  [ "$rozmiar" -ge 20 ] || fail "zrzut podejrzanie mały ($rozmiar B)"
  log "zrzut $DBT_DB → ~/$KATALOG_WZGL/$1 ($rozmiar B)"
  echo "VERRIS_WYNIK_PLIK=$KATALOG_WZGL/$1"
}

# Sekundy + losowy przyrostek: dwa zadania w tej samej sekundzie nie nadpiszą sobie kopii.
TS="$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"

if [ "$DBT_MODE" = "export" ]; then
  zrzut "${DBT_DB}-${TS}.sql.gz"
  log "Gotowe."
  exit 0
fi

# ---------------------------------------------------------------- import
: "${DBT_FILE:?}"
[[ "$DBT_FILE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.sql(\.gz)?$ ]] || fail "nieprawidłowa nazwa pliku"
ZRODLO="$HOME_DIR/$KATALOG_WZGL/$DBT_FILE"
jako_klient test -f "$ZRODLO" || fail "brak pliku ~/$KATALOG_WZGL/$DBT_FILE"
ROZMIAR="$(jako_klient stat -c%s "$ZRODLO")"
[ "$ROZMIAR" -le "$LIMIT_IMPORTU" ] || fail "plik większy niż 2 GB"

log "kopia bazy przed importem…"
zrzut "${DBT_DB}-przed-importem-${TS}.sql.gz"

TMP_USER="vt_$(openssl rand -hex 6)"
TMP_PASS="$(openssl rand -hex 24)"
TMP_CNF="$(mktemp)"
chmod 600 "$TMP_CNF"
sprzatnij() {
  rm -f "$TMP_CNF"
  mysql_admin -e "DROP USER IF EXISTS '${TMP_USER}'@'localhost'" >/dev/null 2>&1 || true
}
trap sprzatnij EXIT
printf '[client]\nuser=%s\npassword=%s\n' "$TMP_USER" "$TMP_PASS" > "$TMP_CNF"
# W GRANT „_” w nazwie bazy to symbol wieloznaczny — bez ucieczki login_db pasowałby też do loginXdb.
DB_GRANT="${DBT_DB//_/\\_}"
# Hasło przez stdin, nie w argumentach procesu.
mysql_admin <<SQL
CREATE USER '${TMP_USER}'@'localhost' IDENTIFIED BY '${TMP_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_GRANT}\`.* TO '${TMP_USER}'@'localhost';
SQL

log "import ~/$KATALOG_WZGL/$DBT_FILE ($ROZMIAR B) → $DBT_DB"
czytaj() {
  if [[ "$DBT_FILE" == *.gz ]]; then jako_klient cat "$ZRODLO" | gzip -dc; else jako_klient cat "$ZRODLO"; fi
}
if ! czytaj | sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g' | mysql --defaults-extra-file="$TMP_CNF" --database="$DBT_DB"; then
  fail "import przerwany — baza mogła zostać zmieniona częściowo. Przywrócisz ją importem pliku ~/$KATALOG_WZGL/${DBT_DB}-przed-importem-${TS}.sql.gz"
fi

log "Gotowe: import zakończony. Kopia sprzed importu: ~/$KATALOG_WZGL/${DBT_DB}-przed-importem-${TS}.sql.gz"
