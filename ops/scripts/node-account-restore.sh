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
  # Wiersze maszynowe (parsowane przez control-plane): nazwa|bajty|data ISO.
  # Prefiks pozwala odfiltrować je z reszty logu zadania.
  local found=0 line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    printf 'VERRIS-OFFSITE-FILE %s\n' "$line"
    found=1
  done < <(rclone lsf --files-only --format 'pst' --separator '|' "$p" 2>/dev/null \
             | grep -iE '^[^|]+\.(tar\.gz|tar\.zst|tar)\|')
  if [ "$found" = "0" ]; then
    log "(brak archiwow off-site — sprawdz prefix/usera)"
    printf 'VERRIS-OFFSITE-EMPTY\n'
  fi
}

cmd_fetch() {
  local user="$1" archive="$2" snap="${3:-}"
  [ -n "$user" ] && [ -n "$archive" ] || fail "użycie: fetch <user> <archiwum> [YYYYMMDD]"
  local src dst
  src="$(remote_path "$user" "$snap")${archive}"
  dst="/home/${user}/backups/"
  # Katalog należy do klienta: dowiązanie symboliczne zamiast niego (albo zamiast pliku) skierowałoby
  # zapis roota w dowolne miejsce systemu — odmawiamy, a chown nie idzie za dowiązaniem (-h).
  [ -d "$dst" ] && [ ! -L "/home/${user}/backups" ] || fail "brak katalogu ${dst} (konto istnieje na tym węźle?)"
  [ ! -L "${dst}${archive}" ] || fail "${dst}${archive} jest dowiązaniem symbolicznym — odmowa"
  log "pobieram ${src} -> ${dst}"
  rclone copyto "$src" "${dst}${archive}" --retries 3 --low-level-retries 10 || fail "rclone copy nieudany"
  chown -h "${user}:${user}" "${dst}${archive}" 2>/dev/null || true
  log "pobrano: ${dst}${archive}"
  printf 'VERRIS-OFFSITE-FETCHED %s\n' "${dst}${archive}"
}

cmd_restore() {
  local user="$1" archive="$2" snap="${3:-}" ip="${4:-}"
  [ -n "$user" ] && [ -n "$archive" ] || fail "użycie: restore <user> <archiwum> [YYYYMMDD]"
  [ -x "$DA_BIN" ] || fail "DirectAdmin nie znaleziony (${DA_BIN})"
  # H-16 — odtworzenie na INNY węzeł (konta tu nie ma): DA dostaje IP tego węzła zamiast IP z archiwum.
  # Dokumentacja DA (Backup/Restore/Migration): „If you want to specify the IP to restore him to
  # (assuming his account doesn't exist yet), then you'd set ip_choice=select&ip=1.2.3.4”.
  local ipchoice="ip_choice=file"
  if [ -n "$ip" ]; then
    [ ! -e "/usr/local/directadmin/data/users/${user}" ] || fail "konto ${user} już istnieje na tym węźle — odtworzenie na inny węzeł nie nadpisuje istniejących kont"
    [ -e "/usr/local/directadmin/data/admin/ips/${ip}" ] || grep -qxF "$ip" /usr/local/directadmin/data/admin/ip.list 2>/dev/null \
      || fail "IP ${ip} nie jest skonfigurowane w DirectAdmin tego węzła"
    ipchoice="ip_choice=select&ip=${ip}"
  fi
  # Oficjalna dokumentacja DA (Backup/Restore → admin restore przez task.queue):
  #   action=restore&ip_choice=file&local_path=/home/admin/admin_backups&owner=admin
  #   &select0=user.admin.testuser.tar.gz&type=admin&value=multiple&when=now&where=local
  # owner = administrator, który utworzył konto (creator w user.conf). Archiwum trafia do katalogu
  # administratora, nie do katalogu klienta — tam klient mógłby je podmienić przed przetworzeniem.
  local owner dst
  owner="$(sed -n 's/^creator=//p' "/usr/local/directadmin/data/users/${user}/user.conf" 2>/dev/null | head -1)"
  [[ "$owner" =~ ^[a-z][a-z0-9]{0,15}$ ]] || owner=admin
  dst="/home/${owner}/admin_backups/"
  [ -d "$dst" ] || fail "brak katalogu ${dst}"
  log "pobieram $(remote_path "$user" "$snap")${archive} -> ${dst}"
  rclone copyto "$(remote_path "$user" "$snap")${archive}" "${dst}${archive}" --retries 3 --low-level-retries 10 || fail "rclone copy nieudany"
  chown -h "${owner}:${owner}" "${dst}${archive}" 2>/dev/null || true
  log "zlecam DirectAdmin restore ${archive} dla ${user} (owner=${owner})"
  printf 'action=restore&%s&local_path=%s&owner=%s&select0=%s&type=admin&value=multiple&when=now&where=local\n' \
    "$ipchoice" "/home/${owner}/admin_backups" "$owner" "$archive" >> "$DA_TASKQ"
  log "✅ Zlecono restore (task.queue). Zweryfikuj w DA → Admin Backup/Transfer."
  [ -n "$ip" ] || return 0
  # Na nowym węźle czekamy, aż DA (dataskq) założy konto — dopiero wtedy panel przepina je na ten węzeł.
  local i
  for i in $(seq 1 "${OFR_WAIT_TRIES:-120}"); do
    if [ -f "/usr/local/directadmin/data/users/${user}/user.conf" ]; then
      printf 'VERRIS-OFFSITE-RESTORED %s\n' "$user"
      return 0
    fi
    sleep "${OFR_WAIT_SLEEP:-15}"
  done
  fail "DirectAdmin nie założył konta ${user} w 30 minut — sprawdź Admin → Backup/Transfer i /var/log/directadmin/errortaskq.log"
}

