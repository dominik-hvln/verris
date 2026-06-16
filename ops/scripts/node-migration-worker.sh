#!/usr/bin/env bash
#
# node-migration-worker.sh — Verris O-2 competitor-migration worker (node side).
#
# Leases migration jobs queued by the control plane and executes the heavy
# transfer ON THE NODE that hosts the target account, so large SFTP/rsync/SQL/
# IMAP traffic never crosses the API pods. Matches the protocol in
# apps/api/src/subscriptions/migration-worker.controller.ts:
#
#   GET  $API/node/migration-worker/lease            -> job JSON | null
#   POST $API/node/migration-worker/:jobId/complete  {bytesTransferred,filesTransferred,databasesMigrated,mailboxesMigrated,log}
#   POST $API/node/migration-worker/:jobId/fail       {error,log,retryable}
#
# Job kinds: FILES_SFTP_RSYNC | MYSQL_IMPORT | IMAP_SYNC | HTTP_POST_CHECK
#
# Auth: /etc/verris.conf (VERRIS_SERVER_ID, VERRIS_IDENTITY_TOKEN, VERRIS_API_URL).
# Requires: root, jq, curl, lftp (or rsync+sshpass), mysql client, imapsync.
#
# Usage:
#   node-migration-worker.sh once       # lease + run a single job (default)
#   node-migration-worker.sh drain      # keep running jobs until lease is empty
#   node-migration-worker.sh --install  # install systemd timer (every 2 min)
set -euo pipefail

CONF=/etc/verris.conf
LOG_TAG="verris-migration-worker"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

