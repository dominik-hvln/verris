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
TASK_KIND=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("kind") or "")' "$JOB_JSON")
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

log "Starting task $TASK_ID (kind=$TASK_KIND instance=$INSTANCE) → $TASK_LOG"

# Build the command for this task kind. HOSTING_PROFILE runs the cached profile
# binary; per-account tasks (WP_INSTALL, WAF_APPLY) fetch their script from the
# API and export the payload as <PREFIX>_* env vars.
RUN_BIN=""
declare -a RUN_ENV=()

# fetch_task_script <url-path> <dest-bin>
# PB-36 — skrypt musi mieć ważny podpis control-plane (verris-fetch), inaczej nie zostanie uruchomiony.
fetch_task_script() {
  local rc=0
  verris-fetch "${1}" "${2}" 60 2>>"$AGENT_LOG" || rc=$?
  if [ "$rc" -ne 0 ]; then
    [ "$rc" -eq 3 ] && report_fail "Skrypt ${1} odrzucony: nieprawidłowy podpis control-plane (PB-36)."
    [ "$rc" -eq 2 ] && report_fail "Brak klucza podpisu control-plane na węźle — uruchom ponownie instalację agenta z panelu."
    [ "$rc" -eq 3 ] || [ "$rc" -eq 2 ] || report_fail "Nie udało się pobrać skryptu ${1} z API (kod $rc)."
    exit 1
  fi
  chmod 755 "${2}"
}

