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
if [[ -f "${MAP_DIR}/virtual_mailbox_maps" ]]; then
  while IFS=$'\t' read -r _email _path; do
    [[ -z "${_email}" || "${_email}" == \#* ]] && continue
    _path="${_path%/}"
    mkdir -p "${VHOST_ROOT}/${_path}"
    chown vmail:vmail "${VHOST_ROOT}/${_path}" 2>/dev/null || true
  done <"${MAP_DIR}/virtual_mailbox_maps"
fi
chmod 644 "${MAP_DIR}/dovecot-passwd" 2>/dev/null || true

exec "$(dirname "$0")/prod-mail-postmap-reload.sh"
