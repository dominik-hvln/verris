#!/usr/bin/env bash
# =============================================================================
# Verris — konfiguracja kopii off-site węzła z panelu (PB-31).
#
# Pobiera z control-plane (kanał agenta: X-Server-Id + X-Server-Token) wspólną dla floty
# konfigurację Storage Boxa i szyfrowania, tworzy remote'y rclone bez interakcji
# (`rclone config create … --obscure` — dokumentacja rclone „config create”) i zapisuje
# /etc/verris-backup.conf dla node-offsite-backup.sh.
#
#   verris-crypt: → crypt (password + password2) na verris-remote:<ścieżka> (SFTP, Storage Box port 23)
#
# Użycie: bash node-backup-config.sh [--force]   (bez --force nie rusza istniejącej konfiguracji)
# =============================================================================
set -Eeuo pipefail

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1
BCONF=/etc/verris-backup.conf

log() { echo "[backup-config] $*"; }

if [ -r "$BCONF" ] && [ "$FORCE" -ne 1 ]; then
  log "Konfiguracja $BCONF już jest — pomijam (--force nadpisze)."
  exit 0
fi

[ -r /etc/verris.conf ] || { log "Brak /etc/verris.conf — najpierw bootstrap/agent."; exit 1; }
# shellcheck disable=SC1091
. /etc/verris.conf

if ! command -v rclone >/dev/null 2>&1; then
  log "Instaluję rclone…"
  # Pakiet z repozytorium (EPEL), a gdy go nie ma — oficjalny RPM z downloads.rclone.org.
  dnf -y install rclone >/dev/null 2>&1 \
    || dnf -y install https://downloads.rclone.org/rclone-current-linux-amd64.rpm >/dev/null 2>&1 \
    || { log "Nie udało się zainstalować rclone."; exit 1; }
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"
code="$(curl -sS --max-time 20 -o "$TMP" -w '%{http_code}' \
  -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
  "$VERRIS_API_URL/agent/tasks/backup-config" || echo 000)"
if [ "$code" = "404" ]; then
  log "Kopie off-site nie są skonfigurowane w panelu (kreator węzła → krok 4)."
  exit 2
fi
[ "$code" = "200" ] || { log "Control-plane odpowiedział $code."; exit 1; }
# shellcheck disable=SC1090
. "$TMP"

umask 077
mkdir -p /root/.config/rclone
rclone config create verris-remote sftp host "$VB_HOST" port "$VB_PORT" user "$VB_USER" pass "$VB_PASS" --obscure >/dev/null
rclone config create verris-crypt crypt remote "verris-remote:$VB_PATH" password "$VB_CRYPT_PASS" password2 "$VB_CRYPT_SALT" --obscure >/dev/null
chmod 600 /root/.config/rclone/rclone.conf

cat > "$BCONF" <<CONF
RCLONE_REMOTE="verris-crypt:"
BACKUP_PREFIX="nodes/$(hostname -s)"
RETENTION_DAYS=$VB_RETENTION_DAYS
DA_BACKUP=1
CONF
chmod 600 "$BCONF"

if rclone mkdir verris-crypt: >/dev/null 2>&1 && rclone lsd verris-crypt: >/dev/null 2>&1; then
  log "OK: verris-crypt: działa (Storage Box $VB_HOST:$VB_PORT)."
else
  log "Remote utworzony, ale test połączenia nie przeszedł — sprawdź dane Storage Boxa i egress (port $VB_PORT)."
  exit 1
fi
