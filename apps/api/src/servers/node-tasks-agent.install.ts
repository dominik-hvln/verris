/**
 * Verris node task agent — LIVE install fragments (hosting profile from admin panel).
 *
 * Architecture:
 * - verris-tasks.timer → verris-tasks.sh (poll lease co ~1 min)
 * - verris-task@.service (systemd template) → verris-task-run.sh (profile + raport)
 * - Logi: /var/log/verris-tasks.log (agent) + /var/log/verris-tasks/<task-id>.log (profil)
 * - Heartbeat co 60 s → POST /agent/tasks/:id/progress (log na żywo w panelu)
 */

/**
 * Verris node task agent — LIVE install fragments (hosting profile from admin panel).
 *
 * Architecture:
 * - verris-tasks.timer → verris-tasks.sh (poll lease co ~1 min)
 * - verris-task@.service (systemd template) → verris-task-run.sh (profile + raport)
 * - Logi: /var/log/verris-tasks.log (agent) + /var/log/verris-tasks/<task-id>.log (profil)
 * - Heartbeat co 60 s → POST /agent/tasks/:id/progress (log na żywo w panelu)
 */

/** Bash: idempotentnie dodaje klucz deploy control-plane do authorized_keys roota. */
export function renderNodeDeploySshKeyInstallFunctions(): string {
  return `
install_verris_deploy_ssh_key() {
  local key="\${1:-}"
  if [ -z "$key" ] && [ -n "\${VERRIS_DEPLOY_PUBKEY_B64:-}" ]; then
    key=$(printf '%s' "$VERRIS_DEPLOY_PUBKEY_B64" | base64 -d 2>/dev/null || true)
  fi
  if [ -z "$key" ] && [ "\${VERRIS_FETCH_DEPLOY_KEY:-0}" = "1" ] && [ -n "\${VERRIS_API_URL:-}" ]; then
    local json pubkey
    json=$(curl -fsS --max-time 15 \\
      -H "X-Server-Id: \${VERRIS_SERVER_ID}" \\
      -H "X-Server-Token: \${VERRIS_IDENTITY_TOKEN}" \\
      "\${VERRIS_API_URL}/agent/tasks/deploy-ssh-pubkey" 2>/dev/null || true)
    if [ -n "$json" ]; then
      pubkey=$(printf '%s' "$json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("publicKey") or "")' 2>/dev/null || true)
      key="$pubkey"
    fi
  fi
  [ -n "$key" ] || return 0
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  if grep -qF "$key" /root/.ssh/authorized_keys 2>/dev/null; then
    echo "[verris] Klucz deploy control-plane już w authorized_keys"
  else
    echo "$key" >> /root/.ssh/authorized_keys
    echo "[verris] Dodano klucz deploy control-plane do authorized_keys (TLS/ops)"
  fi
}`;
}

export function renderNodeDeploySshKeyBootstrapCall(deployPubKeyB64: string | null): string {
  if (!deployPubKeyB64) {
    return `
# (Brak VERRIS_NODE_DEPLOY_SSH_PUBKEY na control-plane — pomiń auto-SSH)
`;
  }
  return `
# Control-plane → węzeł (wildcard TLS, ops) — klucz deploy w authorized_keys
VERRIS_DEPLOY_PUBKEY_B64="${deployPubKeyB64}"
${renderNodeDeploySshKeyInstallFunctions()}
install_verris_deploy_ssh_key
`;
}

