#!/usr/bin/env bash
#
# node-offsite-backup.sh — Verris B-1 LIVE off-node (offsite) backups.
#
# Ships per-account DirectAdmin backups to S3-compatible offsite storage via
# rclone, encrypted, with retention, so a node loss never means customer-data
# loss. Reports each run to the control plane (Server.lastOffsiteBackup*).
#
# Strategy (official DirectAdmin docs, Backup/Restore → command line):
#   /usr/local/directadmin/directadmin admin-backup --destination=/home/admin/admin_backups --user=<u>
# runs synchronously per account (file user.<creator>.<u>.tar.gz), the archive is moved into a
# root-only tree /home/.verris-offsite/<u>/backups/ and that tree is rclone-synced to the remote
# (layout unchanged for node-account-restore.sh) with versioned retention, then removed locally.
# Earlier revision queued `action=backup…&user_select0=` into task.queue — not the documented
# format (select0=, owner=<admin>) — and synced whatever old archives sat in /home/*/backups.
# rclone "crypt" remote gives client-side encryption (keys live only on the node, in rclone.conf).
#
# Auth/report: /etc/verris.conf (VERRIS_SERVER_ID, VERRIS_IDENTITY_TOKEN, VERRIS_API_URL).
# Offsite config: /etc/verris-backup.conf:
#   RCLONE_REMOTE="verris-crypt:"          # rclone crypt remote (recommended)
#   BACKUP_PREFIX="nodes/<hostname>"        # path within the bucket
#   RETENTION_DAYS=30                        # keep N days of versions
#   DA_BACKUP=1                              # 1 = trigger DA user backups first
#
# Usage:
#   node-offsite-backup.sh run         # backup + sync + report (default)
#   node-offsite-backup.sh --install   # systemd timer (daily 03:30)
set -euo pipefail

CONF=/etc/verris.conf
BCONF=/etc/verris-backup.conf
log() { echo "[$(date -u +%FT%TZ)] $*"; }

