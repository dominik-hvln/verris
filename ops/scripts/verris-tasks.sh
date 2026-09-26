#!/usr/bin/env bash
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
: "${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"


install_verris_deploy_ssh_key() {
  local line="${1:-}"
  if [ -z "$line" ] && [ -n "${VERRIS_DEPLOY_KEY_LINE_B64:-}" ]; then
    line=$(printf '%s' "$VERRIS_DEPLOY_KEY_LINE_B64" | base64 -d 2>/dev/null || true)
  fi
  if [ -z "$line" ] && [ "${VERRIS_FETCH_DEPLOY_KEY:-0}" = "1" ] && command -v verris-fetch >/dev/null 2>&1; then
    line=$(verris-fetch /agent/tasks/deploy-ssh-pubkey - 15 2>/dev/null \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("authorizedKeysLine") or "")' 2>/dev/null || true)
  fi
  [ -n "$line" ] || return 0
  case "$line" in from=\"*\"*' verris-control-plane') ;; *) echo "[verris] Odrzucono wpis klucza deploy bez from=" >&2; return 1 ;; esac
  local f="${VERRIS_AUTHORIZED_KEYS:-/root/.ssh/authorized_keys}" last="${VERRIS_DEPLOY_KEY_LAST:-/etc/verris/deploy-key.last}" body prev=""
  body=$(printf '%s' "$line" | awk '{ print $(NF-1) }')
  [ -r "$last" ] && prev=$(cat "$last")
  mkdir -p "$(dirname "$f")" "$(dirname "$last")"
  chmod 700 "$(dirname "$f")"
  touch "$f"
  chmod 600 "$f"
  if grep -qxF -- "$line" "$f" && [ "$(grep -cF -e ' verris-control-plane' -e "$body" ${prev:+-e "$prev"} "$f")" = "1" ]; then
    return 0
  fi
  { grep -vF -e ' verris-control-plane' -e "$body" ${prev:+-e "$prev"} "$f" || true; printf '%s\n' "$line"; } > "$f.verris-new"
  chmod 600 "$f.verris-new"
  mv -f "$f.verris-new" "$f"
  printf '%s\n' "$body" > "$last"
  echo "[verris] Klucz deploy control-plane w authorized_keys (tylko z adresów control-plane)"
}
VERRIS_FETCH_DEPLOY_KEY=1
install_verris_deploy_ssh_key || true

exec 9>"$LOCK"
flock -n 9 || exit 0

auth_headers=(-H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN")

# PB-30 — manifest stosu floty: ten sam plik na każdym węźle, odświeżany co minutę.
if verris-fetch /agent/tasks/stack-env /etc/verris-stack.env.tmp 15 2>>"$LOG" \
  && grep -q '^VERRIS_STACK_VERSION=' /etc/verris-stack.env.tmp; then
  chmod 0644 /etc/verris-stack.env.tmp && mv -f /etc/verris-stack.env.tmp /etc/verris-stack.env
else
  rm -f /etc/verris-stack.env.tmp
fi

task_instance() { printf '%s' "$1" | tr -d '-'; }

task_is_running() {
  local tid="$1"
  local inst
  inst=$(task_instance "$tid")
  if [ -f "$STATE_DIR/${inst}.pid" ]; then
    local pid
    pid=$(cat "$STATE_DIR/${inst}.pid" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if command -v systemctl >/dev/null 2>&1; then
    local state
    state=$(systemctl show -p ActiveState --value "verris-task@${inst}.service" 2>/dev/null || true)
    case "$state" in active|activating) return 0 ;; esac
  fi
  return 1
}

# PB-36 — zlecenie też musi mieć podpis control-plane (verris-fetch), inaczej nic nie ruszy.
LEASE_JSON=$(verris-fetch /agent/tasks/lease - 15 2>>"$LOG" || true)
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
  local detail="${2:-}"
  echo "[verris-tasks] Task $TASK_ID failed: $err" >> "$LOG"
  curl -fsS --max-time 30 -X POST "${auth_headers[@]}" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; err,log=sys.argv[1],sys.argv[2]; print(json.dumps({"error": err, "outputLog": log or None}))' "$err" "$detail")" \
    "$VERRIS_API_URL/agent/tasks/$TASK_ID/fail" >/dev/null 2>&1 || true
}

dispatch_hosting_profile() {
  if ! verris-fetch /agent/tasks/hosting-profile/script "$PROFILE_BIN" 60 2>>"$LOG"; then
    report_task_fail "Nie udało się pobrać skryptu profilu z API albo podpis control-plane jest nieprawidłowy."
    exit 1
  fi
  chmod 755 "$PROFILE_BIN"

  mkdir -p "$STATE_DIR"
  printf '%s' "$LEASE_JSON" > "$STATE_DIR/${INSTANCE}.json"

  if command -v systemctl >/dev/null 2>&1 && systemctl cat verris-task@.service >/dev/null 2>&1; then
    if systemctl start "verris-task@${INSTANCE}.service" 2>>"$LOG"; then
      echo "[verris-tasks] Started verris-task@${INSTANCE}.service (log: /var/log/verris-tasks/${TASK_ID}.log)" >> "$LOG"
      exit 0
    fi
    echo "[verris-tasks] systemctl start verris-task@${INSTANCE} failed — fallback sync" >> "$LOG"
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
  printf '%s' "$LEASE_JSON" > "$STATE_DIR/${INSTANCE}.json"
  if command -v systemctl >/dev/null 2>&1 && systemctl cat verris-task@.service >/dev/null 2>&1; then
    if systemctl start "verris-task@${INSTANCE}.service" 2>>"$LOG"; then
      echo "[verris-tasks] Started verris-task@${INSTANCE}.service ($KIND, log: /var/log/verris-tasks/${TASK_ID}.log)" >> "$LOG"
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
  WP_INSTALL|WAF_APPLY|STAGING_SYNC|PHP_APPLY|APP_INSTALL|OFFSITE_RESTORE|DB_UPGRADE|FLEET_UPDATE|DB_TRANSFER|FILE_RESTORE|SSH_ACCESS|WP_UPDATE|DISK_USAGE|MALWARE_SCAN|REDIS_ACCESS|MAIL_LOG|GIT_DEPLOY|SITE_CLONE|HTACCESS|PHP_INFO|FILE_SEARCH|APP_SELECTOR|SLOW_SQL|MEMCACHED_ACCESS|SITE_STATS|PGSQL|IMAGE_OPTIMIZE|ONBOARD_LIVE) dispatch_generic ;;
  *)
    report_task_fail "Unknown task kind: $KIND"
    exit 1
    ;;
esac
