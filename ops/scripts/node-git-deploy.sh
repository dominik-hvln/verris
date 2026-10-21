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
#   GD_BUILD     (clone/pull, opcjonalnie) '' | npm-build | npm-ci | composer — budowanie po pobraniu kodu
#   GD_ENV_B64   (clone/pull, opcjonalnie) zmienne środowiskowe z panelu: base64 z liniami KLUCZ=wartość → <repo>/.env
#   GD_ENV_MODE  (clone/pull, opcjonalnie) panel = .env zarządza panel (pusta lista → usuwa .env z nagłówkiem panelu)
# Wszystko jako KLIENT (runuser). Klucz wdrożeniowy: ~/.ssh/verris_deploy (ed25519) — klient
# dodaje część publiczną w GitHub/GitLab jako „deploy key” (tylko odczyt).
# clone do niepustego katalogu: dotychczasowa zawartość idzie do <katalog>.verris-przed-git-<czas>.
# Wynik: VERRIS_GIT_KLUCZ=<klucz publiczny>, VERRIS_GIT_HEAD=<sha> <temat>,
#        VERRIS_GIT_KOPIA=<ścieżka względna kopii>, VERRIS_GIT_ENV=<liczba zmiennych>|brak,
#        VERRIS_GIT_BUILD=ok|blad|brak, VERRIS_GIT_BUILD_S=<sekundy budowania>.
# Po każdym clone/pull: .git dostaje 0700 — repozytorium leży w katalogu publicznym strony i bez tego
# https://domena/.git/ (pełny kod z historią) byłby do pobrania przez każdego.
# =============================================================================
set -Eeuo pipefail

: "${GD_MODE:?}"; : "${GD_DA_USER:?}"; : "${GD_DOMAIN:?}"; : "${GD_DIR:=}"; : "${GD_URL:=}"; : "${GD_BRANCH:=}"
: "${GD_BUILD:=}"; : "${GD_ENV_B64:=}"; : "${GD_ENV_MODE:=}"

log() { echo "[git-deploy] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$GD_MODE" =~ ^(key|clone|pull)$ ]] || fail "nieznany tryb: $GD_MODE"
[[ "$GD_BUILD" =~ ^(|npm-build|npm-ci|composer)$ ]] || fail "nieznany sposób budowania: $GD_BUILD"
[[ "$GD_ENV_B64" =~ ^[A-Za-z0-9+/=]*$ ]] || fail "uszkodzone zmienne środowiskowe — zapisz je ponownie w panelu"
[[ "$GD_ENV_MODE" =~ ^(|panel)$ ]] || fail "nieznany tryb zmiennych: $GD_ENV_MODE"
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

# ConnectTimeout: bez niego zablokowany port wisi ~2 min na próbę, zanim git zwróci błąd.
SSH_CMD="ssh -i $KLUCZ -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=20"
jako_klient() { runuser -u "$GD_DA_USER" -- env HOME="$HOME_DIR" GIT_SSH_COMMAND="$SSH_CMD" GIT_TERMINAL_PROMPT=0 "$@"; }

# Egress węzła (security-egress-lockdown.sh) wpuszcza TCP/22 tylko dla roota — konta klientów nie
# połączą się z git@github.com:22. GitHub, GitLab.com i Bitbucket mają oficjalny SSH na porcie 443:
#   https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port
#   https://about.gitlab.com/blog/gitlab-dot-com-now-supports-an-alternate-git-plus-ssh-port/
#   https://support.atlassian.com/bitbucket-cloud/kb/port-22-is-blocked-on-local-network
adres_443() {
  local u="$1"
  case "$u" in
    git@github.com:*) echo "ssh://git@ssh.github.com:443/${u#git@github.com:}" ;;
    git@gitlab.com:*) echo "ssh://git@altssh.gitlab.com:443/${u#git@gitlab.com:}" ;;
    git@bitbucket.org:*) echo "ssh://git@altssh.bitbucket.org:443/${u#git@bitbucket.org:}" ;;
    *) echo "$u" ;;
  esac
}
# Klucz i adres zapisane w .git/config repozytorium — tak samo działa „git pull” z harmonogramu (cron).
utrwal_repo() {
  jako_klient git -C "$CEL" config core.sshCommand "$SSH_CMD"
  local teraz nowy
  teraz="$(jako_klient git -C "$CEL" remote get-url origin 2>/dev/null || true)"
  nowy="$(adres_443 "$teraz")"
  if [ -n "$teraz" ] && [ "$nowy" != "$teraz" ]; then jako_klient git -C "$CEL" remote set-url origin "$nowy"; fi
}
# git@inny-host: — port 22 zablokowany; mówimy to wprost zamiast „sprawdź klucz”.
blad_git() {
  if grep -q 'port 22: Connection timed out' <<<"$1"; then
    fail "serwer repozytorium wymaga połączenia na porcie 22, które jest zablokowane — użyj adresu https://… albo GitHub, GitLab.com lub Bitbucket"
  fi
  fail "$2"
}
command -v git >/dev/null 2>&1 || fail "Git nie jest zainstalowany na serwerze — napisz do nas"

