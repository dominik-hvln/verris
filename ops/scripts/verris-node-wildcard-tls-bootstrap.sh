#!/usr/bin/env bash
# Jednorazowy bootstrap wildcard TLS na control-plane.
#
# Wymaga (jako root na CP):
#   /root/.secrets/ovh-dns.ini  LUB  env OVH_APP_KEY + OVH_APP_SECRET + OVH_CONSUMER_KEY
#   /root/.ssh/verris_node_deploy  (klucz prywatny → root@węzły compute)
#
#   bash ops/scripts/verris-node-wildcard-tls-bootstrap.sh
#   bash ops/scripts/verris-node-wildcard-tls-bootstrap.sh --skip-run   # tylko pakiety + cron
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_RUN=0
LOG_TAG="[verris-node-tls-bootstrap]"

for arg in "$@"; do
  case "$arg" in
    --skip-run) SKIP_RUN=1 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

log() { echo "$LOG_TAG $*"; }
die() { log "FAIL: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Uruchom jako root na control-plane"

log "Instalacja certbot + dns-ovh..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y certbot python3-certbot-dns-ovh openssh-client dnsutils
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y certbot python3-certbot-dns-ovh openssh-clients bind-utils
else
  die "Nieobsługiwany OS — zainstaluj certbot i python3-certbot-dns-ovh ręcznie"
fi

mkdir -p /root/.ssh /root/.secrets
chmod 700 /root/.ssh

if [ ! -f /root/.ssh/verris_node_deploy ]; then
  log "WARN: brak /root/.ssh/verris_node_deploy"
  log "  Skopiuj klucz deploy (ten sam pubkey co na węzłach):"
  log "  scp -i ~/.ssh/verris_cursor_deploy ~/.ssh/verris_cursor_deploy root@CP:/root/.ssh/verris_node_deploy"
  log "  chmod 600 /root/.ssh/verris_node_deploy"
  die "Dodaj klucz SSH przed kontynuacją"
fi
chmod 600 /root/.ssh/verris_node_deploy

if [ ! -f /root/.secrets/ovh-dns.ini ]; then
  if [ -n "${OVH_APP_KEY:-}" ] && [ -n "${OVH_APP_SECRET:-}" ] && [ -n "${OVH_CONSUMER_KEY:-}" ]; then
    cat > /root/.secrets/ovh-dns.ini <<EOF
dns_ovh_application_key = ${OVH_APP_KEY}
dns_ovh_application_secret = ${OVH_APP_SECRET}
dns_ovh_consumer_key = ${OVH_CONSUMER_KEY}
dns_ovh_endpoint = ovh-eu
EOF
    chmod 600 /root/.secrets/ovh-dns.ini
    log "Utworzono /root/.secrets/ovh-dns.ini z env"
  else
    die "Brak /root/.secrets/ovh-dns.ini — skopiuj z węzła lub ustaw OVH_APP_*"
  fi
fi

# Cron: poniedziałek 04:00 — renew + deploy (hook)
CRON_FILE="/etc/cron.d/verris-node-wildcard-tls"
cat > "$CRON_FILE" <<CRON
# Verris — wildcard *.verris.pl → węzły compute (DirectAdmin :2222)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 4 * * 1 root ${SCRIPT_DIR}/verris-node-wildcard-tls.sh >> /var/log/verris-node-tls.log 2>&1
CRON
chmod 644 "$CRON_FILE"
log "Cron: $CRON_FILE"

# Certbot daily renew (hook deployuje na węzły po faktycznym renew)
systemctl enable --now certbot.timer 2>/dev/null || true

if [ "$SKIP_RUN" = "1" ]; then
  log "Bootstrap OK (--skip-run). Uruchom: bash ${SCRIPT_DIR}/verris-node-wildcard-tls.sh"
  exit 0
fi

log "Pierwsze wydanie + deploy na węzły..."
bash "${SCRIPT_DIR}/verris-node-wildcard-tls.sh"
log "Bootstrap zakończony."
