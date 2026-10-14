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
# Użycie: bash node-backup-config.sh [--force | --jesli-zmiana]
#   bez opcji      — nie rusza istniejącej konfiguracji;
#   --force        — nadpisuje zawsze;
#   --jesli-zmiana — nadpisuje, gdy dane z panelu się zmieniły (audyt 13.10, #11: przejście węzła ze wspólnych
#                    danych floty na własne subkonto i klucz crypt; Onboard LIVE woła to przy każdym przebiegu).
# =============================================================================
set -Eeuo pipefail

FORCE=0
ZMIANA=0
[ "${1:-}" = "--force" ] && FORCE=1
[ "${1:-}" = "--jesli-zmiana" ] && ZMIANA=1
# VERRIS_BACKUP_CONF podmieniany wyłącznie w testach.
BCONF="${VERRIS_BACKUP_CONF:-/etc/verris-backup.conf}"

log() { echo "[backup-config] $*"; }

if [ -r "$BCONF" ] && [ "$FORCE" -ne 1 ] && [ "$ZMIANA" -ne 1 ]; then
  log "Konfiguracja $BCONF już jest — pomijam (--force nadpisze)."
  exit 0
fi

# VERRIS_CONF / VERRIS_RCLONE_DIR podmieniane wyłącznie w testach.
VCONF="${VERRIS_CONF:-/etc/verris.conf}"
RDIR="${VERRIS_RCLONE_DIR:-/root/.config/rclone}"
[ -r "$VCONF" ] || { log "Brak $VCONF — najpierw bootstrap/agent."; exit 1; }
# shellcheck disable=SC1090
. "$VCONF"

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
# PB-36 — plik jest wczytywany przez bash, więc tylko z ważnym podpisem control-plane.
rc=0
verris-fetch /agent/tasks/backup-config "$TMP" 20 || rc=$?
if [ "$rc" = "4" ]; then
  log "Kopie off-site nie są skonfigurowane w panelu (kreator węzła → krok 4)."
  exit 2
fi
[ "$rc" = "0" ] || { log "Nie pobrano konfiguracji kopii z control-plane (verris-fetch kod $rc)."; exit 1; }
ZRODLO_SHA="$(sha256sum "$TMP" | cut -d' ' -f1)"
if [ "$ZMIANA" = "1" ] && [ -r "$BCONF" ] && grep -qx "VB_ZRODLO_SHA=$ZRODLO_SHA" "$BCONF"; then
  log "Dane kopii z panelu bez zmian — konfiguracja zostaje."
  exit 0
fi
# shellcheck disable=SC1090
. "$TMP"

umask 077
mkdir -p "$RDIR"
# Klucz hosta Storage Boxa przypięty przy pierwszej konfiguracji: bez known_hosts_file rclone nie sprawdza
# serwera („No host key validation is being performed”) — podszywający się host zebrałby hasło SFTP i mógłby
# kasować kopie (treść chroni crypt). ponytail: TOFU przy onboardzie; porównanie z odciskami publikowanymi
# przez Hetznera, gdyby trzeba było bronić też pierwszego połączenia.
KH="$RDIR/storagebox_known_hosts"
# 13.10 (t2): przypięte były tylko ed25519 i rsa, a klient SSH rclone wynegocjował ecdsa → „knownhosts: key mismatch”
# i kopie off-site węzła nie działały. Typy wg dokumentacji rclone (https://rclone.org/sftp/#host-key-validation:
# „ssh-keyscan -t dsa,rsa,ecdsa,ed25519”) bez dsa — OpenSSH 9.8+ (EL10) usunęło DSA.
ssh-keyscan -p "$VB_PORT" -t rsa,ecdsa,ed25519 "$VB_HOST" 2>/dev/null > "$KH.nowy" || true
[ -s "$KH.nowy" ] || { rm -f "$KH.nowy"; log "Nie pobrano klucza hosta Storage Boxa ($VB_HOST:$VB_PORT) — sprawdź egress i host."; exit 1; }
mv -f "$KH.nowy" "$KH"; chmod 600 "$KH"
# Przegląd 15.10: `rclone config create … pass "$VB_PASS" …` dawał hasło subkonta i klucze crypt w argumentach procesu
# (widoczne w /proc). Remote'y zapisujemy wprost w pliku konfiguracji rclone (format: https://rclone.org/docs/#config-file),
# hasła zaciemnione przez `rclone obscure -` ze stdin (https://rclone.org/commands/rclone_obscure/), printf to builtin.
RC="$RDIR/rclone.conf"
export RCLONE_CONFIG="$RC"
ob() { printf '%s' "$1" | rclone obscure -; }
O_PASS="$(ob "$VB_PASS")"; O_C1="$(ob "$VB_CRYPT_PASS")"; O_C2="$(ob "$VB_CRYPT_SALT")"
[ -n "$O_PASS" ] && [ -n "$O_C1" ] && [ -n "$O_C2" ] || { log "rclone obscure nie zwrócił wartości — przerywam bez zmian."; exit 1; }
touch "$RC"
# Pozostałe remote'y w pliku zostają; nasze dwie sekcje zastępujemy w całości.
awk '/^\[/{pomin=($0=="[verris-remote]"||$0=="[verris-crypt]")} !pomin' "$RC" > "$RC.nowy"
cat >> "$RC.nowy" <<RCONF
[verris-remote]
type = sftp
host = $VB_HOST
port = $VB_PORT
user = $VB_USER
pass = $O_PASS
known_hosts_file = $KH

[verris-crypt]
type = crypt
remote = verris-remote:$VB_PATH
password = $O_C1
password2 = $O_C2

RCONF
chmod 600 "$RC.nowy" && mv -f "$RC.nowy" "$RC"
unset O_PASS O_C1 O_C2 VB_PASS VB_CRYPT_PASS VB_CRYPT_SALT

# RETENTION_DAYS = domyślna retencja floty (konto bez własnego wyboru). Retencję wybraną przez klienta
# (H-03) node-offsite-backup.sh pobiera co noc z /agent/tasks/backup-retention; obie przycina do 30–90 dni.
cat > "$BCONF" <<CONF
RCLONE_REMOTE="verris-crypt:"
BACKUP_PREFIX="nodes/$(hostname -s)"
RETENTION_DAYS=$VB_RETENTION_DAYS
DA_BACKUP=1
VB_ZRODLO_SHA=$ZRODLO_SHA
CONF
chmod 600 "$BCONF"

if rclone mkdir verris-crypt: >/dev/null 2>&1 && rclone lsd verris-crypt: >/dev/null 2>&1; then
  log "OK: verris-crypt: działa (Storage Box $VB_HOST:$VB_PORT)."
else
  log "Remote utworzony, ale test połączenia nie przeszedł — sprawdź dane Storage Boxa i egress (port $VB_PORT)."
  exit 1
fi