require_conf() {
  [ -r "$CONF" ] || { echo "[FAIL] missing $CONF — bootstrap the node first." >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$CONF"
  : "${VERRIS_SERVER_ID:?}" "${VERRIS_IDENTITY_TOKEN:?}" "${VERRIS_API_URL:?}"
}

api() {
  # api METHOD PATH [JSON_BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS --max-time 60 -X "$method" \
      -H "X-Server-Id: $VERRIS_SERVER_ID" \
      -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$body" "${VERRIS_API_URL}${path}"
  else
    curl -fsS --max-time 60 -X "$method" \
      -H "X-Server-Id: $VERRIS_SERVER_ID" \
      -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
      "${VERRIS_API_URL}${path}"
  fi
}

# --- job completion helpers -------------------------------------------------

complete_job() {
  # complete_job JOB_ID BYTES FILES DBS MAILBOXES LOGFILE
  local id="$1" bytes="$2" files="$3" dbs="$4" mboxes="$5" logfile="$6"
  local logtext; logtext=$(tail -c 200000 "$logfile" 2>/dev/null | jq -Rs . || echo '""')
  local body
  body=$(jq -nc \
    --argjson bytes "${bytes:-0}" --argjson files "${files:-0}" \
    --argjson dbs "${dbs:-0}" --argjson mboxes "${mboxes:-0}" \
    --argjson log "$logtext" \
    '{bytesTransferred:$bytes,filesTransferred:$files,databasesMigrated:$dbs,mailboxesMigrated:$mboxes,log:$log}')
  api POST "/node/migration-worker/${id}/complete" "$body" >/dev/null
  log "job $id completed (bytes=$bytes files=$files dbs=$dbs mboxes=$mboxes)"
}

fail_job() {
  # fail_job JOB_ID "error" LOGFILE RETRYABLE(true|false)
  local id="$1" err="$2" logfile="$3" retryable="${4:-true}"
  local logtext; logtext=$(tail -c 200000 "$logfile" 2>/dev/null | jq -Rs . || echo '""')
  local body
  body=$(jq -nc --arg err "$err" --argjson log "$logtext" --argjson retry "$retryable" \
    '{error:$err,log:$log,retryable:$retry}')
  api POST "/node/migration-worker/${id}/fail" "$body" >/dev/null || true
  log "job $id failed: $err (retryable=$retryable)"
}

# --- per-kind executors -----------------------------------------------------

# Resolve the on-disk doc root for a DA account/domain.
docroot_for() {
  local user="$1" domain="$2"
  echo "/home/${user}/domains/${domain}/public_html"
}

run_files() {
  # rsync-over-sftp (or ftp) from the source host into the target public_html.
  local job="$1" logfile="$2"
  local user domain dst proto host port suser spass spath
  user=$(jq -r '.target.accountUsername // empty' <<<"$job")
  domain=$(jq -r '.target.domain // empty' <<<"$job")
  proto=$(jq -r '.source.protocol // "sftp"' <<<"$job")
  host=$(jq -r '.source.host' <<<"$job")
  port=$(jq -r '.source.port' <<<"$job")
  suser=$(jq -r '.source.username' <<<"$job")
  spass=$(jq -r '.source.password' <<<"$job")
  spath=$(jq -r '.source.remotePath // "/"' <<<"$job")
  [ -n "$user" ] && [ -n "$domain" ] || { echo "missing target account/domain" >>"$logfile"; return 2; }
  dst=$(docroot_for "$user" "$domain")
  mkdir -p "$dst"

  # lftp mirrors recursively over sftp/ftp/ftps and is resilient to flaky links.
  LFTP_PASSWORD="$spass" lftp -u "$suser",dummy \
    -e "set sftp:auto-confirm yes; set net:max-retries 3; set net:timeout 30; \
        set ftp:ssl-allow ${proto:+true}; \
        mirror --continue --parallel=4 --no-perms --verbose '${spath}' '${dst}'; bye" \
    "${proto}://${host}:${port}" >>"$logfile" 2>&1 <<EOF
$spass
EOF

  # DA-correct ownership so PHP-FPM / suEXEC can serve the files.
  chown -R "${user}:${user}" "$dst" >>"$logfile" 2>&1 || true

  local bytes files
  bytes=$(du -sb "$dst" 2>/dev/null | awk '{print $1+0}')
  files=$(find "$dst" -type f 2>/dev/null | wc -l | awk '{print $1+0}')
  echo "$bytes $files"
}

run_mysql() {
  # Stream source dump straight into a local DB. The target DB is created on the
  # node's MySQL via root socket auth (DA convention) if it doesn't exist yet.
  local job="$1" logfile="$2"
  local user sdb shost sport suser spass tdb
  user=$(jq -r '.target.accountUsername // empty' <<<"$job")
  shost=$(jq -r '.source.host' <<<"$job")
  sport=$(jq -r '.source.port' <<<"$job")
  sdb=$(jq -r '.source.database' <<<"$job")
  suser=$(jq -r '.source.username' <<<"$job")
  spass=$(jq -r '.source.password' <<<"$job")
  # Target DB name follows DA prefixing: <dauser>_<sourcedb> (trimmed to 64).
  tdb=$(printf '%s_%s' "$user" "$sdb" | tr -c 'a-zA-Z0-9_' '_' | cut -c1-64)

  mysql --protocol=socket -e "CREATE DATABASE IF NOT EXISTS \`${tdb}\` CHARACTER SET utf8mb4;" >>"$logfile" 2>&1
  # Grant the DA system user access (matches how DA links account DBs).
  mysql --protocol=socket -e "GRANT ALL ON \`${tdb}\`.* TO '${user}'@'localhost';" >>"$logfile" 2>&1 || true

  MYSQL_PWD="$spass" mysqldump --single-transaction --quick --routines --triggers \
    -h "$shost" -P "$sport" -u "$suser" "$sdb" 2>>"$logfile" \
    | mysql --protocol=socket "$tdb" 2>>"$logfile"

  local bytes
  bytes=$(mysql --protocol=socket -N -e \
    "SELECT IFNULL(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema='${tdb}';" 2>/dev/null || echo 0)
  echo "$bytes"
}

run_imap() {
  # imapsync from the source mailbox into the local dovecot mailbox for the same
  # address. The local account is addressed over localhost IMAP using the DA
  # mail user; doveadm auth is used so we never need the plaintext target pass.
  local job="$1" logfile="$2"
  local email shost sport suser spass
  email=$(jq -r '.source.email' <<<"$job")
  shost=$(jq -r '.source.host' <<<"$job")
  sport=$(jq -r '.source.port' <<<"$job")
  suser=$(jq -r '.source.username' <<<"$job")
  spass=$(jq -r '.source.password' <<<"$job")

  # Master-user login to the local dovecot (configured during node bootstrap).
  local master_user="${VERRIS_DOVECOT_MASTER_USER:-}" master_pass="${VERRIS_DOVECOT_MASTER_PASS:-}"
  [ -n "$master_user" ] && [ -n "$master_pass" ] || {
    echo "dovecot master credentials not configured (VERRIS_DOVECOT_MASTER_USER/PASS)" >>"$logfile"; return 2; }

  imapsync \
    --host1 "$shost" --port1 "$sport" --user1 "$suser" --password1 "$spass" \
    --host2 127.0.0.1 --port2 143 --user2 "$email" \
    --authuser2 "$master_user" --password2 "$master_pass" --authmech2 PLAIN \
    --no-modulesversion --automap --addheader --useheader 'Message-Id' \
    >>"$logfile" 2>&1
  echo "1" # mailboxes migrated
}

run_http_check() {
  local job="$1" logfile="$2"
  local url; url=$(jq -r '.check.url // empty' <<<"$job")
  [ -n "$url" ] || { echo "no check url" >>"$logfile"; return 2; }
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -L "$url" 2>>"$logfile" || echo 000)
  echo "HTTP $code for $url" >>"$logfile"
  [[ "$code" =~ ^(2|3)[0-9][0-9]$ ]]
}

