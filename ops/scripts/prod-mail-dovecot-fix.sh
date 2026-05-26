#!/usr/bin/env bash
# Naprawa Dovecot dla skrzynek @verris.pl (virtual-only auth, bez systemowego userdb).
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

AUTH_CONF=/etc/dovecot/conf.d/10-auth.conf
VERIS_CONF=/etc/dovecot/conf.d/99-verris.conf

cp ops/dovecot/99-verris.conf "$VERIS_CONF"

for inc in auth-system.conf.ext auth-passwdfile.conf.ext; do
  if grep -q "^!include ${inc}" "$AUTH_CONF"; then
    sed -i "s/^!include ${inc}/#!include ${inc}/" "$AUTH_CONF"
    echo "[dovecot-fix] Disabled ${inc} in 10-auth.conf"
  fi
done

MAP_DIR=/etc/postfix/verris
if [[ -d "${MAP_DIR}" ]]; then
  chmod 755 "${MAP_DIR}"
  chmod 644 "${MAP_DIR}/dovecot-passwd" 2>/dev/null || true
  echo "[dovecot-fix] ${MAP_DIR} mode 755 (Dovecot readable)"
fi

systemctl reload dovecot
echo "[dovecot-fix] Dovecot reloaded"
