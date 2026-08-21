#!/usr/bin/env bash
# Verris — wildcard TLS *.verris.pl (control-plane) → deploy na wszystkie ACTIVE węzły.
#
# Uruchamiaj na control-plane (204.168.174.138) jako root.
#
# Jednorazowy bootstrap:
#   bash ops/scripts/verris-node-wildcard-tls-bootstrap.sh
#
# Ręcznie:
#   bash ops/scripts/verris-node-wildcard-tls.sh              # issue/renew + deploy all
#   bash ops/scripts/verris-node-wildcard-tls.sh --deploy-only
#   bash ops/scripts/verris-node-wildcard-tls.sh --node=node-pl-02.verris.pl
#
# Cron (bootstrap instaluje): poniedziałek 04:00
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_NAME="verris-wildcard"
CERT_DIR="/etc/letsencrypt/live/${CERT_NAME}"
OVH_INI="/root/.secrets/ovh-dns.ini"
DEPLOY_HOOK="/etc/letsencrypt/renewal-hooks/deploy/verris-nodes-da.sh"
LOG_TAG="[verris-node-tls]"
DEFAULT_SSH_KEY="/root/.ssh/verris_node_deploy"

DNS_ONLY=0
DEPLOY_ONLY=0
FILTER_HOST=""

for arg in "$@"; do
  case "$arg" in
    --dns-only) DNS_ONLY=1 ;;
    --deploy-only) DEPLOY_ONLY=1 ;;
    --node=*) FILTER_HOST="${arg#*=}" ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

log() { echo "$LOG_TAG $*"; }
die() { log "FAIL: $*" >&2; exit 1; }

require_root() { [ "$(id -u)" = "0" ] || die "Uruchom jako root"; }

ssh_key_path() {
  local key="${VERRIS_SSH_KEY:-$DEFAULT_SSH_KEY}"
  [ -f "$key" ] || die "Brak klucza SSH $key — uruchom verris-node-wildcard-tls-bootstrap.sh"
  echo "$key"
}

ensure_ovh_ini() {
  if [ -f "$OVH_INI" ]; then
    chmod 600 "$OVH_INI"
    grep -q 'dns_ovh_endpoint' "$OVH_INI" || echo 'dns_ovh_endpoint = ovh-eu' >> "$OVH_INI"
    return 0
  fi
  if [ -z "${OVH_APP_KEY:-}" ] || [ -z "${OVH_APP_SECRET:-}" ] || [ -z "${OVH_CONSUMER_KEY:-}" ]; then
    die "Brak $OVH_INI — uruchom bootstrap lub ustaw OVH_APP_KEY/SECRET/CONSUMER_KEY"
  fi
  mkdir -p "$(dirname "$OVH_INI")"
  cat > "$OVH_INI" <<EOF
dns_ovh_application_key = ${OVH_APP_KEY}
dns_ovh_application_secret = ${OVH_APP_SECRET}
dns_ovh_consumer_key = ${OVH_CONSUMER_KEY}
dns_ovh_endpoint = ovh-eu
EOF
  chmod 600 "$OVH_INI"
  log "Utworzono $OVH_INI"
}

ensure_certbot() {
  if command -v certbot >/dev/null 2>&1 && certbot plugins 2>/dev/null | grep -qi dns-ovh; then
    return 0
  fi
  die "Zainstaluj certbot + python3-certbot-dns-ovh (bootstrap.sh)"
}

issue_or_renew_cert() {
  ensure_certbot
  ensure_ovh_ini
  if [ -d "$CERT_DIR" ] && certbot certificates 2>/dev/null | grep -q "$CERT_NAME"; then
    log "Odświeżanie certyfikatu (certbot renew)..."
    certbot renew --cert-name "$CERT_NAME" --dns-ovh --dns-ovh-credentials "$OVH_INI" --quiet || true
  else
    log "Wydawanie wildcard *.verris.pl (DNS-01 OVH)..."
    certbot certonly \
      --non-interactive --agree-tos \
      --email "${CERTBOT_EMAIL:-admin@verris.pl}" \
      --dns-ovh --dns-ovh-credentials "$OVH_INI" \
      --dns-ovh-propagation-seconds 120 \
      --cert-name "$CERT_NAME" \
      -d '*.verris.pl' -d 'verris.pl'
  fi
  [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ] || die "Brak plików cert w $CERT_DIR"
  log "OK cert: $CERT_DIR"
}

list_active_nodes() {
  local pg_container=""
  pg_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'verris-postgres-1|postgres-1' | head -1 || true)
  if [ -n "$pg_container" ]; then
    docker exec "$pg_container" psql -U verris -d verris_db -t -A -F $'\t' -c \
      "SELECT COALESCE(hostname,''), \"ipAddress\", id FROM \"Server\" WHERE status='ACTIVE' AND \"ipAddress\" IS NOT NULL AND hostname IS NOT NULL;"
  elif [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -t -A -F $'\t' -c \
      "SELECT COALESCE(hostname,''), \"ipAddress\", id FROM \"Server\" WHERE status='ACTIVE' AND \"ipAddress\" IS NOT NULL AND hostname IS NOT NULL;"
  else
    die "Brak postgres — uruchom na control-plane z dockerem"
  fi
}

