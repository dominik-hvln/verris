#!/usr/bin/env bash
# =============================================================================
# Verris — repozytorium Git strony (C-25 klonowanie z panelu, C-26 „pobierz zmiany teraz”).
# Uruchamiany przez agenta zadań (GIT_DEPLOY) z env:
#   GD_MODE      key | clone | pull
#   GD_DA_USER   login konta DA
#   GD_DOMAIN    domena; katalog domains/<domena>/public_html[/<GD_DIR>]
#   GD_DIR       (opcjonalnie) podkatalog w public_html
#   GD_URL       (clone) https://… albo git@host:ścieżka
#   GD_BRANCH    (clone, opcjonalnie) gałąź
# Wszystko jako KLIENT (runuser). Klucz wdrożeniowy: ~/.ssh/verris_deploy (ed25519) — klient
# dodaje część publiczną w GitHub/GitLab jako „deploy key” (tylko odczyt).
# clone do niepustego katalogu: dotychczasowa zawartość idzie do <katalog>.verris-przed-git-<czas>.
# Wynik: VERRIS_GIT_KLUCZ=<klucz publiczny>, VERRIS_GIT_HEAD=<sha> <temat>,
#        VERRIS_GIT_KOPIA=<ścieżka względna kopii>.
# =============================================================================
set -Eeuo pipefail

: "${GD_MODE:?}"; : "${GD_DA_USER:?}"; : "${GD_DOMAIN:?}"; : "${GD_DIR:=}"; : "${GD_URL:=}"; : "${GD_BRANCH:=}"

log() { echo "[git-deploy] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$GD_MODE" =~ ^(key|clone|pull)$ ]] || fail "nieznany tryb: $GD_MODE"
[[ "$GD_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$GD_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"
if [ -n "$GD_DIR" ]; then
  [[ "$GD_DIR" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ && "$GD_DIR" != *..* ]] || fail "nieprawidłowy katalog"
fi
id "$GD_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $GD_DA_USER"
HOME_DIR="$(getent passwd "$GD_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR/domains/$GD_DOMAIN/public_html" ] || fail "brak katalogu strony domains/$GD_DOMAIN/public_html"
CEL_WZGL="domains/$GD_DOMAIN/public_html${GD_DIR:+/$GD_DIR}"
CEL="$HOME_DIR/$CEL_WZGL"
KLUCZ="$HOME_DIR/.ssh/verris_deploy"

jako_klient() { runuser -u "$GD_DA_USER" -- env HOME="$HOME_DIR" \
  GIT_SSH_COMMAND="ssh -i $KLUCZ -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes" \
  GIT_TERMINAL_PROMPT=0 "$@"; }
command -v git >/dev/null 2>&1 || fail "Git nie jest zainstalowany na serwerze — napisz do nas"

case "$GD_MODE" in
  key)
    if ! jako_klient test -f "$KLUCZ"; then
      jako_klient sh -c 'umask 077; mkdir -p "$1/.ssh"' _ "$HOME_DIR"
      jako_klient ssh-keygen -q -t ed25519 -N "" -C "verris-deploy@$GD_DOMAIN" -f "$KLUCZ" || fail "nie udało się utworzyć klucza"
      log "utworzono klucz wdrożeniowy"
    fi
    echo "VERRIS_GIT_KLUCZ=$(jako_klient cat "$KLUCZ.pub")"
    ;;
  clone)
    [[ "$GD_URL" =~ ^(https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/[A-Za-z0-9._/~-]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+)$ ]] || fail "nieprawidłowy adres repozytorium (https://… albo git@host:ścieżka)"
    if [ -n "$GD_BRANCH" ]; then
      [[ "$GD_BRANCH" =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]{0,99}$ && "$GD_BRANCH" != *..* ]] || fail "nieprawidłowa nazwa gałęzi"
    fi
    if jako_klient test -d "$CEL/.git"; then fail "w tym katalogu już jest repozytorium — użyj „Pobierz zmiany”"; fi
    if jako_klient test -d "$CEL" && [ -n "$(jako_klient ls -A "$CEL" 2>/dev/null)" ]; then
      KOPIA="$CEL_WZGL.verris-przed-git-$(date +%Y%m%d-%H%M%S)"
      jako_klient mv -- "$CEL" "$HOME_DIR/$KOPIA" || fail "nie udało się odłożyć dotychczasowych plików"
      log "dotychczasowe pliki przeniesione do ~/$KOPIA"
      echo "VERRIS_GIT_KOPIA=$KOPIA"
    fi
    if ! jako_klient git clone --depth 50 ${GD_BRANCH:+--branch "$GD_BRANCH"} -- "$GD_URL" "$CEL" 2>&1 | tail -n 20; then
      fail "klonowanie nie powiodło się — sprawdź adres i czy klucz wdrożeniowy jest dodany w repozytorium"
    fi
    jako_klient test -d "$CEL/.git" || fail "klonowanie nie powiodło się — sprawdź adres i czy klucz wdrożeniowy jest dodany w repozytorium"
    ;;
  pull)
    jako_klient test -d "$CEL/.git" || fail "w tym katalogu nie ma repozytorium — najpierw sklonuj"
    jako_klient git -C "$CEL" pull --ff-only 2>&1 | tail -n 30 || fail "pobieranie zmian nie powiodło się (lokalne zmiany albo rozjechana historia)"
    ;;
esac
if [ "$GD_MODE" != "key" ]; then
  echo "VERRIS_GIT_HEAD=$(jako_klient git -C "$CEL" log -1 --format='%h %s' | tr '|' '/' | head -c 200)"
fi
log "Gotowe."
