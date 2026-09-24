#!/usr/bin/env bash
# =============================================================================
# Verris — dostęp SSH do konta hostingowego w klatce CloudLinux CageFS (C-21) i klucze SSH (C-22).
# Uruchamiany przez agenta zadań (SSH_ACCESS) z env:
#   SSH_MODE       enable | disable | keys
#   SSH_DA_USER    login konta DA (z rekordu konta w API)
#   SSH_KEYS_B64   (keys) klucze publiczne, jeden na linię, zakodowane base64 (pusta = usuń wszystkie)
#
# Zasady:
#  - bez CageFS nie włączamy powłoki — SSH poza klatką widziałby system i inne konta;
#  - stan DirectAdmina zostaje spójny: ssh=ON/OFF w user.conf + powłoka w /etc/passwd;
#  - AllowUsers w sshd_config zmieniamy tylko, jeśli ta dyrektywa już istnieje (dopisanie jej
#    od zera odcięłoby wszystkich pozostałych), zawsze z `sshd -t` i przywróceniem kopii przy błędzie;
#  - klucze zapisuje KLIENT (runuser) w bloku Verris w ~/.ssh/authorized_keys; klucze dodane przez
#    klienta ręcznie poza blokiem zostają; każdy klucz sprawdza ssh-keygen, opcje (command=…) odrzucamy.
# Ścieżki SSH_SSHD_CONFIG / SSH_DA_USERS_DIR / SSH_SKIP_CAGEFS dają się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${SSH_MODE:?}"; : "${SSH_DA_USER:?}"

log() { echo "[ssh-access] $*"; }
fail() { log "BŁĄD: $*"; exit 1; }

SSHD_CONFIG="${SSH_SSHD_CONFIG:-/etc/ssh/sshd_config}"
DA_USERS_DIR="${SSH_DA_USERS_DIR:-/usr/local/directadmin/data/users}"
POCZATEK="# BEGIN VERRIS KEYS (zarządzane przez panel — nie edytuj ręcznie)"
KONIEC="# END VERRIS KEYS"

