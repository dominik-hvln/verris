#!/usr/bin/env bash
# Verris — Let's Encrypt dla pojedynczego hostname węzła (HTTP-01, bez OVH API).
# Uruchamiaj NA węźle compute jako root, gdy DNS A wskazuje na ten serwer i :80 jest otwarty.
#
#   bash ops/scripts/node-directadmin-tls-http01.sh node-pl-01.verris.pl
#   bash ops/scripts/node-directadmin-tls-http01.sh --renew node-pl-01.verris.pl
#
# Dla wildcard *.verris.pl użyj: ops/scripts/verris-node-wildcard-tls.sh (DNS-01 + OVH).
set -Eeuo pipefail

HOST="${1:-}"
RENEW=0
for arg in "$@"; do
  case "$arg" in
    --renew) RENEW=1 ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --*) ;;
    *) [ -z "$HOST" ] && HOST="$arg" ;;
  esac
done

LOG_TAG="[verris-node-http01-tls]"
log() { echo "$LOG_TAG $*"; }
die() { log "FAIL: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Uruchom jako root"
[ -n "$HOST" ] || die "Podaj hostname, np. node-pl-01.verris.pl"

DA="/usr/local/directadmin"
WEBROOT="/var/www/html"
CERT_NAME="verris-node-$(echo "$HOST" | tr '.' '-')"

if ! command -v certbot >/dev/null 2>&1; then
  log "Instalacja certbot..."
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y epel-release certbot 2>/dev/null || dnf install -y certbot
  elif command -v yum >/dev/null 2>&1; then
    yum install -y epel-release certbot 2>/dev/null || yum install -y certbot
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y certbot
  else
    die "Nie rozpoznano menedżera pakietów — zainstaluj certbot ręcznie"
  fi
fi

mkdir -p "$WEBROOT/.well-known/acme-challenge"
chmod 755 "$WEBROOT" "$WEBROOT/.well-known" "$WEBROOT/.well-known/acme-challenge"

resolved=$(getent ahostsv4 "$HOST" | awk '{print $1; exit}')
local_ip=$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || curl -fsS --max-time 5 icanhazip.com 2>/dev/null || true)
if [ -n "$resolved" ] && [ -n "$local_ip" ] && [ "$resolved" != "$local_ip" ]; then
  log "WARN: DNS $HOST → $resolved, publiczne IP serwera → $local_ip (sprawdź rekord A)"
fi

if [ "$RENEW" = "1" ] || certbot certificates 2>/dev/null | grep -q "$CERT_NAME"; then
  log "Odświeżanie certyfikatu..."
  certbot renew --cert-name "$CERT_NAME" --quiet || certbot renew --quiet
else
  log "Wydawanie certu dla $HOST (HTTP-01)..."
  certbot certonly \
    --non-interactive --agree-tos \
    --email "${CERTBOT_EMAIL:-admin@verris.pl}" \
    --webroot -w "$WEBROOT" \
    --cert-name "$CERT_NAME" \
    -d "$HOST"
fi

CERT_DIR="/etc/letsencrypt/live/${CERT_NAME}"
[ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ] || die "Brak plików w $CERT_DIR"

[ -d "$DA/conf" ] || die "DirectAdmin nie znaleziony w $DA"

cp "${CERT_DIR}/fullchain.pem" "$DA/conf/cacert.pem"
cp "${CERT_DIR}/privkey.pem" "$DA/conf/cakey.pem"
cp "${CERT_DIR}/fullchain.pem" "$DA/conf/carootcert.pem"
chmod 600 "$DA/conf/cakey.pem"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart directadmin 2>/dev/null || systemctl restart da 2>/dev/null || true
fi
"$DA/directadmin" r 2>/dev/null || service directadmin restart 2>/dev/null || true

log "OK — cert zainstalowany w DirectAdmin dla $HOST"
log "Test: curl -vI https://${HOST}:2222/ 2>&1 | grep -E 'subject:|issuer:'"
