#!/usr/bin/env bash
# Lekki audyt hosta (tylko odczyt + raport). Nie zmienia firewall ani usług hostingowych.
set -euo pipefail

LOG_DIR="${LOG_DIR:-/var/log/verris-security}"
OUT="$LOG_DIR/weekly-audit-$(date -u +%Y%m%d).log"
mkdir -p "$LOG_DIR"

{
  echo "=== Verris weekly security audit $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo

  echo "## Listening (public)"
  ss -H -ltn 2>/dev/null | head -80 || true
  echo

  echo "## Failed SSH (24h)"
  journalctl -u ssh -u sshd --since "7 days ago" 2>/dev/null | grep -i "Failed password\|Invalid user" | tail -30 || true
  echo

  echo "## fail2ban"
  fail2ban-client status 2>/dev/null || echo "fail2ban not running"
  echo

  echo "## Unattended upgrades"
  grep -h . /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null | tail -15 || true
  echo

  echo "## IOC iptables chain"
  iptables -L VERRIS_IOC_DROP -n -v 2>/dev/null || echo "no VERRIS_IOC_DROP"
  echo

  if command -v rkhunter >/dev/null 2>&1; then
    echo "## rkhunter (quick)"
    rkhunter --check --sk --report-warnings-only 2>/dev/null | tail -40 || true
  else
    echo "## rkhunter: not installed (optional: apt install rkhunter)"
  fi

  echo
  echo "=== end ==="
} >"$OUT" 2>&1

echo "Weekly audit written to $OUT"