print_dns_checklist() {
  local nodes
  nodes=$(list_active_nodes)
  while IFS=$'\t' read -r hostname ip _; do
    [ -n "$hostname" ] || continue
    [[ "$hostname" == *verris.pl ]] || continue
    if [ -n "$FILTER_HOST" ] && [ "$hostname" != "$FILTER_HOST" ]; then continue; fi
    local sub="${hostname%.verris.pl}"
    local resolved
    resolved=$(dig +short "$hostname" A 2>/dev/null | head -1 || true)
    if [ "$resolved" = "$ip" ]; then
      log "DNS OK: ${hostname} → ${ip}"
    else
      log "WARN DNS: ${hostname} — oczekiwane A=${ip}, dig=${resolved:-brak} (dodaj w OVH: ${sub} → ${ip})"
    fi
  done <<< "$nodes"
}

deploy_cert_to_node() {
  local ip="$1" hostname="$2"
  local key
  key=$(ssh_key_path)
  local ssh_opts=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -i "$key")

  log "Deploy TLS → ${hostname} (${ip})"
  ssh "${ssh_opts[@]}" "root@${ip}" "mkdir -p /root/verris-tls"
  scp "${ssh_opts[@]}" "${CERT_DIR}/fullchain.pem" "root@${ip}:/root/verris-tls/fullchain.pem"
  scp "${ssh_opts[@]}" "${CERT_DIR}/privkey.pem" "root@${ip}:/root/verris-tls/privkey.pem"
  ssh "${ssh_opts[@]}" "root@${ip}" bash -s <<'REMOTE'
set -euo pipefail
FC="/root/verris-tls/fullchain.pem"
PK="/root/verris-tls/privkey.pem"
DA="/usr/local/directadmin"
[ -f "$FC" ] && [ -f "$PK" ] || { echo "brak cert"; exit 1; }
cp "$FC" "$DA/conf/cacert.pem"
cp "$PK" "$DA/conf/cakey.pem"
cp "$FC" "$DA/conf/carootcert.pem"
chmod 600 "$DA/conf/cakey.pem"
systemctl restart directadmin 2>/dev/null || systemctl restart da 2>/dev/null || true
/usr/local/directadmin/directadmin r 2>/dev/null || service directadmin restart 2>/dev/null || true
# Usuń lokalny certbot na węźle — źródłem prawdy jest control-plane
systemctl disable --now certbot-renew.timer 2>/dev/null || true
echo "DirectAdmin wildcard cert updated (managed by control-plane)"
REMOTE
  log "OK ${hostname}"
}

deploy_all_nodes() {
  local nodes failed=0 count=0
  nodes=$(list_active_nodes)
  if [ -z "$nodes" ]; then
    log "WARN: brak ACTIVE węzłów w DB"
    return 0
  fi
  while IFS=$'\t' read -r hostname ip _id; do
    [ -n "$ip" ] || continue
    [[ "$hostname" == *verris.pl ]] || { log "SKIP $hostname (hostname musi być *.verris.pl)"; continue; }
    if [ -n "$FILTER_HOST" ] && [ "$hostname" != "$FILTER_HOST" ]; then continue; fi
    count=$((count + 1))
    deploy_cert_to_node "$ip" "$hostname" || failed=$((failed + 1))
  done <<< "$nodes"
  [ "$count" -gt 0 ] || log "WARN: żaden węzeł nie pasuje do filtra"
  [ "$failed" -eq 0 ] || die "$failed węzłów nie udało się zaktualizować"
}

install_renew_hook() {
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > "$DEPLOY_HOOK" <<HOOK
#!/usr/bin/env bash
# Po odnowieniu wildcard — push na wszystkie węzły compute.
set -euo pipefail
RENEWED_LINEAGE="\${RENEWED_LINEAGE:-}"
[[ "\${RENEWED_LINEAGE:-}" == *verris-wildcard* ]] || exit 0
exec bash ${SCRIPT_DIR}/verris-node-wildcard-tls.sh --deploy-only
HOOK
  chmod +x "$DEPLOY_HOOK"
  log "Hook renew: $DEPLOY_HOOK"
}

main() {
  require_root
  log "Start wildcard TLS (control-plane → węzły)"
  if [ "$DEPLOY_ONLY" != "1" ]; then
    issue_or_renew_cert
    install_renew_hook
    print_dns_checklist
  fi
  if [ "$DNS_ONLY" != "1" ]; then
    [ -f "${CERT_DIR}/fullchain.pem" ] || die "Brak certu — uruchom bez --deploy-only"
    deploy_all_nodes
  fi
  log "Gotowe. Używaj https://node-pl-XX.verris.pl:2222 (nie surowego IP)."
}

main "$@"
