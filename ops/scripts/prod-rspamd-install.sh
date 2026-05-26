#!/usr/bin/env bash
# MAIL-4e: Rspamd + Postfix milter (inbound antispam; outbound scan + OpenDKIM sign).
# Run as root: cd /opt/verris && ./ops/scripts/prod-rspamd-install.sh
set -Eeuo pipefail

cd "$(dirname "$0")/../.."
SRC_LOCALD=ops/rspamd/local.d
DST_LOCALD=/etc/rspamd/local.d

log() { echo "[rspamd-install] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq rspamd redis-server

log "Install Verris local.d overrides"
install -d -m 0755 "${DST_LOCALD}"
for f in "${SRC_LOCALD}"/*.conf; do
  install -m 0644 "${f}" "${DST_LOCALD}/$(basename "${f}")"
done
chown -R _rspamd:_rspamd /var/lib/rspamd/ 2>/dev/null || true

systemctl enable --now redis-server rspamd
systemctl restart rspamd

log "Postfix milter chain"
postconf -e 'milter_protocol = 6'
postconf -e 'milter_default_action = accept'
postconf -e 'milter_mail_macros = i {mail_addr} {client_addr} {client_name} {auth_authen}'
# Inbound (MX): tylko Rspamd. Wychodzące (API/SOGo): Rspamd (łagodnie) + OpenDKIM podpis.
postconf -e 'smtpd_milters = inet:127.0.0.1:11332'
postconf -e 'non_smtpd_milters = inet:127.0.0.1:11332, inet:127.0.0.1:8891'

systemctl reload postfix 2>/dev/null || systemctl restart postfix

if command -v rspamadm >/dev/null; then
  rspamadm stat 2>/dev/null | head -5 || true
fi

if command -v rspamadm >/dev/null; then
  if ! rspamadm configtest 2>&1 | grep -q 'syntax OK'; then
    log "WARN: rspamadm configtest failed"
  fi
fi

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ss -tlnp | grep -q ':11332'; then
    log "Rspamd milter listening on 11332"
    break
  fi
  sleep 2
done
if ! ss -tlnp | grep -q ':11332'; then
  log "WARN: port 11332 not listening — check journalctl -u rspamd"
fi

postconf smtpd_milters non_smtpd_milters | sed 's/^/[rspamd-install] /'
log "done — test: journalctl -u rspamd -f przy wysyłce/odbiorze"
