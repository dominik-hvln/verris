#!/usr/bin/env bash
# MAIL-4a: Dovecot + Postfix virtual on Ubuntu 24.04 host; SOGo via Docker (native apt unavailable on noble).
# Run as root: cd /opt/verris && ./ops/scripts/prod-sogo-mail-bootstrap.sh
set -Eeuo pipefail

DOMAIN=verris.pl
VMAIL_UID=5000
VMAIL_GID=5000
MAP_DIR=/etc/postfix/verris
VHOST_ROOT=/var/mail/vhosts

log() { echo "[sogo-bootstrap] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

log "vmail user + maildirs"
if ! getent group vmail >/dev/null; then groupadd -g "${VMAIL_GID}" vmail; fi
if ! getent passwd vmail >/dev/null; then
  useradd -u "${VMAIL_UID}" -g vmail -d "${VHOST_ROOT}" -s /usr/sbin/nologin vmail
fi
mkdir -p "${VHOST_ROOT}/${DOMAIN}"
chown -R vmail:vmail "${VHOST_ROOT}"

log "Postfix map stubs"
mkdir -p "${MAP_DIR}"
chmod 750 "${MAP_DIR}"
for f in virtual_mailbox_maps virtual_alias_maps dovecot-passwd; do touch "${MAP_DIR}/${f}"; done
postmap "${MAP_DIR}/virtual_mailbox_maps" 2>/dev/null || true
postmap "${MAP_DIR}/virtual_alias_maps" 2>/dev/null || true

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq dovecot-core dovecot-imapd dovecot-lmtpd

postconf -e "virtual_mailbox_domains = ${DOMAIN}"
postconf -e "virtual_mailbox_maps = hash:${MAP_DIR}/virtual_mailbox_maps"
postconf -e "virtual_alias_maps = hash:${MAP_DIR}/virtual_alias_maps"
postconf -e "virtual_mailbox_base = ${VHOST_ROOT}"
postconf -e "virtual_minimum_uid = ${VMAIL_UID}"
postconf -e "virtual_uid_maps = static:${VMAIL_UID}"
postconf -e "virtual_gid_maps = static:${VMAIL_GID}"
postconf -e "virtual_transport = lmtp:unix:private/dovecot-lmtp"
postconf -e "mydestination = \$myhostname, localhost.\$mydomain, localhost"
# Inbound MX: do not use relay-only restrictions (blocks internet → virtual users).
postconf -e 'smtpd_relay_restrictions ='
postconf -e 'smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_non_fqdn_recipient, reject_unauth_destination'

cat >/etc/dovecot/conf.d/99-verris.conf <<EOF
mail_location = maildir:${VHOST_ROOT}/%d/%n
auth_mechanisms = plain login
passdb {
  driver = passwd-file
  args = ${MAP_DIR}/dovecot-passwd
}
userdb {
  driver = static
  args = uid=${VMAIL_UID} gid=${VMAIL_GID} home=${VHOST_ROOT}/%d/%n
}
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}
protocols = imap lmtp
ssl = required
ssl_cert = </etc/ssl/certs/ssl-cert-snakeoil.pem
ssl_key = </etc/ssl/private/ssl-cert-snakeoil.key
EOF

systemctl enable --now dovecot
systemctl restart postfix

ufw allow 25/tcp comment 'SMTP MX inbound' 2>/dev/null || true
ufw allow 587/tcp comment 'SMTP submission' 2>/dev/null || true
ufw allow 993/tcp comment 'IMAPS' 2>/dev/null || true
ufw reload 2>/dev/null || true

log "Rspamd antispam (MAIL-4e)"
cd "$(dirname "$0")/../.."
./ops/scripts/prod-rspamd-install.sh

log "SOGo via Docker (see ops/scripts/prod-sogo-mail-up.sh)"
./ops/scripts/prod-sogo-mail-up.sh

log "done — reload Caddy with mail.verris.pl and sync maps from admin panel"
