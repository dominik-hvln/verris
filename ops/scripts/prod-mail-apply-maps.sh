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
if [[ ! -d "${MAP_DIR}" ]]; then
  echo "[mail-maps] Brak katalogu ${MAP_DIR}"
  exit 1
fi

if [[ -f "${MAP_DIR}/virtual_mailbox_maps" ]]; then
  postmap "${MAP_DIR}/virtual_mailbox_maps"
  echo "[mail-maps] postmap virtual_mailbox_maps OK"
fi
if [[ -f "${MAP_DIR}/virtual_alias_maps" ]]; then
  postmap "${MAP_DIR}/virtual_alias_maps"
  echo "[mail-maps] postmap virtual_alias_maps OK"
fi

systemctl reload postfix 2>/dev/null || true
systemctl reload dovecot 2>/dev/null || true
echo "[mail-maps] done"
