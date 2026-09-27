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
# 67/547 — odnowienie dzierżawy DHCP (unicast przez zwykłe gniazdo UDP). Hetzner Cloud przydziela
# główny IPv4 przez DHCP (docs.hetzner.com/cloud/servers/static-configuration) — bez tego po wygaśnięciu
# dzierżawy węzeł traci IPv4.
COMMON_ALLOW_UDP="{ 53, 67, 123, 547 }"

if [ "$ROLE" = "control-plane" ]; then
  EXTRA_TCP="{ 25, 465, 587, 993, 995, 2222, 3306, 5432, 6379, 9000, 9001 }"
else
  # DirectAdmin / hosting: SMTP, SMTPS, FTP, IMAP — nie blokuje ruchu klientów (inbound)
  # ani normalnej poczty wychodzącej; blokuje tylko losowy egress poza allowlistą.
  EXTRA_TCP="{ 21, 25, 465, 587, 993, 995, 2222, 3306 }"
fi

# Idempotencja: ponowne uruchomienie nie dokleja reguł (utwórz → usuń → zdefiniuj od nowa).
cat >"$NFT_CONF" <<EOF
table inet verris_egress
delete table inet verris_egress
table inet verris_egress {
  chain output {
    type filter hook output priority 0; policy drop;

    # explicit IOC deny (Hetzner/Spamhaus incident) — PRZED akceptacjami portów, inaczej 80/443/25 przechodziły
    ip daddr 216.218.185.162 drop

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

    # PB-31 — procesy roota: kopie off-site (rclone → Storage Box, port 23) i worker migracji
    # (verris-migration-worker, root), który łączy się z DOWOLNYM hostem klienta: SSH/SFTP na
    # niestandardowych portach (np. 65002, 18765), FTP pasywne (porty danych > 1024 — conntrack nie
    # oznacza ich jako related bez helpera, a przy FTPS helper nie widzi PASV), IMAP 143/STARTTLS.
    # Konta klientów (inne UID: PHP, cron, SSH) dalej tylko porty z list powyżej.
    meta skuid 0 meta l4proto tcp accept
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

nft -f "$NFT_CONF"
# Własna jednostka zamiast nftables.service: firewalld.service ma Conflicts=nftables.service (RHBZ#1785494),
# więc `enable --now nftables` zatrzymywał firewalld i zdejmował ingress z security-hardening-baseline.sh,
# a ExecStop/reload nftables.service robi `nft flush ruleset` (kasuje też reguły firewalld/CSF).
# Ta jednostka ładuje i zdejmuje wyłącznie tabelę inet verris_egress.
# Bez --now: zatrzymanie nftables.service = `nft flush ruleset`. Wcześniejsza wersja włączała go
# i przez Conflicts= zatrzymywała firewalld — przywracamy firewalld (start zatrzyma nftables.service).
systemctl disable nftables >/dev/null 2>&1 || true
if systemctl is-enabled --quiet firewalld 2>/dev/null && ! systemctl is-active --quiet firewalld; then
  systemctl start firewalld
fi
cat >/etc/systemd/system/verris-node-egress.service <<UNIT
[Unit]
Description=Verris node egress lockdown (nftables table inet verris_egress)
After=firewalld.service csf.service network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/nft -f ${NFT_CONF}
ExecStop=/usr/sbin/nft delete table inet verris_egress

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable verris-node-egress.service
systemctl restart verris-node-egress.service
nft list table inet verris_egress

log "Egress lockdown applied."
