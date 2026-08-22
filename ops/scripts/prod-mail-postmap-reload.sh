#!/usr/bin/env bash
# Po sync z panelu API — buduje hash map Postfix i przeładowuje usługi.
# Uruchom na hoście: cd /opt/verris && ./ops/scripts/prod-mail-postmap-reload.sh
set -Eeuo pipefail

MAP_DIR="${CONTROL_PLANE_MAIL_MAPS_DIR:-/etc/postfix/verris}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

if [[ ! -d "${MAP_DIR}" ]]; then
  echo "[postmap] Brak katalogu ${MAP_DIR}" >&2
  exit 1
fi

for f in virtual_mailbox_maps virtual_alias_maps; do
  if [[ -f "${MAP_DIR}/${f}" ]]; then
    postmap "${MAP_DIR}/${f}"
    echo "[postmap] ${f} OK"
  fi
done

systemctl reload postfix 2>/dev/null || systemctl restart postfix
systemctl reload dovecot 2>/dev/null || true
echo "[postmap] postfix/dovecot reload done"
