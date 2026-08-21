#!/usr/bin/env bash
set -euo pipefail

# Collects host-level forensic triage artifacts for security incidents.
# Usage:
#   sudo bash ops/scripts/security-incident-collect.sh [output_dir]

OUT_DIR="${1:-/root/verris-incident-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

run() {
  local name="$1"
  shift
  {
    echo "### $name"
    echo "### UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
    "$@"
    echo
  } >"$OUT_DIR/$name.txt" 2>&1 || true
}

run "date-utc" date -u
run "hostnamectl" hostnamectl
run "who-a" who -a
run "last-a" last -a
run "ss-plantu" ss -plantu
run "lsof-nPi" lsof -nPi
run "ps-auxfww" ps auxfww
run "systemd-running" systemctl list-units --type=service --state=running
run "cron-user" crontab -l
run "cron-system" ls -la /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly
run "iptables-save" iptables-save
run "nft-ruleset" nft list ruleset
run "journal-security-window" journalctl --since "24 hours ago"

echo "Artifacts collected in: $OUT_DIR"
