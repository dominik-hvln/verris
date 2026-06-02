#!/usr/bin/env bash
set -euo pipefail

# Strict outbound policy (nftables) for Verris hosts.
# Deny-by-default egress with explicit allowlist.
#
# WARNING: Can cut host connectivity if allowlist is incomplete.
# Always run with --dry-run first and from an out-of-band console.
#
# Usage:
#   sudo bash ops/scripts/security-egress-lockdown.sh --role control-plane --dry-run
#   sudo bash ops/scripts/security-egress-lockdown.sh --role control-plane --apply
#   sudo bash ops/scripts/security-egress-lockdown.sh --role node --apply

ROLE=""
APPLY=0
DRY_RUN=0

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
security-egress-lockdown.sh

Required:
  --role control-plane|node

Mode:
  --dry-run      render policy file only
  --apply        apply nftables config and persist

Notes:
  - run from direct console / rescue path
  - verify service-specific outbound needs before apply
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
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
if [ "$APPLY" -eq 1 ] && [ "$DRY_RUN" -eq 1 ]; then
  die "Use either --apply or --dry-run"
fi
if [ "$APPLY" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  DRY_RUN=1
fi

command -v nft >/dev/null 2>&1 || die "nft command not found"

NFT_CONF="/etc/nftables.d/verris-egress.nft"
mkdir -p /etc/nftables.d

COMMON_ALLOW_TCP="{ 53, 80, 443 }"
COMMON_ALLOW_UDP="{ 53, 123 }"

if [ "$ROLE" = "control-plane" ]; then
  EXTRA_TCP="{ 25, 465, 587, 993, 995, 2222, 3306, 5432, 6379, 9000, 9001 }"
else
  EXTRA_TCP="{ 2222, 3306 }"
fi

cat >"$NFT_CONF" <<EOF
table inet verris_egress {
  chain output {
    type filter hook output priority 0; policy drop;

    # loopback and already-established traffic
    oifname "lo" accept
    ct state established,related accept

    # ICMP for troubleshooting/PMTU
    ip protocol icmp accept
    ip6 nexthdr icmpv6 accept

    # baseline outbound
    tcp dport ${COMMON_ALLOW_TCP} accept
    udp dport ${COMMON_ALLOW_UDP} accept

    # role-specific outbound
    tcp dport ${EXTRA_TCP} accept

    # explicit IOC deny (Hetzner/Spamhaus incident)
    ip daddr 216.218.185.162 drop
  }
}
EOF

log "Rendered ${NFT_CONF} for role=${ROLE}"

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry-run mode: no firewall changes applied."
  exit 0
fi

if [ "$ROLE" = "control-plane" ]; then
  cat <<'EOF'
ERROR: control-plane egress lock via nftables is disabled.
Reason: this can flush/override Docker NAT rules and break API/container connectivity.
Use UFW ingress hardening on control-plane and apply this nftables script only to node hosts.
EOF
  exit 2
fi

if [ ! -f /etc/nftables.conf ]; then
  cat >/etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
include "/etc/nftables.d/*.nft"
EOF
elif ! grep -q 'include "/etc/nftables.d/\*.nft"' /etc/nftables.conf; then
  cp /etc/nftables.conf "/etc/nftables.conf.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cat >/etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
include "/etc/nftables.d/*.nft"
EOF
fi

nft -f /etc/nftables.conf
systemctl enable --now nftables
nft list ruleset

log "Egress lockdown applied."