# payload_env <prefix> <mapping-python-dict>
payload_env() {
  local prefix="${1}" mapping="${2}"
  while IFS='=' read -r k v; do
    [ -n "$k" ] && RUN_ENV+=("${prefix}_${k}=$v")
  done < <(python3 -c "
import json, sys
p = json.load(open(sys.argv[1])).get('payload', {})
m = ${mapping}
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
elif [ "$TASK_KIND" = "PHP_APPLY" ]; then
  RUN_BIN="/usr/local/bin/verris-php-apply.sh"
  fetch_task_script "/agent/tasks/php-apply/script" "$RUN_BIN"
  payload_env "PHP" "{'daUser':'DA_USER','domain':'DOMAIN','version':'VERSION','extEnable':'EXT_ENABLE','extDisable':'EXT_DISABLE'}"
elif [ "$TASK_KIND" = "APP_INSTALL" ]; then
  RUN_BIN="/usr/local/bin/verris-app-install.sh"
  fetch_task_script "/agent/tasks/app-install/script" "$RUN_BIN"
  payload_env "APP" "{'app':'APP','daUser':'DA_USER','domain':'DOMAIN','dbName':'DB_NAME','dbUser':'DB_USER','dbPass':'DB_PASS','adminUser':'ADMIN_USER','adminPass':'ADMIN_PASS','adminEmail':'ADMIN_EMAIL'}"
elif [ "$TASK_KIND" = "OFFSITE_RESTORE" ]; then
  RUN_BIN="/usr/local/bin/verris-account-restore.sh"
  fetch_task_script "/agent/tasks/offsite-restore/script" "$RUN_BIN"
  payload_env "OFR" "{'mode':'MODE','daUser':'USER','archive':'ARCHIVE','snapshot':'SNAPSHOT','sourcePrefix':'SOURCE_PREFIX','ip':'IP'}"
elif [ "$TASK_KIND" = "DB_UPGRADE" ]; then
  RUN_BIN="/usr/local/bin/verris-db-upgrade.sh"
  fetch_task_script "/agent/tasks/db-upgrade/script" "$RUN_BIN"
  payload_env "DB" "{'version':'TARGET_VERSION'}"
elif [ "$TASK_KIND" = "ONBOARD_LIVE" ]; then
  RUN_BIN="/usr/local/bin/verris-onboard-live.sh"
  fetch_task_script "/agent/tasks/onboard-live/script" "$RUN_BIN"
elif [ "$TASK_KIND" = "FLEET_UPDATE" ]; then
  RUN_BIN="/usr/local/bin/verris-node-update.sh"
  fetch_task_script "/agent/tasks/node-update/script" "$RUN_BIN"
  payload_env "UPD" "{'wyrownaj':'WYROWNAJ'}"
elif [ "$TASK_KIND" = "DB_TRANSFER" ]; then
  RUN_BIN="/usr/local/bin/verris-db-transfer.sh"
  fetch_task_script "/agent/tasks/db-transfer/script" "$RUN_BIN"
  payload_env "DBT" "{'mode':'MODE','daUser':'DA_USER','db':'DB','file':'FILE'}"
elif [ "$TASK_KIND" = "FILE_RESTORE" ]; then
  RUN_BIN="/usr/local/bin/verris-file-restore.sh"
  fetch_task_script "/agent/tasks/file-restore/script" "$RUN_BIN"
  payload_env "FR" "{'mode':'MODE','daUser':'DA_USER','archive':'ARCHIVE','path':'PATH'}"
elif [ "$TASK_KIND" = "SSH_ACCESS" ]; then
  RUN_BIN="/usr/local/bin/verris-ssh-access.sh"
  fetch_task_script "/agent/tasks/ssh-access/script" "$RUN_BIN"
  payload_env "SSH" "{'mode':'MODE','daUser':'DA_USER','keysB64':'KEYS_B64'}"
elif [ "$TASK_KIND" = "WP_UPDATE" ]; then
  RUN_BIN="/usr/local/bin/verris-wp-update.sh"
  fetch_task_script "/agent/tasks/wp-update/script" "$RUN_BIN"
  payload_env "WPU" "{'mode':'MODE','daUser':'DA_USER','domain':'DOMAIN','core':'CORE','plugins':'PLUGINS','themes':'THEMES','cache':'CACHE','harden':'HARDEN'}"
elif [ "$TASK_KIND" = "DISK_USAGE" ]; then
  RUN_BIN="/usr/local/bin/verris-disk-usage.sh"
  fetch_task_script "/agent/tasks/disk-usage/script" "$RUN_BIN"
  payload_env "DU" "{'daUser':'DA_USER'}"
elif [ "$TASK_KIND" = "MALWARE_SCAN" ]; then
  RUN_BIN="/usr/local/bin/verris-malware-scan.sh"
  fetch_task_script "/agent/tasks/malware-scan/script" "$RUN_BIN"
  payload_env "MS" "{'mode':'MODE','daUser':'DA_USER'}"
elif [ "$TASK_KIND" = "REDIS_ACCESS" ]; then
  RUN_BIN="/usr/local/bin/verris-redis.sh"
  fetch_task_script "/agent/tasks/redis/script" "$RUN_BIN"
  payload_env "RD" "{'mode':'MODE','daUser':'DA_USER','memoryMb':'MEMORY_MB'}"
elif [ "$TASK_KIND" = "MAIL_LOG" ]; then
  RUN_BIN="/usr/local/bin/verris-mail-log.sh"
  fetch_task_script "/agent/tasks/mail-log/script" "$RUN_BIN"
  payload_env "ML" "{'domains':'DOMAINS','address':'ADDRESS'}"
elif [ "$TASK_KIND" = "GIT_DEPLOY" ]; then
  RUN_BIN="/usr/local/bin/verris-git-deploy.sh"
  fetch_task_script "/agent/tasks/git-deploy/script" "$RUN_BIN"
  payload_env "GD" "{'mode':'MODE','daUser':'DA_USER','domain':'DOMAIN','dir':'DIR','url':'URL','branch':'BRANCH'}"
elif [ "$TASK_KIND" = "SITE_CLONE" ]; then
  RUN_BIN="/usr/local/bin/verris-site-clone.sh"
  fetch_task_script "/agent/tasks/site-clone/script" "$RUN_BIN"
  payload_env "SC" "{'daUser':'DA_USER','source':'SOURCE','target':'TARGET','dbName':'DB_NAME','dbUser':'DB_USER','dbPass':'DB_PASS'}"
elif [ "$TASK_KIND" = "HTACCESS" ]; then
  RUN_BIN="/usr/local/bin/verris-htaccess.sh"
  fetch_task_script "/agent/tasks/htaccess/script" "$RUN_BIN"
  payload_env "HT" "{'mode':'MODE','daUser':'DA_USER','domain':'DOMAIN','indexes':'INDEXES','hsts':'HSTS','e403':'E403','e404':'E404','e500':'E500','dir':'DIR','php':'PHP'}"
elif [ "$TASK_KIND" = "PHP_INFO" ]; then
  RUN_BIN="/usr/local/bin/verris-php-info.sh"
  fetch_task_script "/agent/tasks/php-info/script" "$RUN_BIN"
  payload_env "PI" "{'daUser':'DA_USER','domain':'DOMAIN'}"
elif [ "$TASK_KIND" = "APP_SELECTOR" ]; then
  RUN_BIN="/usr/local/bin/verris-app-selector.sh"
  fetch_task_script "/agent/tasks/app-selector/script" "$RUN_BIN"
  payload_env "AS" "{'mode':'MODE','interpreter':'INTERPRETER','daUser':'DA_USER','root':'ROOT','domain':'DOMAIN','uri':'URI','version':'VERSION','startup':'STARTUP','entry':'ENTRY','envB64':'ENV_B64'}"
elif [ "$TASK_KIND" = "SLOW_SQL" ]; then
  RUN_BIN="/usr/local/bin/verris-slow-sql.sh"
  fetch_task_script "/agent/tasks/slow-sql/script" "$RUN_BIN"
  payload_env "SQ" "{'daUser':'DA_USER'}"
elif [ "$TASK_KIND" = "MEMCACHED_ACCESS" ]; then
  RUN_BIN="/usr/local/bin/verris-memcached.sh"
  fetch_task_script "/agent/tasks/memcached/script" "$RUN_BIN"
  payload_env "MC" "{'mode':'MODE','daUser':'DA_USER','memoryMb':'MEMORY_MB'}"
elif [ "$TASK_KIND" = "IMAGE_OPTIMIZE" ]; then
  RUN_BIN="/usr/local/bin/verris-image-optimize.sh"
  fetch_task_script "/agent/tasks/image-optimize/script" "$RUN_BIN"
  payload_env "IO" "{'daUser':'DA_USER','domain':'DOMAIN','dir':'DIR','metadane':'METADANE'}"
elif [ "$TASK_KIND" = "PGSQL" ]; then
  RUN_BIN="/usr/local/bin/verris-pgsql.sh"
  fetch_task_script "/agent/tasks/pgsql/script" "$RUN_BIN"
  payload_env "PG" "{'mode':'MODE','daUser':'DA_USER','db':'DB','pass':'PASS','max':'MAX'}"
elif [ "$TASK_KIND" = "SITE_STATS" ]; then
  RUN_BIN="/usr/local/bin/verris-site-stats.sh"
  fetch_task_script "/agent/tasks/site-stats/script" "$RUN_BIN"
  payload_env "SS" "{'daUser':'DA_USER','domain':'DOMAIN'}"
elif [ "$TASK_KIND" = "FILE_SEARCH" ]; then
  RUN_BIN="/usr/local/bin/verris-file-search.sh"
  fetch_task_script "/agent/tasks/file-search/script" "$RUN_BIN"
  payload_env "FS" "{'daUser':'DA_USER','domain':'DOMAIN','name':'NAME','text':'TEXT'}"
elif [ "$TASK_KIND" = "HOSTING_PROFILE" ]; then
  flags="-y"
  [ "$SKIP_BUILD" = "1" ] && flags="$flags --skip-build"
  [ "$DRY_RUN" = "1" ] && flags="$flags --dry-run"
  RUN_BIN="$PROFILE_BIN"
  [ -x "$RUN_BIN" ] || { report_fail "Brak $RUN_BIN"; exit 1; }
else
  # Nieznany rodzaj NIE może spaść do profilu hostingu (przekonfigurowanie całego węzła) —
  # agent starszy niż API po prostu odmawia i mówi, co zaktualizować.
  report_fail "Nieznany rodzaj zadania: $TASK_KIND — agent węzła jest starszy niż API (zaktualizuj verris-task-run.sh)."
  exit 1
fi

{
  echo "=== Verris task $TASK_ID (kind=$TASK_KIND) ==="
  echo "Start: $(date -u +%FT%TZ)"
  echo "Command: $RUN_BIN ${flags:-}"
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
if [ "${#RUN_ENV[@]}" -gt 0 ]; then
  env "${RUN_ENV[@]}" bash "$RUN_BIN" 2>&1 | tee -a "$TASK_LOG"
else
  bash "$RUN_BIN" ${flags:-} 2>&1 | tee -a "$TASK_LOG"
fi
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
