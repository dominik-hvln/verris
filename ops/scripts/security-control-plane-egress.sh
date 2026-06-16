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
CHAIN_ANTISCAN="VERRIS_ANTISCAN"
CHAIN_BOGON="VERRIS_EGRESS_BOGON"
STRICT=0
DRY_RUN=0
# Obniżone po incydencie Hetzner 2026-06-11 (wolny skan ~1/s, ~256 hostów).
# Control-plane gada z ~kilkunastoma API — 40 nowych poł./60s to i tak duży zapas.
ANTISCAN_HITCOUNT="${ANTISCAN_HITCOUNT:-40}"
ANTISCAN_WINDOW="${ANTISCAN_WINDOW:-60}"
# Druga warstwa: wolny skan rozłożony w czasie (np. 1/s przez 10 min).
ANTISCAN_SLOW_HITCOUNT="${ANTISCAN_SLOW_HITCOUNT:-300}"
ANTISCAN_SLOW_WINDOW="${ANTISCAN_SLOW_WINDOW:-900}"
# Adresy, do których control-plane NIE powinien inicjować ruchu WWW (bogony,
# sieci prywatne, link-local, multicast). Węzły mają publiczne IP, więc to nie
# blokuje DA:2222. Wyjątek: wewn. sieć Dockera (obsłużona przez ctstate/iface).
BOGON_DESTS="${BOGON_DESTS:-10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 192.0.2.0/24 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/3}"

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
  --strict     Ogranicza NOWE połączenia TCP/80 i TCP/443 do ipset z allow-hostnames
  --dry-run    Tylko podgląd

Domyślnie włączone (bez --strict): IOC drop, logowanie egress, anty-netscan
(rate-limit burst nowych TCP/80,443 → DROP; env ANTISCAN_HITCOUNT / ANTISCAN_WINDOW).
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
  run "iptables -A '$CHAIN_LOG' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m limit --limit 120/min --limit-burst 60 -j LOG --log-prefix 'VERRIS-EGRESS-WEB ' --log-level 4"
  run "iptables -A '$CHAIN_LOG' -j RETURN"
  log "Egress web logging enabled (kernel log, ports 80+443)"
}

apply_antiscan() {
  run "iptables -N '$CHAIN_ANTISCAN' 2>/dev/null || iptables -F '$CHAIN_ANTISCAN'"
  run "iptables -C OUTPUT -j '$CHAIN_ANTISCAN' 2>/dev/null || iptables -I OUTPUT 3 -j '$CHAIN_ANTISCAN'"
  run "iptables -A '$CHAIN_ANTISCAN' -m conntrack --ctstate established,related -j RETURN"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --set --name verris_eg_new --rsource"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_WINDOW' --hitcount '$ANTISCAN_HITCOUNT' --name verris_eg_new --rsource -j LOG --log-prefix 'VERRIS-ANTISCAN-DROP ' --log-level 4"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_WINDOW' --hitcount '$ANTISCAN_HITCOUNT' --name verris_eg_new --rsource -j DROP -m comment --comment 'verris-antiscan'"
  # Druga warstwa — wolny skan rozłożony w czasie (osobna lista `recent`).
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --set --name verris_eg_slow --rsource"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_SLOW_WINDOW' --hitcount '$ANTISCAN_SLOW_HITCOUNT' --name verris_eg_slow --rsource -j LOG --log-prefix 'VERRIS-ANTISCAN-SLOW ' --log-level 4"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_SLOW_WINDOW' --hitcount '$ANTISCAN_SLOW_HITCOUNT' --name verris_eg_slow --rsource -j DROP -m comment --comment 'verris-antiscan-slow'"
  run "iptables -A '$CHAIN_ANTISCAN' -j RETURN"
  log "Anti-netscan: >${ANTISCAN_HITCOUNT}/${ANTISCAN_WINDOW}s (burst) i >${ANTISCAN_SLOW_HITCOUNT}/${ANTISCAN_SLOW_WINDOW}s (wolny) → DROP"
}