/** Background runner — invoked as: verris-task-run.sh <instance> (instance = uuid bez myślników). */
export function renderVerrisTaskRunScript(): string {
  return `#!/usr/bin/env bash
# Verris — runner pojedynczego zadania (systemd verris-task@instance).
set -euo pipefail

INSTANCE="\${1:?instance id (uuid bez myślników)}"
CONFIG_FILE="/etc/verris.conf"
AGENT_LOG="/var/log/verris-tasks.log"
LOG_DIR="/var/log/verris-tasks"
STATE_DIR="/var/run/verris-tasks"
JOB_JSON="$STATE_DIR/\${INSTANCE}.json"
PROFILE_BIN="/usr/local/bin/verris-hosting-profile.sh"

REPORTED=0
TASK_ID=""
TASK_LOG=""
HB_PID=""

log() { echo "[verris-task-run] $*" | tee -a "$AGENT_LOG"; }

[ -r "$CONFIG_FILE" ] || { log "Missing $CONFIG_FILE"; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "\${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "\${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "\${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

[ -f "$JOB_JSON" ] || { log "Missing job file $JOB_JSON"; exit 1; }

TASK_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$JOB_JSON")
TASK_KIND=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("kind") or "HOSTING_PROFILE")' "$JOB_JSON")
SKIP_BUILD=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("1" if d.get("payload",{}).get("skipBuild", True) else "0")' "$JOB_JSON")
DRY_RUN=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("1" if d.get("payload",{}).get("dryRun") else "0")' "$JOB_JSON")

mkdir -p "$LOG_DIR" "$STATE_DIR"
TASK_LOG="$LOG_DIR/\${TASK_ID}.log"
echo $$ > "$STATE_DIR/\${INSTANCE}.pid"

auth_headers=(-H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN")

send_progress() {
  local tail_log="\${1:-}"
  [ -n "$TASK_ID" ] || return 0
  curl -fsS --max-time 20 -X POST "\${auth_headers[@]}" \\
    -H "Content-Type: application/json" \\
    -d "$(python3 -c 'import json,sys; print(json.dumps({"outputLog": sys.stdin.read()}))' <<< "$tail_log")" \\
    "$VERRIS_API_URL/agent/tasks/$TASK_ID/progress" >/dev/null 2>&1 || true
}

report_fail() {
  local err="$1"
  local out="\${2:-}"
  REPORTED=1
  log "Task $TASK_ID FAILED: $err"
  curl -fsS --max-time 30 -X POST "\${auth_headers[@]}" \\
    -H "Content-Type: application/json" \\
    -d "$(python3 -c 'import json,sys; err,log=sys.argv[1],sys.argv[2]; print(json.dumps({"error": err, "outputLog": log or None}))' "$err" "$out")" \\
    "$VERRIS_API_URL/agent/tasks/$TASK_ID/fail" >/dev/null 2>&1 || true
}

report_complete() {
  local out="$1"
  REPORTED=1
  if curl -fsS --max-time 30 -X POST "\${auth_headers[@]}" \\
    -H "Content-Type: application/json" \\
    -d "$(python3 -c 'import json,sys; print(json.dumps({"outputLog": sys.stdin.read()}))' <<< "$out")" \\
    "$VERRIS_API_URL/agent/tasks/$TASK_ID/complete" >/dev/null 2>>"$AGENT_LOG"; then
    log "Task $TASK_ID COMPLETED"
  else
    report_fail "Profil wykonany lokalnie, ale API nie przyjęło potwierdzenia." "$out"
    exit 1
  fi
}

on_exit() {
  local rc=$?
  [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null || true
  rm -f "$STATE_DIR/\${INSTANCE}.pid" "$JOB_JSON"
  if [ "$REPORTED" = "0" ] && [ -n "$TASK_ID" ]; then
    local tail_out
    tail_out=$(tail -c 100000 "$TASK_LOG" 2>/dev/null || true)
    report_fail "Proces zakończył się bez raportu do API (rc=$rc). Sprawdź $TASK_LOG i journalctl -u verris-task@\${INSTANCE}" "$tail_out"
  fi
}
trap on_exit EXIT

log "Starting task $TASK_ID (kind=$TASK_KIND instance=$INSTANCE) → $TASK_LOG"

# Build the command for this task kind. HOSTING_PROFILE runs the cached profile
# binary; per-account tasks (WP_INSTALL, WAF_APPLY) fetch their script from the
# API and export the payload as <PREFIX>_* env vars.
RUN_BIN=""
declare -a RUN_ENV=()

# fetch_task_script <url-path> <dest-bin>
fetch_task_script() {
  if ! curl -fsS --max-time 30 "\${auth_headers[@]}" "$VERRIS_API_URL\${1}" -o "\${2}" 2>>"$AGENT_LOG"; then
    report_fail "Nie udało się pobrać skryptu \${1} z API."
    exit 1
  fi
  chmod 755 "\${2}"
}

# payload_env <prefix> <mapping-python-dict>
payload_env() {
  local prefix="\${1}" mapping="\${2}"
  while IFS='=' read -r k v; do
    [ -n "$k" ] && RUN_ENV+=("\${prefix}_\${k}=$v")
  done < <(python3 -c "
import json, sys
p = json.load(open(sys.argv[1])).get('payload', {})
m = \${mapping}
for src, dst in m.items():
    if p.get(src) is not None:
        print(dst + '=' + str(p[src]))
" "$JOB_JSON")
}

if [ "$TASK_KIND" = "WP_INSTALL" ]; then
  RUN_BIN="/usr/local/bin/verris-wp-install.sh"
  fetch_task_script "/agent/tasks/wp-install/script" "$RUN_BIN"
  payload_env "WP" "{'daUser':'DA_USER','domain':'DOMAIN','dbName':'DB_NAME','dbUser':'DB_USER','dbPass':'DB_PASS','siteTitle':'SITE_TITLE','adminUser':'ADMIN_USER','adminPass':'ADMIN_PASS','adminEmail':'ADMIN_EMAIL','locale':'LOCALE'}"
elif [ "$TASK_KIND" = "WAF_APPLY" ]; then
  RUN_BIN="/usr/local/bin/verris-waf-apply.sh"
  fetch_task_script "/agent/tasks/waf-apply/script" "$RUN_BIN"
  payload_env "WAF" "{'daUser':'DA_USER','domain':'DOMAIN','mode':'MODE'}"
elif [ "$TASK_KIND" = "STAGING_SYNC" ]; then
  RUN_BIN="/usr/local/bin/verris-staging-sync.sh"
  fetch_task_script "/agent/tasks/staging-sync/script" "$RUN_BIN"
  payload_env "STG" "{'daUser':'DA_USER','domain':'DOMAIN','sub':'SUB','direction':'DIRECTION','dbName':'DB_NAME','dbUser':'DB_USER','dbPass':'DB_PASS'}"
elif [ "$TASK_KIND" = "DB_UPGRADE" ]; then
  RUN_BIN="/usr/local/bin/verris-db-upgrade.sh"
  fetch_task_script "/agent/tasks/db-upgrade/script" "$RUN_BIN"
  payload_env "DB" "{'version':'TARGET_VERSION'}"
else
  flags="-y"
  [ "$SKIP_BUILD" = "1" ] && flags="$flags --skip-build"
  [ "$DRY_RUN" = "1" ] && flags="$flags --dry-run"
  RUN_BIN="$PROFILE_BIN"
  [ -x "$RUN_BIN" ] || { report_fail "Brak $RUN_BIN"; exit 1; }
fi

{
  echo "=== Verris task $TASK_ID (kind=$TASK_KIND) ==="
  echo "Start: $(date -u +%FT%TZ)"
  echo "Command: $RUN_BIN \${flags:-}"
  echo "---"
} >> "$TASK_LOG"

send_progress "$(cat "$TASK_LOG" 2>/dev/null || true)"

(
  while true; do
    sleep 60
    send_progress "$(tail -c 100000 "$TASK_LOG" 2>/dev/null || true)"
  done
) &
HB_PID=$!

set +e
if [ "\${#RUN_ENV[@]}" -gt 0 ]; then
  env "\${RUN_ENV[@]}" bash "$RUN_BIN" 2>&1 | tee -a "$TASK_LOG"
else
  bash "$RUN_BIN" \${flags:-} 2>&1 | tee -a "$TASK_LOG"
fi
rc=\${PIPESTATUS[0]}
set -e

kill "$HB_PID" 2>/dev/null || true
wait "$HB_PID" 2>/dev/null || true
HB_PID=""

out=$(tail -c 100000 "$TASK_LOG" 2>/dev/null || true)
echo "---" >> "$TASK_LOG"
echo "End: $(date -u +%FT%TZ) rc=$rc" >> "$TASK_LOG"

if [ "$rc" -eq 0 ]; then
  report_complete "$out"
else
  err=$(printf '%s' "$out" | tail -n 8 | tr '\\n' ' ' | head -c 500)
  report_fail "$err" "$out"
  exit "$rc"
fi
`;
}

