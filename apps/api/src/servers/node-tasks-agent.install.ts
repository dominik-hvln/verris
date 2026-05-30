/**
 * Bash fragments installed on compute nodes for pull-based operator tasks
 * (hosting profile from admin panel).
 */

export function renderVerrisTasksScript(): string {
  return `#!/usr/bin/env bash
# Verris node task worker — polls control-plane for operator jobs.
set -euo pipefail
CONFIG_FILE="/etc/verris.conf"
LOCK="/var/run/verris-tasks.lock"
LOG="/var/log/verris-tasks.log"
PROFILE_BIN="/usr/local/bin/verris-hosting-profile.sh"

[ -r "$CONFIG_FILE" ] || { echo "[verris-tasks] Missing $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "\${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "\${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "\${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

exec 9>"$LOCK"
flock -n 9 || exit 0

auth_headers=(-H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN")

LEASE_JSON=$(curl -fsS --max-time 15 "\${auth_headers[@]}" "$VERRIS_API_URL/agent/tasks/lease" 2>/dev/null || true)
if [ -z "$LEASE_JSON" ] || [ "$LEASE_JSON" = "null" ]; then
  exit 0
fi

TASK_ID=$(printf '%s' "$LEASE_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or "")' 2>/dev/null || true)
KIND=$(printf '%s' "$LEASE_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("kind") or "")' 2>/dev/null || true)
if [ -z "$TASK_ID" ]; then
  exit 0
fi

echo "[verris-tasks] Running task $TASK_ID ($KIND) at $(date -u +%FT%TZ)" >> "$LOG"

run_hosting_profile() {
  local skip_build dry_run flags tmp out rc
  skip_build=$(printf '%s' "$LEASE_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("1" if d.get("payload",{}).get("skipBuild", True) else "0")' 2>/dev/null || echo 1)
  dry_run=$(printf '%s' "$LEASE_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("1" if d.get("payload",{}).get("dryRun") else "0")' 2>/dev/null || echo 0)
  flags="-y"
  [ "$skip_build" = "1" ] && flags="$flags --skip-build"
  [ "$dry_run" = "1" ] && flags="$flags --dry-run"

  curl -fsS "\${auth_headers[@]}" "$VERRIS_API_URL/agent/tasks/hosting-profile/script" -o "$PROFILE_BIN"
  chmod 755 "$PROFILE_BIN"

  tmp=$(mktemp)
  set +e
  bash "$PROFILE_BIN" $flags > "$tmp" 2>&1
  rc=$?
  set -e
  out=$(tail -c 100000 "$tmp" 2>/dev/null || true)
  rm -f "$tmp"

  if [ "$rc" -eq 0 ]; then
    curl -fsS --max-time 30 -X POST "\${auth_headers[@]}" \\
      -H "Content-Type: application/json" \\
      -d "$(python3 -c 'import json,sys; print(json.dumps({"outputLog": sys.stdin.read()}))' <<< "$out")" \\
      "$VERRIS_API_URL/agent/tasks/$TASK_ID/complete" >/dev/null
    echo "[verris-tasks] Task $TASK_ID completed" >> "$LOG"
  else
    err=$(printf '%s' "$out" | tail -n 5 | tr '\\n' ' ' | head -c 500)
    curl -fsS --max-time 30 -X POST "\${auth_headers[@]}" \\
      -H "Content-Type: application/json" \\
      -d "$(python3 -c 'import json,sys; err,log=sys.argv[1],sys.stdin.read(); print(json.dumps({"error": err, "outputLog": log}))' "$err" <<< "$out")" \\
      "$VERRIS_API_URL/agent/tasks/$TASK_ID/fail" >/dev/null || true
    echo "[verris-tasks] Task $TASK_ID failed (rc=$rc)" >> "$LOG"
    exit "$rc"
  fi
}

case "$KIND" in
  HOSTING_PROFILE) run_hosting_profile ;;
  *)
    curl -fsS --max-time 15 -X POST "\${auth_headers[@]}" \\
      -H "Content-Type: application/json" \\
      -d '{"error":"unknown task kind"}' \\
      "$VERRIS_API_URL/agent/tasks/$TASK_ID/fail" >/dev/null || true
    echo "[verris-tasks] Unknown kind: $KIND" >> "$LOG"
    exit 1
    ;;
esac
`;
}

/** One-shot installer for nodes that completed bootstrap before the tasks agent existed. */
export function renderNodeTasksAgentInstallScript(): string {
  const tasksScript = renderVerrisTasksScript();
  return `#!/usr/bin/env bash
# Instaluje agenta zadań Verris (verris-tasks) — wymaga wcześniejszego bootstrapu (/etc/verris.conf).
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Uruchom jako root." >&2; exit 1; }
[ -r /etc/verris.conf ] || { echo "Brak /etc/verris.conf — najpierw bootstrap Verris." >&2; exit 1; }

cat > /usr/local/bin/verris-tasks.sh <<'__VERRIS_TASKS_SCRIPT__'
${tasksScript.replace(/^#!.*\n/, '')}__VERRIS_TASKS_SCRIPT__
chmod 755 /usr/local/bin/verris-tasks.sh

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat > /etc/systemd/system/verris-tasks.service <<'UNIT'
[Unit]
Description=Verris node task worker
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/verris-tasks.sh
TimeoutStartSec=7200
StandardOutput=append:/var/log/verris-tasks.log
StandardError=append:/var/log/verris-tasks.log
UNIT

  cat > /etc/systemd/system/verris-tasks.timer <<'TIMER'
[Unit]
Description=Poll Verris node tasks every minute

[Timer]
OnBootSec=60s
OnUnitActiveSec=60s
AccuracySec=10s
Unit=verris-tasks.service

[Install]
WantedBy=timers.target
TIMER

  systemctl daemon-reload
  systemctl enable --now verris-tasks.timer
  echo "[verris] Enabled verris-tasks.timer"
else
  cat > /etc/cron.d/verris-tasks <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root flock -n /var/run/verris-tasks.lock /usr/local/bin/verris-tasks.sh >> /var/log/verris-tasks.log 2>&1
CRON
  echo "[verris] Installed /etc/cron.d/verris-tasks"
fi

echo "[verris] Agent zadań zainstalowany. Profil hostingowy można uruchomić z panelu admin."
`;
}

export function renderBootstrapNodeTasksInstallFragment(): string {
  const installer = renderNodeTasksAgentInstallScript();
  return installer.replace(/^#!.*\n/, '');
}