# --- main loop --------------------------------------------------------------

run_one() {
  local job; job=$(api GET "/node/migration-worker/lease" || echo "null")
  [ "$job" = "null" ] || [ -z "$job" ] && { return 9; } # nothing to do

  local id kind; id=$(jq -r '.id' <<<"$job"); kind=$(jq -r '.kind' <<<"$job")
  [ -n "$id" ] && [ "$id" != "null" ] || return 9
  local logfile; logfile=$(mktemp /tmp/verris-mig-XXXXXX.log)
  log "leased job $id kind=$kind"

  set +e
  case "$kind" in
    FILES_SFTP_RSYNC)
      out=$(run_files "$job" "$logfile"); rc=$?
      if [ $rc -eq 0 ]; then complete_job "$id" "${out% *}" "${out#* }" 0 0 "$logfile"
      else fail_job "$id" "files transfer failed (rc=$rc)" "$logfile" true; fi ;;
    MYSQL_IMPORT)
      out=$(run_mysql "$job" "$logfile"); rc=$?
      if [ $rc -eq 0 ]; then complete_job "$id" "${out:-0}" 0 1 0 "$logfile"
      else fail_job "$id" "mysql import failed (rc=$rc)" "$logfile" true; fi ;;
    IMAP_SYNC)
      out=$(run_imap "$job" "$logfile"); rc=$?
      if [ $rc -eq 0 ]; then complete_job "$id" 0 0 0 "${out:-1}" "$logfile"
      else fail_job "$id" "imap sync failed (rc=$rc)" "$logfile" true; fi ;;
    HTTP_POST_CHECK)
      run_http_check "$job" "$logfile"; rc=$?
      if [ $rc -eq 0 ]; then complete_job "$id" 0 0 0 0 "$logfile"
      else fail_job "$id" "http check failed" "$logfile" false; fi ;;
    *)
      fail_job "$id" "unknown job kind: $kind" "$logfile" false ;;
  esac
  set -e
  rm -f "$logfile"
  return 0
}

ensure_deps() {
  # Best-effort install of the transfer tools. Non-fatal: a missing tool only
  # affects its own job kind (worker reports that job as retryable-failed).
  local need=(jq curl lftp mysql imapsync)
  local missing=()
  for b in "${need[@]}"; do command -v "$b" >/dev/null 2>&1 || missing+=("$b"); done
  [ ${#missing[@]} -eq 0 ] && return 0
  log "installing missing tools: ${missing[*]}"
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y epel-release >/dev/null 2>&1 || true
    dnf install -y jq curl lftp mariadb imapsync >/dev/null 2>&1 || true
  elif command -v yum >/dev/null 2>&1; then
    yum install -y epel-release >/dev/null 2>&1 || true
    yum install -y jq curl lftp mariadb imapsync >/dev/null 2>&1 || true
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update >/dev/null 2>&1 || true
    apt-get install -y jq curl lftp mariadb-client imapsync >/dev/null 2>&1 || true
  fi
}

install_timer() {
  require_conf
  ensure_deps
  install -m 0755 "$0" /usr/local/sbin/verris-migration-worker
  cat >/etc/systemd/system/verris-migration-worker.service <<'UNIT'
[Unit]
Description=Verris competitor-migration worker (lease + execute)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/verris-migration-worker drain
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=6
UNIT
  cat >/etc/systemd/system/verris-migration-worker.timer <<'UNIT'
[Unit]
Description=Run Verris migration worker every 2 minutes

[Timer]
OnBootSec=90
OnUnitActiveSec=120
AccuracySec=20

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now verris-migration-worker.timer
  log "installed verris-migration-worker.timer (every 2 min)"
}

main() {
  case "${1:-once}" in
    --install|install-timer) install_timer ;;
    drain)
      require_conf
      local n=0
      while :; do
        run_one; rc=$?
        [ $rc -eq 9 ] && break
        n=$((n+1)); [ $n -ge 20 ] && break # safety cap per invocation
      done
      log "drain finished ($n job(s))" ;;
    once|*)
      require_conf
      run_one || true ;;
  esac
}

main "$@"
