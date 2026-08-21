#!/usr/bin/env bash
# Allow inbound MX delivery to virtual mailboxes (not only Docker mynetworks relay).
# Run on host: cd /opt/verris && ./ops/scripts/prod-mail-inbound-fix.sh
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

MAP_DIR="${CONTROL_PLANE_MAIL_MAPS_DIR:-/etc/postfix/verris}"

postconf -e 'smtpd_relay_restrictions ='
postconf -e 'smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_non_fqdn_recipient, reject_unauth_destination'

postmap "${MAP_DIR}/virtual_mailbox_maps" 2>/dev/null || true
postmap "${MAP_DIR}/virtual_alias_maps" 2>/dev/null || true
systemctl reload postfix

echo "[mail-inbound] smtpd_recipient_restrictions updated; postfix reloaded"
postconf smtpd_relay_restrictions smtpd_recipient_restrictions