require_conf() {
  [ -r "$CONF" ]  || { echo "[FAIL] missing $CONF" >&2; exit 1; }
  [ -r "$BCONF" ] || { echo "[FAIL] missing $BCONF (offsite config)" >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$CONF"; source "$BCONF"
  : "${VERRIS_SERVER_ID:?}" "${VERRIS_IDENTITY_TOKEN:?}" "${VERRIS_API_URL:?}" "${RCLONE_REMOTE:?}"
  RETENTION_DAYS="${RETENTION_DAYS:-30}"
  BACKUP_PREFIX="${BACKUP_PREFIX:-nodes/$(hostname -s)}"
  DA_BACKUP="${DA_BACKUP:-1}"
}

report() {
  # report OK ACCOUNTS BYTES DURATION INFO
  local ok="$1" accounts="$2" bytes="$3" dur="$4" info="$5"
  local body
  body=$(jq -nc --argjson ok "$ok" --argjson accounts "${accounts:-0}" \
    --argjson bytes "${bytes:-0}" --argjson dur "${dur:-0}" --arg info "$info" \
    '{ok:($ok==1),accounts:$accounts,bytes:$bytes,durationSec:$dur,info:$info}')
  curl -fsS --max-time 30 -X POST \
    -H "X-Server-Id: $VERRIS_SERVER_ID" \
    -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$body" "${VERRIS_API_URL}/agent/backup/offsite-report" >/dev/null 2>&1 || \
    log "warn: report to control-plane failed"
}

DA_BIN=/usr/local/directadmin/directadmin
TREE=/home/.verris-offsite

# admin-backup każdego konta po kolei (synchronicznie), archiwum do drzewa tylko dla roota.
# Konta, których kopia się nie udała, trafiają do FAILED — ich poprzednie archiwa zostają na zdalnym.
FAILED=()
make_da_backups() {
  local users_dir=/usr/local/directadmin/data/users u user owner adir f
  rm -rf "$TREE"; install -d -m 0700 "$TREE"
  for u in "$users_dir"/*; do
    [ -f "$u/user.conf" ] || continue
    user=$(basename "$u")
    [[ "$user" =~ ^[a-z][a-z0-9]{0,15}$ ]] || continue
    grep -q '^usertype=user$' "$u/user.conf" 2>/dev/null || continue
    owner="$(sed -n 's/^creator=//p' "$u/user.conf" | head -1)"
    [[ "$owner" =~ ^[a-z][a-z0-9]{0,15}$ ]] || owner=admin
    adir="/home/${owner}/admin_backups"
    [ -d "$adir" ] || install -d -m 0700 -o "$owner" -g "$owner" "$adir"
    rm -f "$adir"/user."$owner"."$user".tar.*
    if ! "$DA_BIN" admin-backup --destination="$adir" --user="$user" >>/tmp/verris-offsite.log 2>&1; then
      log "warn: admin-backup failed for $user"; FAILED+=("$user"); continue
    fi
    f="$(ls -1 "$adir"/user."$owner"."$user".tar.* 2>/dev/null | head -1 || true)"
    if [ -z "$f" ] || [ ! -s "$f" ]; then
      log "warn: no archive for $user"; FAILED+=("$user"); continue
    fi
    install -d -m 0700 "$TREE/$user/backups"
    mv -f "$f" "$TREE/$user/backups/"
  done
}

run() {
  require_conf
  command -v rclone >/dev/null 2>&1 || { report 0 0 0 0 "rclone not installed"; echo "[FAIL] rclone missing" >&2; exit 1; }
  command -v jq >/dev/null 2>&1 || { echo "[FAIL] jq missing" >&2; exit 1; }
  [ -x "$DA_BIN" ] || { report 0 0 0 0 "DirectAdmin not found"; echo "[FAIL] DirectAdmin missing" >&2; exit 1; }

  local start; start=$(date +%s)
  : > /tmp/verris-offsite.log
  if [ "$DA_BACKUP" = "1" ]; then
    log "DirectAdmin admin-backup per account"
    make_da_backups
  fi
  # rclone sync nie kasuje plików wykluczonych — poprzednia kopia konta, którego dziś się nie udało, zostaje.
  local wyklucz=() u
  for u in "${FAILED[@]}"; do wyklucz+=(--exclude "/$u/**"); done

  local accounts=0 bytes=0
  accounts=$(find "$TREE" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | awk '{print $1+0}')
  bytes=$(du -sb "$TREE" 2>/dev/null | awk '{print $1+0}')

  local dst="${RCLONE_REMOTE}${BACKUP_PREFIX}"
  log "rclone sync ${TREE} -> ${dst} (retention ${RETENTION_DAYS}d)"
  set +e
  rclone sync "$TREE" "$dst" "${wyklucz[@]}" \
    --transfers 4 --checkers 8 --retries 3 --low-level-retries 10 \
    --backup-dir "${RCLONE_REMOTE}${BACKUP_PREFIX}-versions/$(date -u +%Y%m%d)" \
    --stats-one-line --log-level NOTICE 2>>/tmp/verris-offsite.log
  local rc=$?
  set -e
  rm -rf "$TREE"
  # Kopia części kont się nie udała — nie zgłaszamy sukcesu.
  if [ $rc -eq 0 ] && [ "${#FAILED[@]}" -gt 0 ]; then
    rc=3; echo "admin-backup failed for: ${FAILED[*]}" >> /tmp/verris-offsite.log
  fi

  # Retention: prune old version snapshots beyond RETENTION_DAYS.
  local cutoff; cutoff=$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || echo "")
  if [ -n "$cutoff" ]; then
    rclone lsf "${RCLONE_REMOTE}${BACKUP_PREFIX}-versions/" 2>/dev/null | sed 's#/##' | while read -r snap; do
      [[ "$snap" =~ ^[0-9]{8}$ ]] || continue
      if [ "$snap" -lt "$cutoff" ]; then
        rclone purge "${RCLONE_REMOTE}${BACKUP_PREFIX}-versions/${snap}" 2>/dev/null || true
      fi
    done
  fi

  local dur=$(( $(date +%s) - start ))
  if [ $rc -eq 0 ]; then
    log "offsite backup OK (accounts=$accounts bytes=$bytes dur=${dur}s)"
    report 1 "$accounts" "$bytes" "$dur" "rclone sync ok"
  else
    local tail; tail=$(tail -c 1200 /tmp/verris-offsite.log 2>/dev/null | tr '\n' ' ')
    log "offsite backup FAILED rc=$rc"
    report 0 "$accounts" "$bytes" "$dur" "rclone rc=$rc: $tail"
    exit $rc
  fi
}

install_timer() {
  install -m 0755 "$0" /usr/local/sbin/verris-offsite-backup
  cat >/etc/systemd/system/verris-offsite-backup.service <<'UNIT'
[Unit]
Description=Verris off-node (offsite) account backups
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/verris-offsite-backup run
Nice=15
IOSchedulingClass=best-effort
IOSchedulingPriority=7
UNIT
  cat >/etc/systemd/system/verris-offsite-backup.timer <<'UNIT'
[Unit]
Description=Daily Verris offsite backup (03:30)

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=1800
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now verris-offsite-backup.timer
  log "installed verris-offsite-backup.timer (daily 03:30)"
  [ -r "$BCONF" ] || log "NOTE: create $BCONF (RCLONE_REMOTE, BACKUP_PREFIX, RETENTION_DAYS) + rclone.conf before first run."
}

case "${1:-run}" in
  --install|install) install_timer ;;
  run|*) run ;;
esac