/** Polls control-plane and starts verris-task@instance.service. */
export function renderVerrisTasksScript(): string {
  return `#!/usr/bin/env bash
# Verris node task worker — poll lease, dispatch systemd unit.
set -euo pipefail

CONFIG_FILE="/etc/verris.conf"
LOCK="/var/run/verris-tasks.lock"
LOG="/var/log/verris-tasks.log"
PROFILE_BIN="/usr/local/bin/verris-hosting-profile.sh"
STATE_DIR="/var/run/verris-tasks"

[ -r "$CONFIG_FILE" ] || { echo "[verris-tasks] Missing $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "\${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "\${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "\${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

${renderNodeDeploySshKeyInstallFunctions()}
VERRIS_FETCH_DEPLOY_KEY=1
install_verris_deploy_ssh_key || true

exec 9>"$LOCK"
flock -n 9 || exit 0

auth_headers=(-H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN")

task_instance() { printf '%s' "$1" | tr -d '-'; }

task_is_running() {
  local tid="$1"
  local inst
  inst=$(task_instance "$tid")
  if [ -f "$STATE_DIR/\${inst}.pid" ]; then
    local pid
    pid=$(cat "$STATE_DIR/\${inst}.pid" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if command -v systemctl >/dev/null 2>&1; then
    local state
    state=$(systemctl show -p ActiveState --value "verris-task@\${inst}.service" 2>/dev/null || true)
    case "$state" in active|activating) return 0 ;; esac
  fi
  return 1
}

LEASE_JSON=$(curl -fsS --max-time 15 "\${auth_headers[@]}" "$VERRIS_API_URL/agent/tasks/lease" 2>/dev/null || true)
if [ -z "$LEASE_JSON" ] || [ "$LEASE_JSON" = "null" ]; then
  exit 0
fi

TASK_ID=$(printf '%s' "$LEASE_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or "")' 2>/dev/null || true)
KIND=$(printf '%s' "$LEASE_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("kind") or "")' 2>/dev/null || true)
if [ -z "$TASK_ID" ]; then
  exit 0
fi

if task_is_running "$TASK_ID"; then
  echo "[verris-tasks] Task $TASK_ID already running at $(date -u +%FT%TZ)" >> "$LOG"
  exit 0
fi

INSTANCE=$(task_instance "$TASK_ID")
echo "[verris-tasks] Dispatching $KIND task $TASK_ID (instance=$INSTANCE) at $(date -u +%FT%TZ)" >> "$LOG"

report_task_fail() {
  local err="$1"
  local detail="\${2:-}"
  echo "[verris-tasks] Task $TASK_ID failed: $err" >> "$LOG"
  curl -fsS --max-time 30 -X POST "\${auth_headers[@]}" \\
    -H "Content-Type: application/json" \\
    -d "$(python3 -c 'import json,sys; err,log=sys.argv[1],sys.argv[2]; print(json.dumps({"error": err, "outputLog": log or None}))' "$err" "$detail")" \\
    "$VERRIS_API_URL/agent/tasks/$TASK_ID/fail" >/dev/null 2>&1 || true
}

dispatch_hosting_profile() {
  if ! curl -fsS --max-time 60 "\${auth_headers[@]}" "$VERRIS_API_URL/agent/tasks/hosting-profile/script" -o "$PROFILE_BIN" 2>>"$LOG"; then
    report_task_fail "Nie udało się pobrać skryptu profilu z API."
    exit 1
  fi
  chmod 755 "$PROFILE_BIN"

  mkdir -p "$STATE_DIR"
  printf '%s' "$LEASE_JSON" > "$STATE_DIR/\${INSTANCE}.json"

  if command -v systemctl >/dev/null 2>&1 && systemctl cat verris-task@.service >/dev/null 2>&1; then
    if systemctl start "verris-task@\${INSTANCE}.service" 2>>"$LOG"; then
      echo "[verris-tasks] Started verris-task@\${INSTANCE}.service (log: /var/log/verris-tasks/\${TASK_ID}.log)" >> "$LOG"
      exit 0
    fi
    echo "[verris-tasks] systemctl start verris-task@\${INSTANCE} failed — fallback sync" >> "$LOG"
  fi

  if [ -x /usr/local/bin/verris-task-run.sh ]; then
    exec /usr/local/bin/verris-task-run.sh "$INSTANCE"
  fi
  report_task_fail "Brak verris-task@.service i /usr/local/bin/verris-task-run.sh — uruchom install agenta."
  exit 1
}

# A4 — WP_INSTALL i inne zadania per-konto: run-script sam pobiera właściwy
# skrypt (po kind), więc dispatch jest generyczny (zapis job JSON + start unit).
dispatch_generic() {
  mkdir -p "$STATE_DIR"
  printf '%s' "$LEASE_JSON" > "$STATE_DIR/\${INSTANCE}.json"
  if command -v systemctl >/dev/null 2>&1 && systemctl cat verris-task@.service >/dev/null 2>&1; then
    if systemctl start "verris-task@\${INSTANCE}.service" 2>>"$LOG"; then
      echo "[verris-tasks] Started verris-task@\${INSTANCE}.service ($KIND, log: /var/log/verris-tasks/\${TASK_ID}.log)" >> "$LOG"
      exit 0
    fi
  fi
  if [ -x /usr/local/bin/verris-task-run.sh ]; then
    exec /usr/local/bin/verris-task-run.sh "$INSTANCE"
  fi
  report_task_fail "Brak verris-task@.service i /usr/local/bin/verris-task-run.sh — uruchom install agenta."
  exit 1
}

case "$KIND" in
  HOSTING_PROFILE) dispatch_hosting_profile ;;
  WP_INSTALL|WAF_APPLY|STAGING_SYNC|DB_UPGRADE) dispatch_generic ;;
  *)
    report_task_fail "Unknown task kind: $KIND"
    exit 1
    ;;
esac
`;
}

