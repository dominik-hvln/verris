#!/usr/bin/env bash
# Przywraca podpis DKIM dla maili wysyłanych przez API (Docker → Postfix smtpd).
# Problem: OpenDKIM był tylko na non_smtpd_milters; maile z API idą przez smtpd → brak DKIM
# → DMARC strict (adkim=s) → SPAM u odbiorcy.
#
# Uruchom na hoście: cd /opt/verris && ./ops/scripts/prod-mail-dkim-outbound-fix.sh
set -Eeuo pipefail

log() { echo "[dkim-outbound] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

systemctl is-active --quiet opendkim || systemctl restart opendkim
ss -tlnp | grep -q ':8891' || { log "OpenDKIM not listening on 8891"; exit 1; }

postconf -e 'smtpd_milters = inet:127.0.0.1:11332, inet:127.0.0.1:8891'
postconf -e 'non_smtpd_milters = inet:127.0.0.1:8891'
systemctl reload postfix 2>/dev/null || systemctl restart postfix

log "smtpd_milters=$(postconf -h smtpd_milters)"
log "non_smtpd_milters=$(postconf -h non_smtpd_milters)"

if command -v swaks >/dev/null; then
  TEST_TO="${DKIM_TEST_TO:-dominik@dkowalski.pl}"
  swaks --to "${TEST_TO}" --from support@verris.pl --server 127.0.0.1 --port 25 \
    --header "Subject: [verris-dkim-fix] $(date +%s)" \
    --body "DKIM outbound fix smoke" >/dev/null 2>&1 || true
  sleep 1
  if grep -q "DKIM-Signature field added" /var/log/mail.log 2>/dev/null; then
    log "OK — DKIM-Signature field added (see /var/log/mail.log)"
  else
    log "WARN — brak wpisu DKIM w logu; sprawdź journalctl -u opendkim"
  fi
else
  log "swaks not installed — skip send test"
fi

log "done"