# Repozytorium leży w katalogu publicznym strony: .git tylko dla właściciela konta (serwer WWW do niego nie wejdzie),
# a .env z panelu poza „git status”, żeby nie blokował „git pull”. Działa też dla repozytoriów sklonowanych wcześniej.
zabezpiecz_repo() {
  jako_klient chmod 0700 "$CEL/.git" || fail "nie udało się zabezpieczyć katalogu .git"
  if ! jako_klient grep -qxF '/.env' "$CEL/.git/info/exclude" 2>/dev/null; then
    jako_klient sh -c 'mkdir -p "$1/.git/info" && printf "%s\n" "/.env" >> "$1/.git/info/exclude"' _ "$CEL" \
      || fail "nie udało się zapisać .git/info/exclude"
  fi
}

# Zmienne z panelu → <repo>/.env (0600: czyta je tylko konto, serwer WWW nie poda pliku). Linie i cudzysłowy składa API.
# Pierwsza linia to nagłówek panelu — usuwamy tylko taki .env (gdy klient skasuje w panelu wszystkie zmienne), nigdy własny.
NAGLOWEK_ENV="# Plik zarządzany przez panel Verris (Git → Budowanie i zmienne). Zmiany wprowadzaj w panelu."
zapisz_env() {
  if [ -z "$GD_ENV_B64" ]; then
    if [ "$GD_ENV_MODE" = panel ] && jako_klient test -f "$CEL/.env" \
      && [ "$(jako_klient head -n 1 "$CEL/.env" 2>/dev/null)" = "$NAGLOWEK_ENV" ]; then
      jako_klient rm -f -- "$CEL/.env" || fail "nie udało się usunąć pliku .env"
      echo "VERRIS_GIT_ENV=0"; return 0
    fi
    echo "VERRIS_GIT_ENV=brak"; return 0
  fi
  local tresc n=0 l
  tresc="$(printf '%s' "$GD_ENV_B64" | base64 -d 2>/dev/null)" || fail "uszkodzone zmienne środowiskowe — zapisz je ponownie w panelu"
  while IFS= read -r l; do
    [ -z "$l" ] && continue
    [[ "$l" =~ ^[A-Z_][A-Z0-9_]{0,63}=.*$ ]] || fail "nieprawidłowa zmienna środowiskowa — zapisz je ponownie w panelu"
    n=$((n + 1))
  done <<<"$tresc"
  if jako_klient git -C "$CEL" ls-files --error-unmatch .env >/dev/null 2>&1; then
    fail "plik .env jest w repozytorium — usuń go z repozytorium (git rm --cached .env) albo usuń zmienne w panelu"
  fi
  printf '%s\n%s\n' "$NAGLOWEK_ENV" "$tresc" | jako_klient sh -c 'umask 077; cat > "$1/.env.verris-nowy" && mv -f "$1/.env.verris-nowy" "$1/.env"' _ "$CEL" \
    || fail "nie udało się zapisać pliku .env"
  jako_klient chmod 0600 "$CEL/.env"
  echo "VERRIS_GIT_ENV=$n"
}

