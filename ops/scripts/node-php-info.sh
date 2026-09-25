#!/usr/bin/env bash
# =============================================================================
# Verris — podgląd konfiguracji PHP strony (B-06, odczyt do B-04): wersja, SAPI, najważniejsze
# dyrektywy php.ini i załadowane rozszerzenia — tak, jak widzi je serwer WWW, nie PHP z konsoli
# (wersja i ustawienia mogą być inne per domena). Skrypt kładzie w katalogu strony plik o losowej
# nazwie (jako klient), pobiera go przez 127.0.0.1 z nagłówkiem Host i od razu usuwa.
# Uruchamiany przez agenta zadań (PHP_INFO) z env:
#   PI_DA_USER   login konta DA
#   PI_DOMAIN    domena konta
# Wynik: VERRIS_PHPINFO=<base64 JSON {wersja,sapi,ini{…},rozszerzenia[…],selektor{wersja,rozszerzenia[{nazwa,stan}]}|null}>.
# PI_HEALTH_BASE / PI_HTTPS_PORT dają się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${PI_DA_USER:?}"; : "${PI_DOMAIN:?}"

log() { echo "[php-info] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$PI_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$PI_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"
id "$PI_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $PI_DA_USER"
HOME_DIR="$(getent passwd "$PI_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"
DOCROOT="$HOME_DIR/domains/$PI_DOMAIN/public_html"
[ -d "$DOCROOT" ] && [ ! -L "$DOCROOT" ] || fail "brak katalogu strony domains/$PI_DOMAIN/public_html"
HTTP_BASE="${PI_HEALTH_BASE:-http://127.0.0.1}"
HTTPS_PORT="${PI_HTTPS_PORT:-443}"

jako_klient() { runuser -u "$PI_DA_USER" -- "$@"; }

NAZWA="verris-info-$(openssl rand -hex 16).php"
PLIK="$DOCROOT/$NAZWA"
trap 'jako_klient rm -f -- "$PLIK" 2>/dev/null || true' EXIT

jako_klient sh -c 'umask 022; cat > "$1"' verris "$PLIK" <<'PHP' || fail "nie udało się zapisać pliku kontrolnego w katalogu strony"
<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
$k = ['memory_limit', 'upload_max_filesize', 'post_max_size', 'max_execution_time', 'max_input_time', 'max_input_vars',
  'display_errors', 'log_errors', 'error_reporting', 'date.timezone', 'default_charset', 'short_open_tag', 'output_buffering',
  'allow_url_fopen', 'file_uploads', 'max_file_uploads', 'session.gc_maxlifetime', 'session.save_handler',
  'opcache.enable', 'opcache.memory_consumption', 'zlib.output_compression', 'disable_functions'];
$ini = [];
foreach ($k as $x) { $v = ini_get($x); $ini[$x] = $v === false ? null : (string) $v; }
$e = get_loaded_extensions();
natcasesort($e);
echo json_encode(['wersja' => PHP_VERSION, 'sapi' => PHP_SAPI, 'ini' => $ini, 'rozszerzenia' => array_values($e)]);
PHP

pobierz() { curl -s --noproxy '*' --max-time 20 "$@" 2>/dev/null || true; }
ODP="$(pobierz -H "Host: $PI_DOMAIN" "$HTTP_BASE/$NAZWA")"
case "$ODP" in
  \{*) ;;
  *) ODP="$(pobierz -k --resolve "$PI_DOMAIN:$HTTPS_PORT:127.0.0.1" "https://$PI_DOMAIN:$HTTPS_PORT/$NAZWA")" ;;
esac

# B-04 — rozszerzenia z CloudLinux PHP Selector (oficjalna dokumentacja CloudLinux, selectorctl):
# --user-current --user=U → "8.3 8.3.x /opt/alt/php83/…" (albo "native"), --list-user-extensions --version=V --user=U --all
# → linie "+ nazwa" (włączone), "- nazwa" (wyłączone), "~ nazwa" (wbudowane / z konfiguracji globalnej).
SEL_WERSJA=""; SEL_EXT=""
if command -v selectorctl >/dev/null 2>&1; then
  SEL_WERSJA="$(selectorctl --user-current --user="$PI_DA_USER" 2>/dev/null | awk 'NR==1{print $1}' || true)"
  if [[ "$SEL_WERSJA" =~ ^[0-9]+\.[0-9]+$ ]]; then
    SEL_EXT="$(selectorctl --list-user-extensions --version="$SEL_WERSJA" --user="$PI_DA_USER" --all 2>/dev/null || true)"
  else
    SEL_WERSJA=""
  fi
fi

WYNIK="$(ODP="$ODP" SEL_WERSJA="$SEL_WERSJA" SEL_EXT="$SEL_EXT" python3 - <<'PY'
import base64, json, os, re
try:
    j = json.loads(os.environ["ODP"])
except ValueError:
    raise SystemExit(1)
if not isinstance(j, dict) or not isinstance(j.get("wersja"), str):
    raise SystemExit(1)
ini = j.get("ini") if isinstance(j.get("ini"), dict) else {}
out = {
    "wersja": j["wersja"][:40],
    "sapi": str(j.get("sapi", ""))[:40],
    "ini": {str(k)[:60]: (None if v is None else str(v)[:2000]) for k, v in list(ini.items())[:40]},
    "rozszerzenia": [str(x)[:60] for x in (j.get("rozszerzenia") or []) if re.fullmatch(r"[A-Za-z0-9_ .+-]{1,60}", str(x))][:300],
}
stany = {"+": "on", "-": "off", "\u2013": "off", "~": "wbudowane"}
sel = []
for linia in os.environ.get("SEL_EXT", "").splitlines():
    m = re.fullmatch(r"\s*([+~\u2013-])\s+([A-Za-z0-9_]{1,40})\s*", linia)
    if m:
        sel.append({"nazwa": m.group(2), "stan": stany[m.group(1)]})
out["selektor"] = {"wersja": os.environ["SEL_WERSJA"], "rozszerzenia": sel[:300]} if os.environ.get("SEL_WERSJA") and sel else None
print(base64.b64encode(json.dumps(out, separators=(",", ":")).encode()).decode())
PY
)" || fail "strona nie zwróciła konfiguracji PHP — sprawdź, czy domena działa i nie ma blokady hasłem albo reguły w .htaccess dla plików .php"

echo "VERRIS_PHPINFO=$WYNIK"
log "Gotowe."
