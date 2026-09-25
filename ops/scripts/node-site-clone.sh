#!/usr/bin/env bash
# =============================================================================
# Verris — klonowanie strony między domenami konta (I-13).
# Uruchamiany przez agenta zadań (SITE_CLONE) z env:
#   SC_DA_USER    login konta DA
#   SC_SOURCE     domena źródłowa (domains/<źródło>/public_html)
#   SC_TARGET     domena docelowa (domains/<cel>/public_html)
#   SC_DB_NAME / SC_DB_USER / SC_DB_PASS   nowa baza dla kopii (tworzy API przez DirectAdmina;
#                 tylko gdy źródło to WordPress)
# Docelowy public_html NIE jest kasowany: idzie obok jako public_html.verris-przed-klonem-<czas>.
# WordPress: zrzut bazy źródła → import do nowej bazy, wp-config.php kopii wskazuje nową bazę,
# adresy https://źródło → https://cel (wp search-replace, bezpieczne dla serializacji).
# Wszystko jako KLIENT (su -l, jego PHP). Wynik: VERRIS_KLON_KOPIA=<ścieżka>, VERRIS_KLON_WP=0|1.
# =============================================================================
set -Eeuo pipefail

: "${SC_DA_USER:?}"; : "${SC_SOURCE:?}"; : "${SC_TARGET:?}"
: "${SC_DB_NAME:=}"; : "${SC_DB_USER:=}"; : "${SC_DB_PASS:=}"

log() { echo "[site-clone] $*"; }
# wp-cli w ~/.verris klienta — zapis wyłącznie jako klient. Katalog domowy należy do klienta, więc root
# idący za jego dowiązaniem symbolicznym (curl -o, chmod, chown) nadpisałby albo otworzył dowolny plik
# systemu (np. chmod 644 /etc/shadow). Root tylko pobiera do własnego pliku tymczasowego.
wp_cli_jako_klient() {
  local u="$1" dir="$2" phar="$3" tmp
  runuser -u "$u" -- test -s "$phar" && return 0
  log "Pobieram wp-cli…"
  tmp="$(mktemp)"
  if ! curl -fsSL --retry 3 --retry-delay 2 https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o "$tmp"; then
    rm -f "$tmp"; return 1
  fi
  runuser -u "$u" -- sh -c 'umask 022; mkdir -p "$1" && cat > "$2.tmp" && mv -f "$2.tmp" "$2"' verris "$dir" "$phar" < "$tmp" || { rm -f "$tmp"; return 1; }
  rm -f "$tmp"
}
fail() { log "BŁĄD: $*" >&2; exit 1; }

DOM_RE='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
[[ "$SC_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$SC_SOURCE" =~ $DOM_RE && "$SC_TARGET" =~ $DOM_RE ]] || fail "nieprawidłowa domena"
[ "$SC_SOURCE" != "$SC_TARGET" ] || fail "źródło i cel to ta sama domena"
if [ -n "$SC_DB_NAME" ]; then
  [[ "$SC_DB_NAME" =~ ^[A-Za-z0-9_]{1,64}$ && "$SC_DB_USER" =~ ^[A-Za-z0-9_]{1,64}$ && "$SC_DB_PASS" =~ ^[A-Za-z0-9._~_-]{12,128}$ ]] || fail "nieprawidłowe dane bazy"
fi
id "$SC_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $SC_DA_USER"
HOME_DIR="$(getent passwd "$SC_DA_USER" | cut -d: -f6)"
ZR="$HOME_DIR/domains/$SC_SOURCE/public_html"
CEL_WZGL="domains/$SC_TARGET/public_html"
CEL="$HOME_DIR/$CEL_WZGL"
[ -d "$ZR" ] || fail "brak katalogu strony źródłowej"
[ -d "$HOME_DIR/domains/$SC_TARGET" ] || fail "brak katalogu domeny docelowej"
WP_DIR="$HOME_DIR/.verris"; WP_PHAR="$WP_DIR/wp-cli.phar"
# WordPress bez nowej bazy nie ruszamy celu wcale — kopia wskazywałaby bazę źródła.
if [ -f "$ZR/wp-config.php" ] && [ -z "$SC_DB_NAME" ]; then
  fail "strona źródłowa to WordPress — potrzebna nowa baza (sprawdź WordPress źródła i spróbuj ponownie)"
fi

jako_klient() { su -s /bin/bash -l -c 'cd -- "$1" && shift && exec "$@"' "$SC_DA_USER" -- verris "$HOME_DIR" "$@"; }

# 1. dotychczasowa zawartość celu idzie obok
KOPIA="$CEL_WZGL.verris-przed-klonem-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"
if [ -d "$CEL" ]; then
  jako_klient mv -T -- "$CEL" "$HOME_DIR/$KOPIA" || fail "nie udało się odłożyć plików domeny docelowej"
  echo "VERRIS_KLON_KOPIA=$KOPIA"
fi

# 2. pliki
jako_klient cp -a -- "$ZR" "$CEL" || fail "kopiowanie plików nie powiodło się (brak miejsca?)"
log "pliki skopiowane"

# 3. WordPress
if [ -f "$CEL/wp-config.php" ]; then
  echo "VERRIS_KLON_WP=1"
  wp_cli_jako_klient "$SC_DA_USER" "$WP_DIR" "$WP_PHAR" || fail "nie udało się pobrać wp-cli"
  PHP="$(jako_klient sh -c 'command -v php' 2>/dev/null | head -1)"
  [ -n "$PHP" ] || fail "brak PHP CLI dla konta"
  wp() { jako_klient "$PHP" -d memory_limit=512M -d display_errors=stderr "$WP_PHAR" --skip-plugins --skip-themes "$@"; }
  SQL="$HOME_DIR/.verris/klon-$SC_TARGET.sql"
  jako_klient sh -c 'umask 077; mkdir -p "$1"' _ "$HOME_DIR/.verris"
  wp --path="$ZR" db export "$SQL" --quiet || fail "zrzut bazy źródła nie powiódł się"
  wp --path="$CEL" config set DB_NAME "$SC_DB_NAME" --quiet
  wp --path="$CEL" config set DB_USER "$SC_DB_USER" --quiet
  wp --path="$CEL" config set DB_PASSWORD "$SC_DB_PASS" --quiet
  wp --path="$CEL" db import "$SQL" --quiet || { jako_klient rm -f -- "$SQL"; fail "import bazy do kopii nie powiódł się"; }
  jako_klient rm -f -- "$SQL"
  wp --path="$CEL" search-replace "//$SC_SOURCE" "//$SC_TARGET" --all-tables --skip-columns=guid --quiet || fail "zamiana adresów nie powiodła się"
  wp --path="$CEL" search-replace "//www.$SC_SOURCE" "//www.$SC_TARGET" --all-tables --skip-columns=guid --quiet || true
  log "WordPress: baza skopiowana, adresy zmienione na $SC_TARGET"
else
  echo "VERRIS_KLON_WP=0"
fi
log "Gotowe."