# Budowanie po pobraniu kodu — jako klient, z niskim priorytetem CPU/dysku i limitem 15 minut (jak optymalizacja obrazów).
# Node.js z CloudLinux (/opt/alt/alt-nodejs<wersja>, ten sam co w aplikacjach Node w panelu), composer z profilu hostingu.
fail_build() { echo "VERRIS_GIT_BUILD=blad"; fail "$1"; }
buduj_jako_klient() {
  local sciezka="$1"; shift
  runuser -u "$GD_DA_USER" -- env -i HOME="$HOME_DIR" PATH="$sciezka:/usr/local/bin:/usr/bin:/bin" LANG=C.UTF-8 CI=1 \
    timeout 900 nice -n 19 ionice -c3 "$@"
}
zbuduj() {
  if [ -z "$GD_BUILD" ]; then echo "VERRIS_GIT_BUILD=brak"; return 0; fi
  local start=$SECONDS kod=0 wyj sciezka=""
  case "$GD_BUILD" in
    npm-build|npm-ci)
      jako_klient test -f "$CEL/package.json" || fail_build "brak package.json w katalogu repozytorium"
      jako_klient test -f "$CEL/package-lock.json" -o -f "$CEL/npm-shrinkwrap.json" \
        || fail_build "npm ci wymaga pliku package-lock.json w repozytorium"
      sciezka="$(ls -d "${VERRIS_ALT_ROOT:-/opt/alt}"/alt-nodejs*/root/usr/bin 2>/dev/null | sort -V | tail -n 1 || true)"
      [ -n "$sciezka" ] && [ -x "$sciezka/npm" ] || fail_build "Node.js nie jest dostępny na serwerze — napisz do nas"
      if [ "$GD_BUILD" = npm-build ]; then
        wyj="$(buduj_jako_klient "$sciezka" bash -c 'cd "$1" && npm ci --no-audit --no-fund && npm run build --if-present' _ "$CEL" 2>&1)" || kod=$?
      else
        wyj="$(buduj_jako_klient "$sciezka" bash -c 'cd "$1" && npm ci --omit=dev --no-audit --no-fund' _ "$CEL" 2>&1)" || kod=$?
      fi
      ;;
    composer)
      jako_klient test -f "$CEL/composer.json" || fail_build "brak composer.json w katalogu repozytorium"
      [ -x /usr/local/bin/composer ] || fail_build "Composer nie jest dostępny na serwerze — napisz do nas"
      wyj="$(buduj_jako_klient "/usr/local/bin" bash -c 'cd "$1" && composer install --no-dev --optimize-autoloader --no-interaction --no-progress' _ "$CEL" 2>&1)" || kod=$?
      ;;
  esac
  tail -n 60 <<<"$wyj"
  echo "VERRIS_GIT_BUILD_S=$((SECONDS - start))"
  if [ "$kod" -eq 124 ]; then fail_build "budowanie przekroczyło 15 minut i zostało przerwane — kod strony jest już w nowej wersji"; fi
  if [ "$kod" -ne 0 ]; then fail_build "budowanie nie powiodło się (kod $kod) — szczegóły w logu wdrożenia; kod strony jest już w nowej wersji"; fi
  echo "VERRIS_GIT_BUILD=ok"
}

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
    BLAD_KLON="klonowanie nie powiodło się — sprawdź adres i czy klucz wdrożeniowy jest dodany w repozytorium"
    if ! WYJ="$(jako_klient git clone --depth 50 ${GD_BRANCH:+--branch "$GD_BRANCH"} -- "$(adres_443 "$GD_URL")" "$CEL" 2>&1)"; then
      tail -n 20 <<<"$WYJ"; blad_git "$WYJ" "$BLAD_KLON"
    fi
    tail -n 20 <<<"$WYJ"
    jako_klient test -d "$CEL/.git" || fail "$BLAD_KLON"
    utrwal_repo
    zabezpiecz_repo
    zapisz_env
    zbuduj
    ;;
  pull)
    jako_klient test -d "$CEL/.git" || fail "w tym katalogu nie ma repozytorium — najpierw sklonuj"
    utrwal_repo
    zabezpiecz_repo
    if ! WYJ="$(jako_klient git -C "$CEL" pull --ff-only 2>&1)"; then
      tail -n 30 <<<"$WYJ"; blad_git "$WYJ" "pobieranie zmian nie powiodło się (lokalne zmiany albo rozjechana historia)"
    fi
    tail -n 30 <<<"$WYJ"
    zapisz_env
    zbuduj
    ;;
esac
if [ "$GD_MODE" != "key" ]; then
  echo "VERRIS_GIT_HEAD=$(jako_klient git -C "$CEL" log -1 --format='%h %s' | tr '|' '/' | head -c 200)"
fi
log "Gotowe."
