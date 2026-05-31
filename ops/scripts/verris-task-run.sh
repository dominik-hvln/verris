#!/usr/bin/env bash
# Verris — runner pojedynczego zadania (systemd verris-task@instance).
set -euo pipefail

INSTANCE="${1:?instance id (uuid bez myślników)}"
CONFIG_FILE="/etc/verris.conf"
AGENT_LOG="/var/log/verris-tasks.log"
LOG_DIR="/var/log/verris-tasks"
STATE_DIR="/var/run/verris-tasks"
JOB_JSON="$STATE_DIR/${INSTANCE}.json"
PROFILE_BIN="/usr/local/bin/verris-hosting-profile.sh"

REPORTED=0
TASK_ID=""
TASK_LOG=""
HB_PID=""

log() { echo "[verris-task-run] $*" | tee -a "$AGENT_LOG"; }

[ -r "$CONFIG_FILE" ] || { log "Missing $CONFIG_FILE"; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

[ -f "$JOB_JSON" ] || { log "Missing job file $JOB_JSON"; exit 1; }

TASK_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$JOB_JSON")
SKIP_BUILD=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("1" if d.get("payload",{}).get("skipBuild", True) else "0")' "$JOB_JSON")
DRY_RUN=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("1" if d.get("payload",{}).get("dryRun") else "0")' "$JOB_JSON")

mkdir -p "$LOG_DIR" "$STATE_DIR"
TASK_LOG="$LOG_DIR/${TASK_ID}.log"
echo $$ > "$STATE_DIR/${INSTANCE}.pid"

auth_headers=(-H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN")

send_progress() {
  local tail_log="${1:-}"
  [ -n "$TASK_ID" ] || return 0
  curl -fsS --max-time 20 -X POST "${auth_headers[@]}" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"outputLog": sys.stdin.read()}))' <<< "$tail_log")" \
    "$VERRIS_API_URL/agent/tasks/$TASK_ID/progress" >/dev/null 2>&1 || true
}

report_fail() {
  local err="$1"
  local out="${2:-}"
  REPORTED=1
  log "Task $TASK_ID FAILED: $err"
  curl -fsS --max-time 30 -X POST "${auth_headers[@]}" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; err,log=sys.argv[1],sys.argv[2]; print(json.dumps({"error": err, "outputLog": log or None}))' "$err" "$out")" \
    "$VERRIS_API_URL/agent/tasks/$TASK_ID/fail" >/dev/null 2>&1 || true
}

report_complete() {
  local out="$1"
  REPORTED=1
  if curl -fsS --max-time 30 -X POST "${auth_headers[@]}" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"outputLog": sys.stdin.read()}))' <<< "$out")" \
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
  rm -f "$STATE_DIR/${INSTANCE}.pid" "$JOB_JSON"
  if [ "$REPORTED" = "0" ] && [ -n "$TASK_ID" ]; then
    local tail_out
    tail_out=$(tail -c 100000 "$TASK_LOG" 2>/dev/null || true)
    report_fail "Proces zakończył się bez raportu do API (rc=$rc). Sprawdź $TASK_LOG i journalctl -u verris-task@${INSTANCE}" "$tail_out"
  fi
}
trap on_exit EXIT

log "Starting task $TASK_ID (instance=$INSTANCE) → $TASK_LOG"

flags="-y"
[ "$SKIP_BUILD" = "1" ] && flags="$flags --skip-build"
[ "$DRY_RUN" = "1" ] && flags="$flags --dry-run"

[ -x "$PROFILE_BIN" ] || { report_fail "Brak $PROFILE_BIN"; exit 1; }

{
  echo "=== Verris task $TASK_ID ==="
  echo "Start: $(date -u +%FT%TZ)"
  echo "Command: $PROFILE_BIN $flags"
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
bash "$PROFILE_BIN" $flags 2>&1 | tee -a "$TASK_LOG"
rc=${PIPESTATUS[0]}
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
  err=$(printf '%s' "$out" | tail -n 8 | tr '\n' ' ' | head -c 500)
  report_fail "$err" "$out"
  exit "$rc"
fi