# Drop NOWYCH połączeń WWW control-plane do sieci prywatnych/bogonów.
# `established,related` przepuszczamy (odpowiedzi), wewn. ruch Dockera idzie
# przez interfejsy docker0/br-* (RETURN przy ctstate ESTABLISHED i tak go nie
# rusza, bo to są połączenia inicjowane lokalnie do publicznych API).
apply_bogon_drop() {
  run "iptables -N '$CHAIN_BOGON' 2>/dev/null || iptables -F '$CHAIN_BOGON'"
  run "iptables -C OUTPUT -j '$CHAIN_BOGON' 2>/dev/null || iptables -I OUTPUT 1 -j '$CHAIN_BOGON'"
  run "iptables -A '$CHAIN_BOGON' -m conntrack --ctstate established,related -j RETURN"
  # Nie ruszaj ruchu wychodzącego przez mosty Dockera (kontener→kontener / NAT).
  run "iptables -A '$CHAIN_BOGON' -o docker0 -j RETURN"
  run "iptables -A '$CHAIN_BOGON' -o lo -j RETURN"
  for net in $BOGON_DESTS; do
    run "iptables -A '$CHAIN_BOGON' -p tcp -m multiport --dports 80,443 -d '$net' -m conntrack --ctstate NEW -j LOG --log-prefix 'VERRIS-BOGON-DROP ' --log-level 4"
    run "iptables -A '$CHAIN_BOGON' -p tcp -m multiport --dports 80,443 -d '$net' -m conntrack --ctstate NEW -j DROP -m comment --comment 'verris-bogon'"
  done
  run "iptables -A '$CHAIN_BOGON' -j RETURN"
  log "Bogon/private egress drop (TCP 80,443) zainstalowany"
}

apply_strict_allowlist() {
  command -v ipset >/dev/null 2>&1 || die "ipset required for --strict"
  local setname="verris_egress_https"
  run "ipset create '$setname' hash:net family inet hashsize 4096 maxelem 65536 -exist"
  run "ipset flush '$setname'"
  if [ ! -f "$ALLOW_HOSTS" ]; then
    die "Missing $ALLOW_HOSTS — populate before --strict"
  fi
  local added=0
  while IFS= read -r host || [ -n "$host" ]; do
    host="${host%%#*}"
    host="$(echo "$host" | tr -d '[:space:]')"
    [ -z "$host" ] && continue
    local resolved=0
    while read -r ip; do
      [ -z "$ip" ] && continue
      run "ipset add '$setname' '$ip' -exist"
      resolved=1
      added=$((added + 1))
    done < <(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | sort -u)
    if [ "$resolved" -eq 0 ]; then
      log "WARN: cannot resolve $host"
    else
      log "allow $host"
    fi
  done <"$ALLOW_HOSTS"
  [ "$added" -gt 0 ] || die "Allowlist empty — refusing --strict (would block all web egress)"
  local chain="VERRIS_EGRESS_STRICT"
  run "iptables -N '$chain' 2>/dev/null || iptables -F '$chain'"
  run "iptables -C OUTPUT -j '$chain' 2>/dev/null || iptables -I OUTPUT 4 -j '$chain'"
  run "iptables -A '$chain' -m conntrack --ctstate established,related -j RETURN"
  # Docker SNAT: ruch kontenerów ma to samo IP źródłowe co host — strict tylko dla procesów spoza docker.scope (cgroup v2).
  local strict_applied=0
  if iptables -N VERRIS_CGROUP_TEST 2>/dev/null; then
    if iptables -A VERRIS_CGROUP_TEST -m cgroup --path 'system.slice/docker-' -j RETURN 2>/dev/null; then
      iptables -F VERRIS_CGROUP_TEST 2>/dev/null || true
      iptables -X VERRIS_CGROUP_TEST 2>/dev/null || true
      run "iptables -A '$chain' -m cgroup --path 'system.slice/docker-' -j RETURN"
      run "iptables -A '$chain' -p tcp -m multiport --dports 80,443 -m set ! --match-set '$setname' dst -m conntrack --ctstate NEW -j DROP -m comment --comment 'verris-strict-egress-host'"
      strict_applied=1
      log "STRICT egress: host processes only (docker.scope exempt), ipset $setname"
    else
      iptables -F VERRIS_CGROUP_TEST 2>/dev/null || true
      iptables -X VERRIS_CGROUP_TEST 2>/dev/null || true
    fi
  fi
  if [ "$strict_applied" -eq 0 ]; then
    log "WARN: cgroup path match unavailable — skipping STRICT (anti-netscan still active). Run manual review before full strict."
  fi
  run "iptables -A '$chain' -j RETURN"
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
apply_bogon_drop
apply_egress_log
apply_antiscan
if [ "$STRICT" -eq 1 ]; then
  apply_strict_allowlist
fi
persist_rules

log "Control-plane egress hardening applied (strict=${STRICT}, dry_run=${DRY_RUN})"
