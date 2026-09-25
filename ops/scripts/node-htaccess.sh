#!/usr/bin/env bash
# =============================================================================
# Verris — ustawienia strony w .htaccess (B-17 własne strony błędów, B-18 listowanie katalogów,
# G-07 HSTS). Panel zarządza wyłącznie blokiem „# BEGIN Verris … # END Verris” na początku
# domains/<domena>/public_html/.htaccess; reszta pliku (WordPress, reguły klienta) zostaje bez zmian.
# Uruchamiany przez agenta zadań (HTACCESS) z env:
#   HT_MODE      read | write
#   HT_DA_USER   login konta DA
#   HT_DOMAIN    domena konta
#   HT_INDEXES   (write) on | off | default — Options +Indexes / -Indexes / bez wpisu
#   HT_HSTS      (write) 0 | 1 — Strict-Transport-Security na rok (przeglądarki ignorują go po HTTP)
#   HT_E403 / HT_E404 / HT_E500  (write) ścieżka strony błędu w witrynie (/404.html) albo pusta
#   HT_DIR       podkatalog public_html (np. sklep/stary), pusty = public_html (B-03)
#   HT_PHP       (write) wersja PHP katalogu z CloudLinux alt-php, np. 83, albo pusta — wg dokumentacji
#                LiteSpeed (DirectAdmin → PHP): <IfModule LiteSpeed> AddHandler application/x-httpd-alt-php83 .php
# Plik czyta i zapisuje klient (runuser) — dowiązanie symboliczne nie wyprowadzi roota poza konto.
# Po zapisie kontrola strony: gdy serwer zaczyna odpowiadać 5xx, poprzedni plik wraca.
# Wynik: VERRIS_HTACCESS=<base64 JSON {indexes,hsts,e403,e404,e500}>.
# HT_HEALTH_BASE (adres kontroli strony) daje się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${HT_MODE:?}"; : "${HT_DA_USER:?}"; : "${HT_DOMAIN:?}"
: "${HT_INDEXES:=default}"; : "${HT_HSTS:=0}"; : "${HT_E403:=}"; : "${HT_E404:=}"; : "${HT_E500:=}"
: "${HT_DIR:=}"; : "${HT_PHP:=}"

