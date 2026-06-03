#!/usr/bin/env bash
# Docker-safe egress hardening for Verris control-plane hosts.
# Nie czyści tabeli nat — tylko dopina łańcuch OUTPUT na początku.
#
#   sudo bash ops/scripts/security-control-plane-egress.sh
#   sudo bash ops/scripts/security-control-plane-egress.sh --strict   # ipset allowlist (ostrożnie)
#   sudo bash ops/scripts/security-control-plane-egress.sh --dry-run
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOC_FILE="${IOC_FILE:-/etc/verris/security/ioc-ips.txt}"
ALLOW_HOSTS="${ALLOW_HOSTS:-/etc/verris/security/egress-allow-hostnames.txt}"
CHAIN_IOC="VERRIS_IOC_DROP"
CHAIN_LOG="VERRIS_EGRESS_LOG"
STRICT=0
DRY_RUN=0

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "DRY-RUN: $*"
  else
    eval "$@"
  fi
}

usage() {
  cat <<'EOF'
security-control-plane-egress.sh

  Instaluje reguły iptables na hoście (bez flush Docker NAT).

Opcje:
  --strict     Dodatkowo ogranicza NOWE połączenia TCP/80 i TCP/443 do ipset z allow-hostnames
  --dry-run    Tylko podgląd
  -h, --help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --strict) STRICT=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "Run as root"
command -v iptables >/dev/null 2>&1 || die "iptables not found"

install -d /etc/verris/security
if [ ! -f "$IOC_FILE" ]; then
  install -m 0644 "$REPO_ROOT/ops/etc/verris/security/ioc-ips.txt" "$IOC_FILE"
fi

apply_ioc_drop() {
  run "iptables -N '$CHAIN_IOC' 2>/dev/null || iptables -F '$CHAIN_IOC'"
  run "iptables -C OUTPUT -j '$CHAIN_IOC' 2>/dev/null || iptables -I OUTPUT 1 -j '$CHAIN_IOC'"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="$(echo "$line" | tr -d '[:space:]')"
    [ -z "$line" ] && continue
    if ! [[ "$line" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      log "SKIP invalid IOC line: $line"
      continue
    fi
    run "iptables -C '$CHAIN_IOC' -d '$line' -j DROP 2>/dev/null || iptables -A '$CHAIN_IOC' -d '$line' -j DROP -m comment --comment 'verris-ioc'"
  done <"$IOC_FILE"
  log "IOC drop rules loaded from $IOC_FILE"
}

apply_egress_log() {
  run "iptables -N '$CHAIN_LOG' 2>/dev/null || iptables -F '$CHAIN_LOG'"
  run "iptables -C OUTPUT -j '$CHAIN_LOG' 2>/dev/null || iptables -I OUTPUT 2 -j '$CHAIN_LOG'"
  # Rate-limited log of new outbound HTTP (helps forensics, low volume)
  run "iptables -A '$CHAIN_LOG' -p tcp --dport 80 -m conntrack --ctstate NEW -m limit --limit 12/min --limit-burst 5 -j LOG --log-prefix 'VERRIS-EGRESS-HTTP ' --log-level 4"
  run "iptables -A '$CHAIN_LOG' -j RETURN"
  log "Egress HTTP logging enabled (kernel log)"
}

apply_strict_allowlist() {
  command -v ipset >/dev/null 2>&1 || die "ipset required for --strict"
  local setname="verris_egress_https"
  run "ipset create '$setname' hash:net family inet hashsize 4096 maxelem 65536 -exist"
  run "ipset flush '$setname'"
  if [ ! -f "$ALLOW_HOSTS" ]; then
    die "Missing $ALLOW_HOSTS — populate before --strict"
  fi
  while IFS= read -r host || [ -n "$host" ]; do
    host="${host%%#*}"
    host="$(echo "$host" | tr -d '[:space:]')"
    [ -z "$host" ] && continue
    local ip
    ip="$(getent ahostsv4 "$host" 2>/dev/null | awk 'NR==1{print $1}')"
    [ -z "$ip" ] && { log "WARN: cannot resolve $host"; continue; }
    run "ipset add '$setname' '$ip' -exist"
    log "allow $host -> $ip"
  done <"$ALLOW_HOSTS"
  local chain="VERRIS_EGRESS_STRICT"
  run "iptables -N '$chain' 2>/dev/null || iptables -F '$chain'"
  run "iptables -C OUTPUT -j '$chain' 2>/dev/null || iptables -I OUTPUT 3 -j '$chain'"
  run "iptables -A '$chain' -m conntrack --ctstate established,related -j RETURN"
  run "iptables -A '$chain' -p tcp -m multiport --dports 80,443 -m set ! --match-set '$setname' dst -m conntrack --ctstate NEW -j DROP -m comment --comment 'verris-strict-egress'"
  run "iptables -A '$chain' -j RETURN"
  log "STRICT egress: new TCP/80,443 only to ipset $setname"
}

persist_rules() {
  if command -v netfilter-persistent >/dev/null 2>&1; then
    run "netfilter-persistent save"
  elif [ -d /etc/iptables ]; then
    run "iptables-save > /etc/iptables/rules.v4"
  else
    log "WARN: install iptables-persistent / netfilter-persistent to survive reboot"
  fi
}

apply_ioc_drop
apply_egress_log
if [ "$STRICT" -eq 1 ]; then
  apply_strict_allowlist
fi
persist_rules

log "Control-plane egress hardening applied (strict=${STRICT}, dry_run=${DRY_RUN})"