export function renderProbesTasksHook(): string {
  return `
# Backup poll (główny: verris-tasks.timer)
if [ -x /usr/local/bin/verris-tasks.sh ]; then
  /usr/local/bin/verris-tasks.sh || true
fi`;
}

function renderInstallTaskRunScriptFile(): string {
  const runScript = renderVerrisTaskRunScript();
  return `TASK_RUN_PATH="/usr/local/bin/verris-task-run.sh"
cat > "$TASK_RUN_PATH" <<'__VERRIS_TASK_RUN_SCRIPT__'
${runScript}__VERRIS_TASK_RUN_SCRIPT__
chmod 755 "$TASK_RUN_PATH"
echo "[verris] Installed $TASK_RUN_PATH"`;
}

function renderInstallTasksScriptFile(): string {
  const tasksScript = renderVerrisTasksScript();
  return `${renderInstallTaskRunScriptFile()}
TASKS_PATH="/usr/local/bin/verris-tasks.sh"
cat > "$TASKS_PATH" <<'__VERRIS_TASKS_SCRIPT__'
${tasksScript}__VERRIS_TASKS_SCRIPT__
chmod 755 "$TASKS_PATH"
echo "[verris] Installed $TASKS_PATH"`;
}

function renderTaskSystemdTemplateInstall(): string {
  return `
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
  echo "[verris] Installed verris-task@.service + verris-tasks.timer"
else
  cat > /etc/cron.d/verris-tasks <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root flock -n /var/run/verris-tasks.lock /usr/local/bin/verris-tasks.sh >> /var/log/verris-tasks.log 2>&1
CRON
  echo "[verris] Installed /etc/cron.d/verris-tasks (brak systemd)"
fi`;
}

