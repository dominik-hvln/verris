#!/usr/bin/env bash
# Verris — instalacja agenta zadań (agent-3) na węźle compute.
# Wymaga: root, /etc/verris.conf (bootstrap Verris).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" = "0" ] || { echo "[FAIL] Uruchom jako root." >&2; exit 1; }
[ -r /etc/verris.conf ] || { echo "[FAIL] Brak /etc/verris.conf — najpierw bootstrap Verris." >&2; exit 1; }

echo "=== Verris node task agent install (agent-3) ==="

# PB-36 — pobrania z control-plane tylko z podpisem; klucz publiczny przywiózł bootstrap / instalacja z panelu.
# Klucz deploy SSH (z from="<control-plane>") instaluje sam verris-tasks.sh co minutę.
[ -r /etc/verris/script-signing.pub ] || { echo "[FAIL] Brak /etc/verris/script-signing.pub — uruchom instalację agenta z panelu (Pokaż skrypt instalacji)." >&2; exit 1; }

install_script() {
  local src="$1" dst="$2"
  if [ ! -f "$src" ]; then
    echo "[FAIL] Brak pliku źródłowego: $src" >&2
    exit 1
  fi
  install -m 755 "$src" "$dst"
  if ! head -1 "$dst" | grep -q '^#!/'; then
    echo "[FAIL] $dst nie ma shebang — popraw plik źródłowy" >&2
    exit 1
  fi
  bash -n "$dst"
  echo "[OK] $dst"
}

install_script "$SCRIPT_DIR/verris-fetch.sh" /usr/local/bin/verris-fetch
install_script "$SCRIPT_DIR/verris-task-run.sh" /usr/local/bin/verris-task-run.sh
install_script "$SCRIPT_DIR/verris-tasks.sh" /usr/local/bin/verris-tasks.sh

if [ -f "$SCRIPT_DIR/node-hosting-profile.sh" ]; then
  install_script "$SCRIPT_DIR/node-hosting-profile.sh" /usr/local/bin/verris-hosting-profile.sh
else
  echo "[WARN] Brak node-hosting-profile.sh obok installera — profil pobierze agent z API"
fi

mkdir -p /var/log/verris-tasks /var/run/verris-tasks
chmod 755 /var/log/verris-tasks /var/run/verris-tasks

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat > /etc/systemd/system/verris-task@.service <<'UNIT'
[Unit]
Description=Verris node task %i
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/bash /usr/local/bin/verris-task-run.sh %i
TimeoutStartSec=7200
StandardOutput=append:/var/log/verris-tasks.log
StandardError=append:/var/log/verris-tasks.log

[Install]
WantedBy=multi-user.target
UNIT

  cat > /etc/systemd/system/verris-tasks.service <<'UNIT'
[Unit]
Description=Verris node task poller
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/bash /usr/local/bin/verris-tasks.sh
TimeoutStartSec=120
StandardOutput=append:/var/log/verris-tasks.log
StandardError=append:/var/log/verris-tasks.log
UNIT

  cat > /etc/systemd/system/verris-tasks.timer <<'TIMER'
[Unit]
Description=Poll Verris node tasks every minute

[Timer]
OnBootSec=90s
OnUnitActiveSec=1min
AccuracySec=1s
Persistent=true
Unit=verris-tasks.service

[Install]
WantedBy=timers.target
TIMER

  systemctl daemon-reload
  systemctl enable verris-tasks.timer
  systemctl restart verris-tasks.timer
  echo "[OK] verris-task@.service + verris-tasks.timer"
else
  cat > /etc/cron.d/verris-tasks <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root flock -n /var/run/verris-tasks.lock /usr/bin/bash /usr/local/bin/verris-tasks.sh >> /var/log/verris-tasks.log 2>&1
CRON
  echo "[OK] /etc/cron.d/verris-tasks"
fi

PROBES="/usr/local/bin/verris-probes.sh"
if [ -f "$PROBES" ] && ! grep -q 'verris-tasks.sh' "$PROBES"; then
  cat >> "$PROBES" <<'HOOK'

# Verris operator tasks — backup poll (główny: verris-tasks.timer)
if [ -x /usr/local/bin/verris-tasks.sh ]; then
  /usr/local/bin/verris-tasks.sh || true
fi
HOOK
  echo "[OK] verris-probes.sh — backup poll"
fi

echo ""
echo "=== Weryfikacja agenta ==="
FAIL=0
# shellcheck disable=SC1090
source /etc/verris.conf

if /usr/bin/bash /usr/local/bin/verris-tasks.sh; then
  echo "[OK] poll lease"
else
  echo "[FAIL] verris-tasks.sh"
  FAIL=1
fi

if systemctl is-active --quiet verris-tasks.timer 2>/dev/null; then
  echo "[OK] verris-tasks.timer active"
else
  echo "[FAIL] verris-tasks.timer"
  FAIL=1
fi

if systemctl cat verris-task@.service >/dev/null 2>&1; then
  echo "[OK] verris-task@.service"
else
  echo "[FAIL] brak verris-task@.service"
  FAIL=1
fi

if verris-fetch /agent/tasks/hosting-profile/script /tmp/verris-profile-check 15 2>/dev/null && rm -f /tmp/verris-profile-check; then
  echo "[OK] API hosting-profile script (podpis control-plane poprawny)"
else
  echo "[WARN] API hosting-profile script niedostępne (deploy API?) — profil lokalny nadal działa"
fi

if [ "$FAIL" -eq 0 ]; then
  echo "[verris] Agent zadań LIVE-ready."
else
  echo "[verris] Weryfikacja agenta FAILED." >&2
  exit 1
fi
