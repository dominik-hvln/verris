#!/usr/bin/env bash
# =============================================================================
# Verris — PostgreSQL dla konta hostingowego (D-14). Serwer PostgreSQL 16 z AppStream instaluje profil
# węzła (node-hosting-profile.sh); ten skrypt zakłada/usuwa bazy konta. Uruchamiany przez agenta zadań
# (PGSQL) z env:
#   PG_MODE     list | create | delete | password
#   PG_DA_USER  login konta DA
#   PG_DB       sufiks bazy (baza i jej rola: <login>_<sufiks>, jak bazy MySQL w DirectAdmin)
#   PG_PASS     hasło roli (create | password) — generuje je API, pokazywane klientowi raz
#   PG_MAX      limit baz na konto (domyślnie 5)
# Izolacja: jedna rola na bazę (LOGIN, bez CREATEDB/CREATEROLE, limit połączeń), REVOKE CONNECT dla PUBLIC,
# serwer tylko na localhost, scram-sha-256. SQL z hasłem idzie przez stdin psql (nie ma go w `ps`).
# Każdy tryb kończy się listą baz konta: VERRIS_PGSQL_DB=<nazwa> <bajty>.
# Przy create instaluje też (idempotentnie): codzienny zrzut baz do ~/.verris-pgsql/ konta (trafia do
# kopii DirectAdmina razem z katalogiem domowym) i hook DA user_destroy_post (usunięcie konta w DA
# usuwa jego bazy PostgreSQL) — docs.directadmin.com → Developer → Hook scripts.
# =============================================================================
set -Eeuo pipefail

: "${PG_MODE:?}"; : "${PG_DA_USER:?}"; : "${PG_DB:=}"; : "${PG_PASS:=}"; : "${PG_MAX:=5}"

log() { echo "[pgsql] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$PG_MODE" =~ ^(list|create|delete|password)$ ]] || fail "nieznany tryb: $PG_MODE"
[[ "$PG_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$PG_MAX" =~ ^[0-9]{1,2}$ ]] || fail "nieprawidłowy limit baz"
id "$PG_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $PG_DA_USER"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL nie jest jeszcze zainstalowany na serwerze — napisz do nas"

NAZWA=""
if [ "$PG_MODE" != "list" ]; then
  [[ "$PG_DB" =~ ^[a-z0-9]{1,16}$ ]] || fail "nazwa bazy: 1–16 znaków, małe litery i cyfry"
  NAZWA="${PG_DA_USER}_${PG_DB}"
fi
if [ "$PG_MODE" = "create" ] || [ "$PG_MODE" = "password" ]; then
  [[ "$PG_PASS" =~ ^[A-Za-z0-9_-]{16,72}$ ]] || fail "nieprawidłowe hasło"
fi

sql() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d postgres "$@"; }
istnieje() { [ "$(sql -Atc "SELECT 1 FROM pg_database WHERE datname = '$1'")" = "1" ]; }
lista() {
  sql -Atc "SELECT datname || ' ' || pg_database_size(datname) FROM pg_database
            WHERE datname LIKE '${PG_DA_USER}\\_%' ORDER BY datname" | sed 's/^/VERRIS_PGSQL_DB=/'
}

zainstaluj_dodatki() {
  # Zrzut: pg_dump jako postgres, zapis jako właściciel konta (żadnego pisania roota po katalogu klienta).
  cat > /usr/local/sbin/verris-pgsql-dump <<'DUMP'
#!/usr/bin/env bash
set -uo pipefail
runuser -u postgres -- psql -X -Atc "SELECT datname FROM pg_database WHERE datname ~ '^[a-z][a-z0-9]{0,15}_[a-z0-9]{1,16}$'" -d postgres |
while read -r db; do
  login="${db%%_*}"
  id "$login" >/dev/null 2>&1 || continue
  runuser -u postgres -- pg_dump -Fc -d "$db" |
    runuser -u "$login" -- sh -c 'umask 077; mkdir -p "$HOME/.verris-pgsql" && cat > "$HOME/.verris-pgsql/$1.dump.tmp" && mv -f "$HOME/.verris-pgsql/$1.dump.tmp" "$HOME/.verris-pgsql/$1.dump"' _ "$db" ||
    echo "verris-pgsql-dump: zrzut $db nie powiódł się" >&2
done
DUMP
  chmod 700 /usr/local/sbin/verris-pgsql-dump
  echo '20 3 * * * root /usr/local/sbin/verris-pgsql-dump' > /etc/cron.d/verris-pgsql-dump
  chmod 644 /etc/cron.d/verris-pgsql-dump

  local hookdir=/usr/local/directadmin/scripts/custom/user_destroy_post
  install -d -m 755 "$hookdir"
  cat > "$hookdir/verris-pgsql.sh" <<'HOOK'
#!/usr/bin/env bash
# Verris (D-14): usunięcie konta w DirectAdmin usuwa jego bazy i role PostgreSQL.
[[ "${username:-}" =~ ^[a-z][a-z0-9]{0,15}$ ]] || exit 0
command -v psql >/dev/null 2>&1 || exit 0
runuser -u postgres -- psql -X -Atc "SELECT datname FROM pg_database WHERE datname LIKE '${username}\\_%'" -d postgres |
while read -r db; do
  runuser -u postgres -- psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" -c "DROP ROLE IF EXISTS \"$db\""
done
exit 0
HOOK
  chmod 755 "$hookdir/verris-pgsql.sh"
}

case "$PG_MODE" in
  create)
    istnieje "$NAZWA" && fail "baza $NAZWA już istnieje"
    ile="$(sql -Atc "SELECT count(*) FROM pg_database WHERE datname LIKE '${PG_DA_USER}\\_%'")"
    [ "$ile" -lt "$PG_MAX" ] || fail "limit baz PostgreSQL na konto: $PG_MAX"
    sql <<SQL
CREATE ROLE "$NAZWA" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 20 PASSWORD '$PG_PASS';
SQL
    sql -c "CREATE DATABASE \"$NAZWA\" OWNER \"$NAZWA\" ENCODING 'UTF8' TEMPLATE template0" \
        -c "REVOKE ALL ON DATABASE \"$NAZWA\" FROM PUBLIC"
    zainstaluj_dodatki
    log "Utworzono bazę $NAZWA (użytkownik $NAZWA)"
    ;;
  delete)
    istnieje "$NAZWA" || fail "baza $NAZWA nie istnieje"
    sql -c "DROP DATABASE \"$NAZWA\" WITH (FORCE)" -c "DROP ROLE IF EXISTS \"$NAZWA\""
    runuser -u "$PG_DA_USER" -- sh -c 'rm -f "$HOME/.verris-pgsql/$1.dump"' _ "$NAZWA" || true
    log "Usunięto bazę $NAZWA"
    ;;
  password)
    istnieje "$NAZWA" || fail "baza $NAZWA nie istnieje"
    sql <<SQL
ALTER ROLE "$NAZWA" PASSWORD '$PG_PASS';
SQL
    log "Zmieniono hasło użytkownika $NAZWA"
    ;;
esac

lista
log "Gotowe."