/** Installs the on-node LVE agent (verris-lve.sh) + 1-min systemd timer (cron fallback). */
function renderInstallLveAgentFragment(): string {
  return `
# --- Verris LVE agent (limity CloudLinux + telemetria) ---
# shellcheck disable=SC1090
source /etc/verris.conf
LVE_BIN="/usr/local/bin/verris-lve.sh"
if curl -fsS --max-time 30 -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \\
  "$VERRIS_API_URL/agent/tasks/lve/script" -o "$LVE_BIN" 2>/dev/null && [ -s "$LVE_BIN" ]; then
  chmod 755 "$LVE_BIN"
  echo "[verris] Installed $LVE_BIN"
else
  echo "[verris] WARN: nie pobrano verris-lve.sh z API (sprawdź token/URL)" >&2
fi

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat > /etc/systemd/system/verris-lve.service <<'UNIT'
[Unit]
Description=Verris LVE agent (reconcile limits + telemetry)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/bash /usr/local/bin/verris-lve.sh
TimeoutStartSec=120
StandardOutput=append:/var/log/verris-lve.log
StandardError=append:/var/log/verris-lve.log
UNIT

  cat > /etc/systemd/system/verris-lve.timer <<'TIMER'
[Unit]
Description=Run Verris LVE agent every minute

[Timer]
OnBootSec=120s
OnUnitActiveSec=1min
AccuracySec=5s
Persistent=true
Unit=verris-lve.service

[Install]
WantedBy=timers.target
TIMER

  systemctl daemon-reload
  systemctl enable verris-lve.timer
  systemctl restart verris-lve.timer
  echo "[verris] Installed verris-lve.timer (1 min)"
else
  cat > /etc/cron.d/verris-lve <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root flock -n /var/run/verris-lve.lock /usr/local/bin/verris-lve.sh >> /var/log/verris-lve.log 2>&1
CRON
  echo "[verris] Installed /etc/cron.d/verris-lve (brak systemd)"
fi`;
}