log() { echo "[htaccess] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

SCIEZKA_RE='^/[A-Za-z0-9._~-][A-Za-z0-9._~/-]{0,199}$'
[[ "$HT_MODE" == "read" || "$HT_MODE" == "write" ]] || fail "nieznany tryb: $HT_MODE"
[[ "$HT_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$HT_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"
[[ "$HT_INDEXES" =~ ^(on|off|default)$ ]] || fail "nieprawidłowe ustawienie listowania katalogów"
[[ "$HT_HSTS" =~ ^[01]$ ]] || fail "nieprawidłowe ustawienie HSTS"
for e in "$HT_E403" "$HT_E404" "$HT_E500"; do
  [ -z "$e" ] || { [[ "$e" =~ $SCIEZKA_RE ]] && [[ "$e" != *..* ]] && [[ "$e" != *//* ]]; } || fail "nieprawidłowa ścieżka strony błędu"
done
[ -z "$HT_DIR" ] || { [[ "$HT_DIR" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,9}$ ]] && [[ "/$HT_DIR/" != */../* ]] && [[ "/$HT_DIR/" != */./* ]]; } || fail "nieprawidłowy katalog"
[[ "$HT_PHP" =~ ^([5-8][0-9])?$ ]] || fail "nieprawidłowa wersja PHP"
if [ -n "$HT_PHP" ] && [ "$HT_MODE" = "write" ] && [ ! -x "/opt/alt/php$HT_PHP/usr/bin/php" ]; then
  fail "PHP ${HT_PHP:0:1}.${HT_PHP:1} nie jest zainstalowane na serwerze"
fi
id "$HT_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $HT_DA_USER"
HOME_DIR="$(getent passwd "$HT_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"
DOCROOT="$HOME_DIR/domains/$HT_DOMAIN/public_html"
[ -d "$DOCROOT" ] && [ ! -L "$DOCROOT" ] || fail "brak katalogu strony domains/$HT_DOMAIN/public_html"
KATALOG="$DOCROOT${HT_DIR:+/$HT_DIR}"
if [ -n "$HT_DIR" ]; then
  # Sprawdzane jako klient i po rozwinięciu dowiązań: katalog musi leżeć w public_html tej domeny.
  PRAWDZIWY="$(runuser -u "$HT_DA_USER" -- realpath -e -- "$KATALOG" 2>/dev/null)" || fail "katalog $HT_DIR nie istnieje"
  [[ "$PRAWDZIWY" == "$(realpath -e -- "$DOCROOT")/"* ]] && runuser -u "$HT_DA_USER" -- test -d "$PRAWDZIWY" || fail "katalog $HT_DIR jest poza stroną"
  KATALOG="$PRAWDZIWY"
fi
PLIK="$KATALOG/.htaccess"
HEALTH_BASE="${HT_HEALTH_BASE:-http://127.0.0.1}"

jako_klient() { runuser -u "$HT_DA_USER" -- "$@"; }
http_kod() { curl -s --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 20 -H "Host: $HT_DOMAIN" "$HEALTH_BASE/${HT_DIR:+$HT_DIR/}" 2>/dev/null || true; }

TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf -- "$TMP"' EXIT
: > "$TMP/stary"
if jako_klient test -e "$PLIK"; then
  jako_klient test -f "$PLIK" || fail ".htaccess nie jest zwykłym plikiem"
  jako_klient head -c 1048577 -- "$PLIK" > "$TMP/stary" || fail "nie udało się odczytać .htaccess"
  [ "$(stat -c %s "$TMP/stary")" -le 1048576 ] || fail ".htaccess jest większy niż 1 MB — zmień go w menedżerze plików"
fi

# blok <plik> → JSON ustawień; nowy <plik> <wyjście> → plik z nowym blokiem na początku
PY='
import base64, json, os, re, sys
POCZ, KON = "# BEGIN Verris", "# END Verris"
def rozbij(t):
    lines = t.splitlines()
    try:
        a = lines.index(POCZ); b = lines.index(KON, a)
    except ValueError:
        return [], lines
    return lines[a + 1:b], lines[:a] + lines[b + 1:]
tryb, src = sys.argv[1], sys.argv[2]
tekst = open(src, encoding="utf-8", errors="surrogateescape").read()
blok, reszta = rozbij(tekst)
if tryb == "blok":
    s = {"indexes": "default", "hsts": False, "e403": "", "e404": "", "e500": "", "php": ""}
    for l in blok:
        l = l.strip()
        m = re.fullmatch(r"AddHandler application/x-httpd-alt-php([5-8][0-9]) \.php", l)
        if m: s["php"] = m.group(1)
        elif l == "Options -Indexes": s["indexes"] = "off"
        elif l == "Options +Indexes": s["indexes"] = "on"
        elif l.startswith("Header always set Strict-Transport-Security"): s["hsts"] = True
        else:
            m = re.fullmatch(r"ErrorDocument (403|404|500) (/\S+)", l)
            if m: s["e" + m.group(1)] = m.group(2)
    print(base64.b64encode(json.dumps(s, separators=(",", ":")).encode()).decode())
else:
    e = os.environ
    nowy = []
    if e["HT_INDEXES"] == "off": nowy.append("Options -Indexes")
    if e["HT_INDEXES"] == "on": nowy.append("Options +Indexes")
    if e["HT_HSTS"] == "1":
        nowy += ["<IfModule mod_headers.c>", "Header always set Strict-Transport-Security \"max-age=31536000\"", "</IfModule>"]
    for k in ("403", "404", "500"):
        if e["HT_E" + k]: nowy.append("ErrorDocument %s %s" % (k, e["HT_E" + k]))
    if e.get("HT_PHP"):
        nowy += ["<IfModule LiteSpeed>", "AddHandler application/x-httpd-alt-php%s .php" % e["HT_PHP"], "</IfModule>"]
    while reszta and not reszta[0].strip(): reszta.pop(0)
    wynik = ([POCZ, "# Ustawienia z panelu Verris — zmieniaj je w panelu, nie tutaj."] + nowy + [KON, ""] if nowy else []) + reszta
    out = "\n".join(wynik).rstrip("\n")
    open(sys.argv[3], "w", encoding="utf-8", errors="surrogateescape").write(out + "\n" if out else "")
'
stan() { python3 -c "$PY" blok "$1"; }

if [ "$HT_MODE" = "read" ]; then
  echo "VERRIS_HTACCESS=$(stan "$TMP/stary")"
  log "Gotowe."
  exit 0
fi

HT_INDEXES="$HT_INDEXES" HT_HSTS="$HT_HSTS" HT_E403="$HT_E403" HT_E404="$HT_E404" HT_E500="$HT_E500" HT_PHP="$HT_PHP" \
  python3 -c "$PY" nowy "$TMP/stary" "$TMP/nowy" || fail "nie udało się przygotować .htaccess"

PRZED="$(http_kod)"
zapisz() { jako_klient sh -c 'umask 022; cat > "$1.verris-tmp" && mv -f -- "$1.verris-tmp" "$1"' verris "$PLIK" < "$1"; }
zapisz "$TMP/nowy" || fail "nie udało się zapisać .htaccess"
PO="$(http_kod)"
if [[ "$PO" =~ ^5 ]] && [[ ! "$PRZED" =~ ^5 ]]; then
  zapisz "$TMP/stary" || true
  fail "serwer odrzucił nowe ustawienia (HTTP $PO) — przywróciliśmy poprzedni plik .htaccess"
fi
log "Strona odpowiada: HTTP ${PO:-brak odpowiedzi} (przed zmianą: ${PRZED:-brak odpowiedzi})."
echo "VERRIS_HTACCESS=$(stan "$TMP/nowy")"
log "Gotowe."
