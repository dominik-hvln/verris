#!/usr/bin/env bash
# Naprawa brakującego / niezsynchronizowanego użytkownika da_admin w MariaDB na węźle DA.
# Bez tego CMD_API_DATABASES zwraca 500 ("Unable to connect to the database").
#
# Uruchom na węźle (root): bash ops/scripts/node-da-mysql-admin-fix.sh [--random]
set -Eeuo pipefail

MYSQL_CONF=/usr/local/directadmin/conf/mysql.conf
RESET_SCRIPT=/usr/local/directadmin/scripts/reset_da_admin_password.sh

if [[ ! -f "${MYSQL_CONF}" ]]; then
  echo "Brak ${MYSQL_CONF} — to nie wygląda na host DirectAdmin." >&2
  exit 1
fi

DA_ADMIN="$(grep -m1 '^user=' "${MYSQL_CONF}" | cut -d= -f2-)"
DA_ADMIN="${DA_ADMIN:-da_admin}"
CURRENT_PASS="$(grep -m1 '^passwd=' "${MYSQL_CONF}" | cut -d= -f2-)"

if mysql -u"${DA_ADMIN}" -p"${CURRENT_PASS}" -e 'SELECT 1' &>/dev/null; then
  echo "[ok] ${DA_ADMIN} loguje się do MariaDB — nic do zrobienia."
  exit 0
fi

echo "[fix] ${DA_ADMIN} nie działa — odtwarzam konto MySQL…"

if [[ "${1:-}" == "--random" ]] && [[ -x "${RESET_SCRIPT}" ]]; then
  if bash "${RESET_SCRIPT}" --random; then
    echo "[ok] reset_da_admin_password.sh zakończony."
    exit 0
  fi
  echo "[warn] reset script nie powiódł się — próbuję CREATE USER…"
fi

NEW_PASS="${CURRENT_PASS}"
if [[ "${1:-}" == "--random" ]] || [[ -z "${NEW_PASS}" ]]; then
  NEW_PASS="$(openssl rand -base64 12 | tr -d '/+=' | head -c 16)"
fi

mysql -e "
CREATE USER IF NOT EXISTS '${DA_ADMIN}'@'localhost' IDENTIFIED BY '${NEW_PASS}';
ALTER USER '${DA_ADMIN}'@'localhost' IDENTIFIED BY '${NEW_PASS}';
GRANT ALL PRIVILEGES ON *.* TO '${DA_ADMIN}'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
"

sed -i "s/^passwd=.*/passwd=${NEW_PASS}/" "${MYSQL_CONF}"
chmod 600 "${MYSQL_CONF}" 2>/dev/null || true

if mysql -u"${DA_ADMIN}" -p"${NEW_PASS}" -e 'SELECT 1' &>/dev/null; then
  echo "[ok] ${DA_ADMIN} działa. Zaktualizowano ${MYSQL_CONF}."
  /usr/local/directadmin/directadmin my-cnf 2>/dev/null | head -3 || true
else
  echo "[fail] Nadal nie można zalogować jako ${DA_ADMIN}." >&2
  exit 1
fi