function renderInstallVerifyFragment(): string {
  return `
echo ""
echo "=== Weryfikacja agenta zadań Verris ==="
FAIL=0
for f in /usr/local/bin/verris-tasks.sh /usr/local/bin/verris-task-run.sh /usr/local/bin/verris-hosting-profile.sh; do
  if [ -x "$f" ] || [ -f "$f" ]; then
    echo "[OK] $f"
    if head -1 "$f" | grep -q '^#!/'; then
      echo "[OK]   shebang: $(head -1 "$f")"
    else
      echo "[FAIL] brak shebang w $f (systemd: Exec format error)"
      FAIL=1
    fi
    if bash -n "$f" 2>/dev/null; then
      echo "[OK]   bash -n"
    else
      echo "[FAIL] bash -n $f"
      FAIL=1
    fi
  else
    echo "[FAIL] brak $f"
    FAIL=1
  fi
done
if /usr/bin/bash /usr/local/bin/verris-tasks.sh 2>/dev/null; then
  echo "[OK] verris-tasks.sh wykonany (poll lease)"
else
  echo "[FAIL] verris-tasks.sh nie wykonuje się — sprawdź /etc/verris.conf"
  FAIL=1
fi
if systemctl is-active --quiet verris-tasks.timer 2>/dev/null; then
  echo "[OK] verris-tasks.timer active"
  systemctl list-timers verris-tasks.timer --no-pager 2>/dev/null | sed -n '1,3p' || true
else
  echo "[WARN] verris-tasks.timer nieaktywny — uruchom: systemctl enable --now verris-tasks.timer"
  FAIL=1
fi
if systemctl cat verris-task@.service >/dev/null 2>&1; then
  echo "[OK] verris-task@.service template"
else
  echo "[FAIL] brak verris-task@.service"
  FAIL=1
fi
# shellcheck disable=SC1090
source /etc/verris.conf
if curl -fsS --max-time 10 -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \\
  "$VERRIS_API_URL/agent/tasks/lease" >/dev/null 2>&1; then
  echo "[OK] API lease endpoint"
else
  echo "[WARN] lease endpoint — możliwy brak zadań QUEUED (normalne) lub problem z tokenem"
fi
if curl -fsS --max-time 10 -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \\
  "$VERRIS_API_URL/agent/tasks/hosting-profile/script" -o /dev/null; then
  echo "[OK] API hosting-profile script"
else
  echo "[FAIL] hosting-profile script endpoint"
  FAIL=1
fi
if [ -x /usr/local/bin/verris-lve.sh ]; then
  echo "[OK] /usr/local/bin/verris-lve.sh"
  if command -v lvectl >/dev/null 2>&1; then
    if /usr/bin/bash /usr/local/bin/verris-lve.sh 2>/dev/null; then
      echo "[OK] verris-lve.sh wykonany (reconcile + telemetria)"
    else
      echo "[WARN] verris-lve.sh zwrócił błąd — sprawdź /var/log/verris-lve.log"
    fi
    if systemctl is-active --quiet verris-lve.timer 2>/dev/null; then
      echo "[OK] verris-lve.timer active"
    else
      echo "[WARN] verris-lve.timer nieaktywny — systemctl enable --now verris-lve.timer"
    fi
  else
    echo "[INFO] lvectl brak — węzeł bez CloudLinux, agent LVE pominie limity"
  fi
else
  echo "[WARN] brak /usr/local/bin/verris-lve.sh (limity CloudLinux nie będą egzekwowane)"
fi
echo ""
echo "Logi agenta:    /var/log/verris-tasks.log"
echo "Logi profilu:   /var/log/verris-tasks/<task-uuid>.log"
echo "Status zadania: systemctl status verris-task@<instance>"
echo "               instance = UUID zadania bez myślników"
if [ "$FAIL" -eq 0 ]; then
  echo "[verris] Agent zadań LIVE-ready. Uruchom profil z panelu admin."
else
  echo "[verris] Weryfikacja wykryła problemy — popraw powyższe [FAIL/WARN] przed prod." >&2
  exit 1
fi`;
}