# Walidacja wejscia (obrona w glab — control-plane waliduje to samo).
check_args() {
  local user="$1" archive="${2:-}" snap="${3:-}" prefix="${4:-}" ip="${5:-}"
  [ -z "$prefix" ] || { [[ "$prefix" =~ ^nodes/[a-z0-9][a-z0-9.-]{0,62}$ ]] && [[ "$prefix" != *..* ]]; } || fail "nieprawidlowy prefiks wezla zrodlowego: $prefix"
  [ -z "$ip" ] || [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail "nieprawidlowe IP: $ip"
  [[ "$user" =~ ^[a-zA-Z0-9_-]{1,32}$ ]] || fail "nieprawidlowy user: $user"
  if [ -n "$archive" ]; then
    [[ "$archive" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$ ]] || fail "nieprawidlowa nazwa archiwum: $archive"
    case "$archive" in *..*|*/*) fail "nieprawidlowa nazwa archiwum: $archive" ;; esac
  fi
  [ -z "$snap" ] || [[ "$snap" =~ ^[0-9]{8}$ ]] || fail "nieprawidlowa wersja (YYYYMMDD): $snap"
}

# Tryb agenta: bez argumentow, parametry z ENV (zadanie OFFSITE_RESTORE).
#   OFR_MODE=list|fetch|restore  OFR_USER=<da user>  OFR_ARCHIVE=<plik>  OFR_SNAPSHOT=<YYYYMMDD>
#   H-16 (odtworzenie na innym węźle): OFR_SOURCE_PREFIX=nodes/<węzeł źródłowy>  OFR_IP=<IP tego węzła>
#   — kopie czytane z prefiksu węzła źródłowego (ta sama flota = ten sam remote crypt), restore tylko z OFR_IP.
if [ $# -eq 0 ] && [ -n "${OFR_MODE:-}" ]; then
  check_args "${OFR_USER:-}" "${OFR_ARCHIVE:-}" "${OFR_SNAPSHOT:-}" "${OFR_SOURCE_PREFIX:-}" "${OFR_IP:-}"
  [ -z "${OFR_SOURCE_PREFIX:-}" ] || BACKUP_PREFIX="$OFR_SOURCE_PREFIX"
  case "$OFR_MODE" in
    list)    cmd_list  "$OFR_USER" "${OFR_SNAPSHOT:-}" ;;
    fetch)   cmd_fetch "$OFR_USER" "${OFR_ARCHIVE:?OFR_ARCHIVE wymagane}" "${OFR_SNAPSHOT:-}" ;;
    restore) [ -n "${OFR_IP:-}" ] || fail "restore z panelu tylko na inny węzeł (OFR_IP)"
             cmd_restore "$OFR_USER" "${OFR_ARCHIVE:?OFR_ARCHIVE wymagane}" "${OFR_SNAPSHOT:-}" "$OFR_IP" ;;
    *)       fail "nieznany OFR_MODE: $OFR_MODE (list|fetch|restore)" ;;
  esac
  exit 0
fi

case "${1:-}" in
  list)    shift; check_args "${1:-}" "" "${2:-}"; cmd_list "$@" ;;
  fetch)   shift; check_args "${1:-}" "${2:-}" "${3:-}"; cmd_fetch "$@" ;;
  restore) shift; check_args "${1:-}" "${2:-}" "${3:-}"; cmd_restore "$@" ;;
  *) echo "Użycie: $0 {list <user> [YYYYMMDD] | fetch <user> <archiwum> [YYYYMMDD] | restore <user> <archiwum> [YYYYMMDD]}"; exit 2 ;;
esac
