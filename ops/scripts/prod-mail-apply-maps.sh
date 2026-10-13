#!/usr/bin/env bash
# Generuje mapy Postfix/Dovecot z bazy Verris i uruchamia postmap + reload.
# Uruchamiaj na hoście: cd /opt/verris && ./ops/scripts/prod-mail-apply-maps.sh
set -Eeuo pipefail

cd "$(dirname "$0")/../.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"

echo "[mail-maps] Wywołanie API sync-postfix (wymaga zalogowanego admina lub użyj curl z tokenem)…"
echo "[mail-maps] Alternatywa: w panelu admin → Poczta zespołu → Synchronizuj mapy Postfix"

if docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T api \
  wget -qO- --post-data='' --header='Content-Type: application/json' \
  http://127.0.0.1:3000/admin/mailboxes/sync-postfix 2>/dev/null; then
  echo "[mail-maps] API sync OK (jeśli endpoint wymaga JWT — użyj panelu admin)"
else
  echo "[mail-maps] Pomijam wywołanie API — zsynchronizuj z panelu admin"
fi

MAP_DIR="${CONTROL_PLANE_MAIL_MAPS_DIR:-/etc/postfix/verris}"
chmod 755 "${MAP_DIR}" 2>/dev/null || true
if [[ ! -d "${MAP_DIR}" ]]; then
  echo "[mail-maps] Brak katalogu ${MAP_DIR}"
  exit 1
fi

VHOST_ROOT="${CONTROL_PLANE_MAIL_DATA_ROOT:-/var/mail/vhosts}"
# Skrypt działa jako root, a ścieżki pochodzą z bazy (domena/lokalna z postfix-map-sync.service.ts).
# Tworzymy wyłącznie katalogi „domena/lokalna” wewnątrz VHOST_ROOT — bez „..”, ścieżek bezwzględnych
# i symlinków wyprowadzających poza korzeń; resztę pomijamy z wpisem w logu.
_SEG='[A-Za-z0-9][A-Za-z0-9._+=-]*'
_ROOT_REAL="$(realpath -m -- "${VHOST_ROOT}")"
if [[ -f "${MAP_DIR}/virtual_mailbox_maps" ]]; then
  while IFS=$'\t' read -r _email _path; do
    [[ -z "${_email}" || "${_email}" == \#* ]] && continue
    _path="${_path%/}"
    if [[ ! "${_path}" =~ ^${_SEG}/${_SEG}$ || "${_path}" == *..* ]]; then
      echo "[mail-maps] Pomijam niepoprawną ścieżkę skrzynki dla ${_email}: ${_path}" >&2
      continue
    fi
    _cel="$(realpath -m -- "${VHOST_ROOT}/${_path}")"
    if [[ "${_cel}" != "${_ROOT_REAL}"/* ]]; then
      echo "[mail-maps] Pomijam ścieżkę poza ${VHOST_ROOT} dla ${_email}: ${_path}" >&2
      continue
    fi
    mkdir -p -- "${_cel}"
    chown vmail:vmail "${_cel}" 2>/dev/null || true
  done <"${MAP_DIR}/virtual_mailbox_maps"
fi
chmod 644 "${MAP_DIR}/dovecot-passwd" 2>/dev/null || true

exec "$(dirname "$0")/prod-mail-postmap-reload.sh"
