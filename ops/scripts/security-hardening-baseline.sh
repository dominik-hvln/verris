#!/usr/bin/env bash
set -euo pipefail

# Verris security baseline hardening for Linux hosts.
# Safe-by-default: applies host hardening and ingress firewall, without strict egress lockdown.
#
# Usage examples:
#   sudo bash ops/scripts/security-hardening-baseline.sh --role control-plane
#   sudo bash ops/scripts/security-hardening-baseline.sh --role node --ssh-port 22
#   sudo bash ops/scripts/security-hardening-baseline.sh --role node --dry-run

ROLE=""
SSH_PORT="22"
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
security-hardening-baseline.sh

Required:
  --role control-plane|node

Optional:
  --ssh-port <port>    SSH port to allow in firewall (default: 22)
  --dry-run            Print actions only
  -h, --help           Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:-}"; shift 2 ;;
    --ssh-port) SSH_PORT="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "Run as root"
[ -n "$ROLE" ] || die "--role is required"
case "$ROLE" in
  control-plane|node) ;;
  *) die "--role must be control-plane or node" ;;
esac

if ! [[ "$SSH_PORT" =~ ^[0-9]+$ ]]; then
  die "--ssh-port must be numeric"
fi

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    run "apt-get update"
    run "DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban unattended-upgrades apt-listchanges"
  elif command -v dnf >/dev/null 2>&1; then
    run "dnf install -y fail2ban firewalld dnf-automatic"
  else
    die "Unsupported package manager (expected apt-get or dnf)"
  fi
}

harden_sysctl() {
  local conf="/etc/sysctl.d/99-verris-security.conf"
  run "cat > '$conf' <<'EOF'
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1
net.ipv4.tcp_syncookies=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_source_route=0
net.ipv4.conf.default.accept_source_route=0
net.ipv6.conf.all.accept_redirects=0
net.ipv6.conf.default.accept_redirects=0
kernel.kptr_restrict=2
kernel.dmesg_restrict=1
EOF"
  run "sysctl --system"
}

harden_ssh() {
  local conf="/etc/ssh/sshd_config.d/99-verris-hardening.conf"
  run "mkdir -p /etc/ssh/sshd_config.d"
  run "cat > '$conf' <<EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 4
LoginGraceTime 30
EOF"
  run "sshd -t"
  if command -v systemctl >/dev/null 2>&1; then
    run "systemctl restart ssh || systemctl restart sshd"
  fi
}

configure_fail2ban() {
  run "mkdir -p /etc/fail2ban/jail.d"
  run "cat > /etc/fail2ban/jail.d/verris.local <<EOF
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ${SSH_PORT}
EOF"
  if command -v systemctl >/dev/null 2>&1; then
    run "systemctl enable --now fail2ban"
  fi
}

configure_auto_updates() {
  if command -v apt-get >/dev/null 2>&1; then
    run "cat > /etc/apt/apt.conf.d/52unattended-upgrades-verris <<'EOF'
Unattended-Upgrade::Automatic-Reboot \"false\";
EOF"
    run "systemctl enable --now unattended-upgrades || true"
  elif command -v dnf >/dev/null 2>&1; then
    run "sed -i 's/^apply_updates = .*/apply_updates = yes/' /etc/dnf/automatic.conf || true"
    run "systemctl enable --now dnf-automatic.timer"
  fi
}

configure_firewall_ingress() {
  local control_plane_ip=""
  if [ "$ROLE" = "node" ]; then
    control_plane_ip="${CONTROL_PLANE_IP:-}"
    if [ -z "$control_plane_ip" ] && [ -r /etc/verris.conf ]; then
      # shellcheck disable=SC1091
      source /etc/verris.conf || true
      if [ -n "${VERRIS_API_URL:-}" ]; then
        local api_host
        api_host="$(echo "$VERRIS_API_URL" | sed -E 's#^https?://([^/:]+).*$#\1#')"
        control_plane_ip="$(getent ahostsv4 "$api_host" 2>/dev/null | awk 'NR==1{print $1}')"
      fi
    fi
  fi

  if command -v ufw >/dev/null 2>&1; then
    run "ufw --force reset"
    run "ufw default deny incoming"
    run "ufw default allow outgoing"
    if [ "$ROLE" = "control-plane" ]; then
      # Control-plane uses Docker bridge networking (build/runtime); routed traffic
      # must stay allowed or container DNS/egress breaks with UFW default deny routed.
      run "ufw default allow routed"
    else
      run "ufw default deny routed"
    fi
    run "ufw allow ${SSH_PORT}/tcp"
    run "ufw allow 80/tcp"
    run "ufw allow 443/tcp"
    if [ "$ROLE" = "node" ]; then
      run "ufw allow 2222/tcp"
      run "ufw allow 21/tcp"
      run "ufw allow 25/tcp"
      run "ufw allow 587/tcp"
      run "ufw allow 993/tcp"
      if [ -n "$control_plane_ip" ]; then
        # Remote MySQL stays private by default; allow only control-plane.
        run "ufw allow proto tcp from ${control_plane_ip} to any port 3306"
      fi
    fi
    run "ufw --force enable"
    run "ufw status verbose"
  elif command -v firewall-cmd >/dev/null 2>&1; then
    run "systemctl enable --now firewalld"
    run "firewall-cmd --set-default-zone=public"
    run "firewall-cmd --permanent --add-port=${SSH_PORT}/tcp"
    run "firewall-cmd --permanent --add-service=http"
    run "firewall-cmd --permanent --add-service=https"
    if [ "$ROLE" = "node" ]; then
      run "firewall-cmd --permanent --add-port=2222/tcp"
      run "firewall-cmd --permanent --add-service=ftp"
      run "firewall-cmd --permanent --add-port=25/tcp"
      run "firewall-cmd --permanent --add-port=587/tcp"
      run "firewall-cmd --permanent --add-port=993/tcp"
      if [ -n "$control_plane_ip" ]; then
        # Remote MySQL stays private by default; allow only control-plane.
        run \"firewall-cmd --permanent --add-rich-rule='rule family=\\\"ipv4\\\" source address=\\\"${control_plane_ip}\\\" port port=\\\"3306\\\" protocol=\\\"tcp\\\" accept'\"
      fi
    fi
    run "firewall-cmd --reload"
    run "firewall-cmd --list-all"
  else
    die "No supported firewall tool found (ufw/firewalld)"
  fi
}

write_summary() {
  cat <<EOF

Baseline hardening finished.
Role: ${ROLE}
SSH port: ${SSH_PORT}
Dry-run: ${DRY_RUN}

Next step (required):
  Apply strict egress policy with:
  ops/scripts/security-egress-lockdown.sh
EOF
}

log "Starting baseline hardening (role=${ROLE}, ssh_port=${SSH_PORT}, dry_run=${DRY_RUN})"
install_packages
harden_sysctl
harden_ssh
configure_fail2ban
configure_auto_updates
configure_firewall_ingress
write_summary
