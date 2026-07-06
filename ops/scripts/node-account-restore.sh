#!/usr/bin/env bash
# =============================================================================
# Verris — self-restore konta klienta z kopii OFF-SITE (S-1 / DR)
# -----------------------------------------------------------------------------
# Domyka lukę „utrata węzła nie może oznaczać utraty danych klienta": pobiera
# archiwum backupu konta z niezależnego storage off-site (rclone) z powrotem na
# węzeł i przywraca je w DirectAdmin. Uzupełnia istniejący self-restore z kopii
# LOKALNych DA (panel) o ścieżkę odtwarzania po awarii/utracie węzła.
#
# Układ off-site (z node-offsite-backup.sh):
#   <RCLONE_REMOTE>/<BACKUP_PREFIX>/<user>/backups/<archiwum>
#   wersje: <RCLONE_REMOTE>/<BACKUP_PREFIX>-versions/<YYYYMMDD>/<user>/backups/…
#
# Użycie:
#   node-account-restore.sh list <user> [YYYYMMDD]        # lista archiwów off-site
#   node-account-restore.sh fetch <user> <archiwum> [YYYYMMDD]   # pobierz na węzeł
#   node-account-restore.sh restore <user> <archiwum> [YYYYMMDD] # pobierz + DA restore
#
# Wymaga: /etc/verris-backup.conf (RCLONE_REMOTE, BACKUP_PREFIX), rclone, DirectAdmin.
# =============================================================================

set -Eeuo pipefail

CONF=/etc/verris.conf
BCONF=/etc/verris-backup.conf
log() { echo "[$(date -u +%FT%TZ)] $*" >&2; }
fail() { log "[FAIL] $*"; exit 1; }

[ -r "$BCONF" ] || fail "brak $BCONF (offsite config)"
# shellcheck disable=SC1090
[ -r "$CONF" ] && source "$CONF"; source "$BCONF"
: "${RCLONE_REMOTE:?RCLONE_REMOTE wymagane}"
BACKUP_PREFIX="${BACKUP_PREFIX:-nodes/$(hostname -s)}"
command -v rclone >/dev/null 2>&1 || fail "rclone nie zainstalowany"

DA_BIN=/usr/local/directadmin/directadmin
DA_TASKQ=/usr/local/directadmin/data/task.queue

# Ścieżka off-site do backupów usera (bieżące lub z wersji dnia).
remote_path() {
  local user="$1" snap="${2:-}"
  if [ -n "$snap" ]; then
    printf '%s%s-versions/%s/%s/backups/' "$RCLONE_REMOTE" "$BACKUP_PREFIX" "$snap" "$user"
  else
    printf '%s%s/%s/backups/' "$RCLONE_REMOTE" "$BACKUP_PREFIX" "$user"
  fi
}

cmd_list() {
  local user="$1" snap="${2:-}"; [ -n "$user" ] || fail "podaj usera"
  local p; p="$(remote_path "$user" "$snap")"
  log "off-site archiwa dla ${user}${snap:+ (wersja $snap)}: $p"
  rclone lsf --files-only "$p" 2>/dev/null | grep -iE '\.tar\.(gz|zst)$|\.tar$' || {
    log "(brak archiwów off-site — sprawdź prefix/usera)"; return 1; }
}

cmd_fetch() {
  local user="$1" archive="$2" snap="${3:-}"
  [ -n "$user" ] && [ -n "$archive" ] || fail "użycie: fetch <user> <archiwum> [YYYYMMDD]"
  local src dst
  src="$(remote_path "$user" "$snap")${archive}"
  dst="/home/${user}/backups/"
  [ -d "$dst" ] || fail "brak katalogu ${dst} (konto istnieje na tym węźle?)"
  log "pobieram ${src} -> ${dst}"
  rclone copyto "$src" "${dst}${archive}" --retries 3 --low-level-retries 10 || fail "rclone copy nieudany"
  chown "${user}:${user}" "${dst}${archive}" 2>/dev/null || true
  log "pobrano: ${dst}${archive}"
  printf '%s' "${dst}${archive}"
}

cmd_restore() {
  local user="$1" archive="$2" snap="${3:-}"
  [ -n "$user" ] && [ -n "$archive" ] || fail "użycie: restore <user> <archiwum> [YYYYMMDD]"
  cmd_fetch "$user" "$archive" "$snap" >/dev/null
  [ -x "$DA_BIN" ] || fail "DirectAdmin nie znaleziony (${DA_BIN}) — pobrano archiwum, restore wykonaj ręcznie"
  log "zlecam DirectAdmin restore ${archive} dla ${user}"
  # Kolejka zadań DA: restore lokalnego archiwum konta (dataskq przetworzy).
  printf 'action=restore&ip_choice=file&local_path=/home/%s/backups&owner=%s&select0=%s&type=admin&when=now&where=local\n' \
    "$user" "$user" "$archive" >> "$DA_TASKQ"
  /usr/local/directadmin/dataskq d2000 >/dev/null 2>&1 || true
  log "✅ Zlecono restore. DA przetwarza w tle (dataskq). Zweryfikuj w DA → Admin Backup/Transfer."
}

case "${1:-}" in
  list)    shift; cmd_list "$@" ;;
  fetch)   shift; cmd_fetch "$@" ;;
  restore) shift; cmd_restore "$@" ;;
  *) echo "Użycie: $0 {list <user> [YYYYMMDD] | fetch <user> <archiwum> [YYYYMMDD] | restore <user> <archiwum> [YYYYMMDD]}"; exit 2 ;;
esac
