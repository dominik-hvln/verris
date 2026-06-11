#!/usr/bin/env bash
# Instaluje pakiet Verris Security (IOC drop, watch timer, auditd) na hoście.
#
#   sudo bash ops/scripts/security-install-verris-security.sh --role control-plane
#   sudo bash ops/scripts/security-install-verris-security.sh --role node
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROLE=""
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

while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      echo "Required: --role control-plane|node"
      exit 0
      ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "Run as root"
[ -n "$ROLE" ] || die "--role is required"

install -d /etc/verris/security
run "install -m 0644 '$REPO_ROOT/ops/etc/verris/security/ioc-ips.txt' /etc/verris/security/ioc-ips.txt"
run "install -m 0644 '$REPO_ROOT/ops/etc/verris/security/egress-allow-hostnames.txt' /etc/verris/security/egress-allow-hostnames.txt"

if command -v apt-get >/dev/null 2>&1; then
  # Bez iptables-persistent — apt często usuwa ufw; egress CP jest w security-control-plane-egress.sh.
  run "DEBIAN_FRONTEND=noninteractive apt-get install -y ipset auditd dnsutils ufw"
fi

ensure_control_plane_ufw_ingress() {
  command -v ufw >/dev/null 2>&1 || return 0
  run "ufw default allow routed || true"
  run "ufw allow 22/tcp comment 'verris-ssh' || true"
  run "ufw allow 80/tcp comment 'verris-http' || true"
  run "ufw allow 443/tcp comment 'verris-https' || true"
  if ! ufw status 2>/dev/null | grep -q 'Status: active'; then
    run "ufw --force enable"
  fi
}

# auditd — minimal rules
AUDIT_RULES="/etc/audit/rules.d/verris-security.rules"
run "cat > '$AUDIT_RULES' <<'EOF'
# Verris — zmiany cron/systemd i exec z /tmp
-w /etc/cron.d -p wa -k verris_cron
-w /var/spool/cron -p wa -k verris_cron
-w /etc/systemd/system -p wa -k verris_systemd
-w /etc/verris -p wa -k verris_config
EOF"
if command -v augenrules >/dev/null 2>&1; then
  run "augenrules --load"
  run "systemctl enable --now auditd"
fi

mkdir -p /var/log/verris-security
TEXTFILE_DIR="/var/lib/verris-node-exporter-textfile"
run "mkdir -p '$TEXTFILE_DIR'"

# systemd timer
run "install -m 0644 '$REPO_ROOT/ops/systemd/verris-security-watch.service' /etc/systemd/system/verris-security-watch.service"
run "install -m 0644 '$REPO_ROOT/ops/systemd/verris-security-watch.timer' /etc/systemd/system/verris-security-watch.timer"
run "install -m 0644 '$REPO_ROOT/ops/systemd/verris-security-weekly.service' /etc/systemd/system/verris-security-weekly.service"
run "install -m 0644 '$REPO_ROOT/ops/systemd/verris-security-weekly.timer' /etc/systemd/system/verris-security-weekly.timer"
run "sed -i 's|@REPO_ROOT@|$REPO_ROOT|g' /etc/systemd/system/verris-security-watch.service"
run "sed -i 's|@REPO_ROOT@|$REPO_ROOT|g' /etc/systemd/system/verris-security-weekly.service"
run "systemctl daemon-reload"
run "systemctl enable --now verris-security-watch.timer"
run "systemctl enable --now verris-security-weekly.timer"

if [ "$ROLE" = "control-plane" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    run "bash '$REPO_ROOT/ops/scripts/security-control-plane-egress.sh' --dry-run"
  else
    ensure_control_plane_ufw_ingress
    run "bash '$REPO_ROOT/ops/scripts/security-control-plane-egress.sh'"
    if [ -x "$REPO_ROOT/ops/scripts/security-sync-cp-egress-hosts.sh" ]; then
      run "bash '$REPO_ROOT/ops/scripts/security-sync-cp-egress-hosts.sh' || true"
      MERGED_ALLOW="/etc/verris/security/egress-allow-hostnames.merged.txt"
      if [ -f "$MERGED_ALLOW" ]; then
        run "ALLOW_HOSTS='$MERGED_ALLOW' bash '$REPO_ROOT/ops/scripts/security-control-plane-egress.sh' --strict || true"
      fi
    fi
    # UFW deny out to IOC (backup layer)
    if [ -f /etc/verris/security/ioc-ips.txt ] && command -v ufw >/dev/null 2>&1; then
      while IFS= read -r line || [ -n "$line" ]; do
        line="${line%%#*}"
        line="$(echo "$line" | tr -d '[:space:]')"
        [ -z "$line" ] && continue
        [[ "$line" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
        run "ufw deny out to $line comment 'verris-ioc' || true"
      done </etc/verris/security/ioc-ips.txt
    fi
  fi
else
  log "Node: apply ops/scripts/security-egress-lockdown.sh --role node --apply separately (strict nft egress)"
fi

log "Verris security stack installed (role=${ROLE})"
