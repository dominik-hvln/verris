#!/usr/bin/env bash
# Verris — wildcard Let's Encrypt *.verris.pl + verris.pl (DNS-01 OVH) → DirectAdmin na węźle.
#
# Uruchamiaj NA węźle compute jako root (np. Node-PL-01):
#
#   export OVH_APP_KEY=...
#   export OVH_APP_SECRET=...
#   export OVH_CONSUMER_KEY=...
#   export CERTBOT_EMAIL=admin@verris.pl
#   bash ops/scripts/node-wildcard-tls-ovh.sh
#
# Opcje:
#   --deploy-only   tylko instalacja istniejącego certu w DA (bez certbot)
#   --renew         wymuś certbot renew
#
# Jak uzyskać klucze OVH: ops/docs/OVH_WILDCARD_TLS_SETUP.md
set -Eeuo pipefail

CERT_NAME="verris-wildcard"
CERT_DIR="/etc/letsencrypt/live/${CERT_NAME}"
OVH_INI="/root/.secrets/ovh-dns.ini"
DA="/usr/local/directadmin"
LOG_TAG="[verris-node-wildcard-tls]"

DEPLOY_ONLY=0
FORCE_RENEW=0

for arg in "$@"; do
  case "$arg" in
    --deploy-only) DEPLOY_ONLY=1 ;;
    --renew) FORCE_RENEW=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

log() { echo "$LOG_TAG $*"; }
die() { log "FAIL: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Uruchom jako root"

ensure_certbot_ovh() {
  if ! command -v certbot >/dev/null 2>&1; then
    log "Instalacja certbot..."
    dnf install -y certbot 2>/dev/null || apt-get install -y certbot
  fi
  if ! certbot plugins 2>/dev/null | grep -qi dns-ovh; then
    log "Instalacja certbot-dns-ovh..."
    dnf install -y python3-certbot-dns-ovh 2>/dev/null || apt-get install -y python3-certbot-dns-ovh 2>/dev/null || \
      die "Zainstaluj python3-certbot-dns-ovh ręcznie"
  fi
}

ensure_ovh_ini() {
  if [ -f "$OVH_INI" ]; then
    chmod 600 "$OVH_INI"
    return 0
  fi
  if [ -z "${OVH_APP_KEY:-}" ] || [ -z "${OVH_APP_SECRET:-}" ] || [ -z "${OVH_CONSUMER_KEY:-}" ]; then
    die "Brak $OVH_INI — ustaw OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY (patrz ops/docs/OVH_WILDCARD_TLS_SETUP.md)"
  fi
  mkdir -p "$(dirname "$OVH_INI")"
  cat > "$OVH_INI" <<EOF
dns_ovh_application_key = ${OVH_APP_KEY}
dns_ovh_application_secret = ${OVH_APP_SECRET}
dns_ovh_consumer_key = ${OVH_CONSUMER_KEY}
dns_ovh_endpoint = ${OVH_ENDPOINT:-ovh-eu}
EOF
  chmod 600 "$OVH_INI"
  log "Utworzono $OVH_INI"
}

issue_or_renew() {
  ensure_certbot_ovh
  ensure_ovh_ini
  if [ "$FORCE_RENEW" = "1" ]; then
    log "Wymuszone odnowienie..."
    certbot renew --cert-name "$CERT_NAME" --dns-ovh --dns-ovh-credentials "$OVH_INI"
  elif [ -d "$CERT_DIR" ] && certbot certificates 2>/dev/null | grep -q "$CERT_NAME"; then
    log "Odświeżanie istniejącego certu..."
    certbot renew --cert-name "$CERT_NAME" --dns-ovh --dns-ovh-credentials "$OVH_INI" --quiet || true
  else
    log "Wydawanie wildcard *.verris.pl + verris.pl (DNS-01 OVH)..."
    certbot certonly \
      --non-interactive --agree-tos \
      --email "${CERTBOT_EMAIL:-admin@verris.pl}" \
      --dns-ovh --dns-ovh-credentials "$OVH_INI" \
      --dns-ovh-propagation-seconds 120 \
      --cert-name "$CERT_NAME" \
      -d '*.verris.pl' -d 'verris.pl'
  fi
  [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ] || die "Brak plików cert w $CERT_DIR"
}

install_da() {
  [ -d "$DA/conf" ] || die "DirectAdmin nie znaleziony w $DA"
  cp "${CERT_DIR}/fullchain.pem" "$DA/conf/cacert.pem"
  cp "${CERT_DIR}/privkey.pem" "$DA/conf/cakey.pem"
  cp "${CERT_DIR}/fullchain.pem" "$DA/conf/carootcert.pem"
  chmod 600 "$DA/conf/cakey.pem"
  systemctl restart directadmin 2>/dev/null || service directadmin restart 2>/dev/null || true
  "$DA/directadmin" r 2>/dev/null || true
  log "Cert wildcard zainstalowany w DirectAdmin"
}

ensure_renew_hook() {
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/directadmin-wildcard.sh <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
RENEWED_LINEAGE="${RENEWED_LINEAGE:-}"
[[ "${RENEWED_LINEAGE:-}" == *verris-wildcard* ]] || exit 0
DA="/usr/local/directadmin"
cp "$RENEWED_LINEAGE/fullchain.pem" "$DA/conf/cacert.pem"
cp "$RENEWED_LINEAGE/privkey.pem" "$DA/conf/cakey.pem"
cp "$RENEWED_LINEAGE/fullchain.pem" "$DA/conf/carootcert.pem"
chmod 600 "$DA/conf/cakey.pem"
systemctl restart directadmin 2>/dev/null || service directadmin restart 2>/dev/null || true
HOOK
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/directadmin-wildcard.sh
  systemctl enable --now certbot-renew.timer 2>/dev/null || true
}

main() {
  log "Start wildcard TLS *.verris.pl"
  if [ "$DEPLOY_ONLY" != "1" ]; then
    issue_or_renew
  else
    [ -f "${CERT_DIR}/fullchain.pem" ] || die "Brak certu — uruchom bez --deploy-only"
  fi
  install_da
  ensure_renew_hook
  log "OK. Test: curl -vI https://node-pl-01.verris.pl:2222/ 2>&1 | grep -E 'subject:|issuer:|verify'"
  log "UWAGA: cert obejmuje *.verris.pl — NIE surowe IP. Używaj https://node-pl-01.verris.pl:2222"
}

main "$@"
