/**
 * Bash fragments for pull-based operator tasks (hosting profile from admin panel).
 *
 * New bootstraps: install verris-tasks.sh + verris-probes.sh calls it every minute.
 * Legacy nodes: ops/scripts/install-verris-tasks.sh (timer + script).
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

/** Appended to verris-probes.sh — one timer runs probes + task poll. */
export function renderProbesTasksHook(): string {
  return `
# Operator tasks (hosting profile from admin panel) — same schedule as probes.
if [ -x /usr/local/bin/verris-tasks.sh ]; then
  /usr/local/bin/verris-tasks.sh || true
fi`;
}

function renderInstallTasksScriptFile(): string {
  const tasksScript = renderVerrisTasksScript();
  return `TASKS_PATH="/usr/local/bin/verris-tasks.sh"
cat > "$TASKS_PATH" <<'__VERRIS_TASKS_SCRIPT__'
${tasksScript.replace(/^#!.*\n/, '')}__VERRIS_TASKS_SCRIPT__
chmod 755 "$TASKS_PATH"
echo "[verris] Installed node task worker at $TASKS_PATH"`;
}

/** Bootstrap: install task worker binary; verris-probes.timer invokes it each minute. */
export function renderBootstrapNodeTasksInstallFragment(): string {
  return renderInstallTasksScriptFile();
}

function renderTasksTimerInstall(): string {
  return `
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
  echo "[verris] Enabled verris-tasks.timer (legacy / standalone poll)"
else
  cat > /etc/cron.d/verris-tasks <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root flock -n /var/run/verris-tasks.lock /usr/local/bin/verris-tasks.sh >> /var/log/verris-tasks.log 2>&1
CRON
  echo "[verris] Installed /etc/cron.d/verris-tasks"
fi`;
}

/** Legacy nodes: script + dedicated timer (when verris-probes does not call verris-tasks yet). */
export function renderNodeTasksAgentInstallScript(): string {
  return `#!/usr/bin/env bash
# Instaluje agenta zadań Verris — wymaga bootstrapu (/etc/verris.conf).
# Użyj na węzłach z bootstrapem sprzed agent-2 lub gdy brak /usr/local/bin/verris-tasks.sh
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Uruchom jako root." >&2; exit 1; }
[ -r /etc/verris.conf ] || { echo "Brak /etc/verris.conf — najpierw bootstrap Verris." >&2; exit 1; }

${renderInstallTasksScriptFile()}
${renderTasksTimerInstall()}

# Patch verris-probes to call task worker (agent-2 behaviour) if not already present.
PROBES="/usr/local/bin/verris-probes.sh"
if [ -f "$PROBES" ] && ! grep -q 'verris-tasks.sh' "$PROBES"; then
  cat >> "$PROBES" <<'HOOK'

# Operator tasks (hosting profile) — added by install-verris-tasks.sh
if [ -x /usr/local/bin/verris-tasks.sh ]; then
  /usr/local/bin/verris-tasks.sh || true
fi
HOOK
  echo "[verris] Patched verris-probes.sh to poll tasks each run"
  systemctl disable --now verris-tasks.timer 2>/dev/null || true
  echo "[verris] Disabled standalone verris-tasks.timer (probes now invokes tasks)"
fi

echo "[verris] Agent zadań gotowy. Profil hostingowy uruchom z panelu admin."
`;
}