/** Bootstrap + legacy install: scripts, systemd units, weryfikacja. */
export function renderBootstrapNodeTasksInstallFragment(): string {
  return `${renderInstallTasksScriptFile()}
${renderTaskSystemdTemplateInstall()}
${renderInstallLveAgentFragment()}`;
}

/** Pełny skrypt instalacji agenta (panel admin → Pokaż skrypt instalacji). */
export function renderNodeTasksAgentInstallScript(): string {
  return `#!/usr/bin/env bash
# Verris — instalacja agenta zadań (LIVE). Wymaga /etc/verris.conf z bootstrapu.
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Uruchom jako root." >&2; exit 1; }
[ -r /etc/verris.conf ] || { echo "Brak /etc/verris.conf — najpierw bootstrap Verris." >&2; exit 1; }

echo "=== Verris node task agent install (agent-3) ==="

${renderInstallTasksScriptFile()}
${renderTaskSystemdTemplateInstall()}
${renderInstallLveAgentFragment()}

PROBES="/usr/local/bin/verris-probes.sh"
if [ -f "$PROBES" ] && ! grep -q 'verris-tasks.sh' "$PROBES"; then
  cat >> "$PROBES" <<'HOOK'

# Verris operator tasks — backup poll (główny: verris-tasks.timer)
if [ -x /usr/local/bin/verris-tasks.sh ]; then
  /usr/local/bin/verris-tasks.sh || true
fi
HOOK
  echo "[verris] Patched verris-probes.sh (backup poll)"
fi

${renderInstallVerifyFragment()}
`;
}