[[ "$SSH_MODE" == "enable" || "$SSH_MODE" == "disable" || "$SSH_MODE" == "keys" ]] || fail "nieznany tryb: $SSH_MODE"
[[ "$SSH_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
id "$SSH_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $SSH_DA_USER"
HOME_DIR="$(getent passwd "$SSH_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"
USER_CONF="$DA_USERS_DIR/$SSH_DA_USER/user.conf"
[ -f "$USER_CONF" ] || fail "brak konfiguracji DirectAdmin konta"

jako_klient() { runuser -u "$SSH_DA_USER" -- "$@"; }

# allow_users add|remove — tylko gdy AllowUsers już jest w sshd_config.
allow_users() {
  local akcja="$1"
  grep -qE '^[[:space:]]*AllowUsers[[:space:]]' "$SSHD_CONFIG" || { log "sshd_config bez AllowUsers — bez zmian"; return 0; }
  local kopia
  kopia="$(mktemp)"
  cp -p "$SSHD_CONFIG" "$kopia"
  python3 - "$SSHD_CONFIG" "$SSH_DA_USER" "$akcja" <<'PY'
import re, sys
path, user, akcja = sys.argv[1], sys.argv[2], sys.argv[3]
linie = open(path).read().split('\n')
pierwsza = True
for i, l in enumerate(linie):
    m = re.match(r'^(\s*AllowUsers)(\s+.*)$', l)
    if not m:
        continue
    tokeny = m.group(2).split()
    tokeny = [t for t in tokeny if t != user]
    if akcja == 'add' and pierwsza:
        tokeny.append(user)
    pierwsza = False
    linie[i] = m.group(1) + ' ' + ' '.join(tokeny) if tokeny else '# ' + l.strip() + '  # (pusta lista po usunięciu — wyłączone przez Verris)'
open(path, 'w').write('\n'.join(linie))
PY
  if command -v sshd >/dev/null 2>&1 && ! sshd -t -f "$SSHD_CONFIG" 2>/dev/null; then
    cp -p "$kopia" "$SSHD_CONFIG"; rm -f "$kopia"
    fail "sshd -t odrzucił zmieniony sshd_config — przywrócono poprzednią wersję"
  fi
  rm -f "$kopia"
  if [ "$SSHD_CONFIG" = "/etc/ssh/sshd_config" ]; then
    systemctl reload sshd >/dev/null 2>&1 || systemctl reload ssh >/dev/null 2>&1 || true
  fi
}

ustaw_user_conf() {
  local wartosc="$1"
  if grep -q '^ssh=' "$USER_CONF"; then
    sed -i "s/^ssh=.*/ssh=$wartosc/" "$USER_CONF"
  else
    echo "ssh=$wartosc" >> "$USER_CONF"
  fi
}

case "$SSH_MODE" in
  enable)
    if [ "${SSH_SKIP_CAGEFS:-0}" != "1" ]; then
      command -v cagefsctl >/dev/null 2>&1 || fail "brak CageFS na węźle — SSH bez klatki jest niedozwolone"
      cagefsctl --enable "$SSH_DA_USER" >/dev/null
      cagefsctl --user-status "$SSH_DA_USER" 2>/dev/null | grep -qi '^enabled' || fail "konto nie jest w klatce CageFS — SSH nie zostaje włączone"
    fi
    ustaw_user_conf ON
    usermod -s /bin/bash "$SSH_DA_USER"
    allow_users add
    log "SSH włączony dla $SSH_DA_USER (klatka CageFS)"
    ;;
  disable)
    usermod -s /bin/false "$SSH_DA_USER"
    ustaw_user_conf OFF
    allow_users remove
    log "SSH wyłączony dla $SSH_DA_USER"
    ;;
  keys)
    KLUCZE="$(printf '%s' "${SSH_KEYS_B64:-}" | base64 -d 2>/dev/null)" || fail "nieprawidłowe dane kluczy"
    TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
    n=0
    while IFS= read -r k; do
      [ -n "$k" ] || continue
      [[ "$k" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\ [A-Za-z0-9+/=]+(\ [^[:cntrl:]]{0,200})?$ ]] || fail "klucz $((n + 1)) ma nieprawidłowy format"
      printf '%s\n' "$k" > "$TMP"
      ssh-keygen -l -f "$TMP" >/dev/null 2>&1 || fail "klucz $((n + 1)) nie jest poprawnym kluczem publicznym"
      n=$((n + 1))
    done <<< "$KLUCZE"
    [ "$n" -le 20 ] || fail "najwyżej 20 kluczy"
    jako_klient sh -c 'umask 077; mkdir -p "$1/.ssh"; touch "$1/.ssh/authorized_keys"' _ "$HOME_DIR"
    OBECNE="$(jako_klient cat "$HOME_DIR/.ssh/authorized_keys")"
    # Treść pliku klienta idzie do Pythona przez zmienne środowiska, nigdy przez tekst programu.
    NOWE="$(OBECNE="$OBECNE" KLUCZE="$KLUCZE" python3 - "$POCZATEK" "$KONIEC" <<'PY'
import os, sys
b, e = sys.argv[1], sys.argv[2]
obecne = os.environ["OBECNE"]
klucze = os.environ["KLUCZE"].strip()
i = obecne.find(b)
j = obecne.find(e, i) if i != -1 else -1
baza = (obecne[:i] + obecne[j + len(e):]) if i != -1 and j != -1 else obecne
baza = baza.strip()
blok = (b + "\n" + klucze + "\n" + e) if klucze else ""
print("\n\n".join(x for x in (blok, baza) if x))
PY
)"
    printf '%s\n' "$NOWE" | jako_klient sh -c 'umask 077; cat > "$1/.ssh/authorized_keys.verris.tmp" && mv -f "$1/.ssh/authorized_keys.verris.tmp" "$1/.ssh/authorized_keys"' _ "$HOME_DIR"
    log "zapisano $n klucz(y) dla $SSH_DA_USER"
    ;;
esac
log "Gotowe."
