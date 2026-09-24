#!/usr/bin/env bash
# =============================================================================
# Verris — aktualizacje WordPressa domeny (I-04 automatyczne, I-05 z panelu).
# Uruchamiany przez agenta zadań (WP_UPDATE) z env:
#   WPU_MODE      check | update | cache | harden
#   WPU_DA_USER   login konta DA (z rekordu konta w API)
#   WPU_DOMAIN    domena; WordPress w domains/<domena>/public_html
#   WPU_CORE      (update) none | minor | all
#   WPU_PLUGINS   (update) pusta = bez wtyczek, „*” = wszystkie z aktualizacją, albo slug,slug
#   WPU_THEMES    (update) jak WPU_PLUGINS, dla motywów
#   WPU_HARDEN    (harden) file-edit | debug-off | maintenance-on | maintenance-off — I-08: wyłączenie edytora plików w kokpicie,
#                 I-15: tryb konserwacji (wp maintenance-mode),
#                 wyłączenie WP_DEBUG (wp-config.php)
#   WPU_CACHE     (cache) on | off | purge — wtyczka LiteSpeed Cache (J-02): włączenie z kontrolą
#                 strony (5xx po włączeniu → wyłączamy z powrotem), wyłączenie, wyczyszczenie cache;
#                 redis-on | redis-off — cache obiektowy Redis (J-03) przez wtyczkę Redis Object Cache
#                 i gniazdo konta ~/.verris-redis/redis.sock (włączane osobno, node-redis.sh)
#
# Kolejność przy update:
#   1. kopia: pliki strony + zrzut bazy → ~/backups/verris-wp-<domena>-<czas>.tar.gz (dwie ostatnie
#      zostają; archiwum widać też w podglądzie kopii H-10). Bez kopii nie aktualizujemy.
#   2. aktualizacja przez wp-cli (z --skip-plugins/--skip-themes — zepsuta wtyczka nie blokuje
#      naprawy), potem `core update-db`;
#   3. kontrola: strona odpowiadała przed (kod < 500), a po aktualizacji zwraca 5xx albo nic →
#      przywracamy pliki i bazę z kopii z kroku 1 i zgłaszamy błąd.
# Wszystko jako KLIENT (su -l, w jego klatce CageFS i jego wersją PHP).
# Wynik dla API: VERRIS_WP_PRZED= / VERRIS_WP_PO= (base64 JSON stanu), VERRIS_WP_BRAK=1 gdy
# w katalogu nie ma WordPressa, VERRIS_WPU_WYCOFANO=1 gdy zadziałało wycofanie.
# ponytail: tylko WordPress w katalogu głównym domeny; instalacje w podkatalogach — gdy ktoś zapyta.
# WPU_HEALTH_BASE (adres kontroli strony) daje się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${WPU_MODE:?}"; : "${WPU_DA_USER:?}"; : "${WPU_DOMAIN:?}"
: "${WPU_CORE:=none}"; : "${WPU_PLUGINS:=}"; : "${WPU_THEMES:=}"; : "${WPU_CACHE:=}"; : "${WPU_HARDEN:=}"

log() { echo "[wp-update] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$WPU_MODE" =~ ^(check|update|cache|harden)$ ]] || fail "nieznany tryb: $WPU_MODE"
[ "$WPU_MODE" != "harden" ] || [[ "$WPU_HARDEN" =~ ^(file-edit|debug-off|maintenance-on|maintenance-off)$ ]] || fail "nieprawidłowa operacja zabezpieczeń"
[ "$WPU_MODE" != "cache" ] || [[ "$WPU_CACHE" =~ ^(on|off|purge|redis-on|redis-off)$ ]] || fail "nieprawidłowa operacja cache"
[[ "$WPU_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$WPU_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail "nieprawidłowa domena"
[[ "$WPU_CORE" == "none" || "$WPU_CORE" == "minor" || "$WPU_CORE" == "all" ]] || fail "nieprawidłowy zakres aktualizacji rdzenia"
LISTA_RE='^(\*|[a-z0-9][a-z0-9._-]{0,99}(,[a-z0-9][a-z0-9._-]{0,99}){0,199})?$'
[[ "$WPU_PLUGINS" =~ $LISTA_RE ]] || fail "nieprawidłowa lista wtyczek"
[[ "$WPU_THEMES" =~ $LISTA_RE ]] || fail "nieprawidłowa lista motywów"
id "$WPU_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $WPU_DA_USER"

HOME_DIR="$(getent passwd "$WPU_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"
DOCROOT_WZGL="domains/$WPU_DOMAIN/public_html"
DOCROOT="$HOME_DIR/$DOCROOT_WZGL"
[ -d "$DOCROOT" ] || fail "brak katalogu strony $DOCROOT_WZGL"
WP_DIR="$HOME_DIR/.verris"
WP_PHAR="$WP_DIR/wp-cli.phar"
HEALTH_BASE="${WPU_HEALTH_BASE:-http://127.0.0.1}"
ZNACZNIK_KONSERWACJI="verris-konserwacja"

# jako_klient <polecenie> [arg…] — powłoka logowania klienta (klatka, PHP z selektora), argumenty
# przekazane pozycyjnie, nigdy wklejane w tekst polecenia.
jako_klient() { su -s /bin/bash -l -c 'cd -- "$1" && shift && exec "$@"' "$WPU_DA_USER" -- verris "$HOME_DIR" "$@"; }

ensure_wp_cli() {
  if [ ! -s "$WP_PHAR" ]; then
    log "Pobieram wp-cli…"
    mkdir -p "$WP_DIR"
    curl -fsSL --retry 3 --retry-delay 2 https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o "$WP_PHAR.tmp"
    mv "$WP_PHAR.tmp" "$WP_PHAR"
  fi
  chown -R "$WPU_DA_USER:$(id -gn "$WPU_DA_USER")" "$WP_DIR"
  chmod 755 "$WP_DIR"; chmod 644 "$WP_PHAR"
}

resolve_user_php() {
  local p
  p="$(jako_klient sh -c 'command -v php' 2>/dev/null | head -1 || true)"
  [ -n "$p" ] && { echo "$p"; return 0; }
  for p in /usr/local/bin/php /usr/bin/php /opt/alt/php*/usr/bin/php; do
    [ -x "$p" ] && jako_klient test -x "$p" 2>/dev/null && { echo "$p"; return 0; }
  done
  fail "brak PHP CLI dla konta (CageFS / alt-php)"
}

wp() {
  jako_klient "$WP_PHP" -d memory_limit=512M -d max_execution_time=900 -d display_errors=stderr \
    "$WP_PHAR" --path="$DOCROOT" --skip-plugins --skip-themes "$@"
}

# Z wczytanymi wtyczkami — tylko do poleceń samej wtyczki (np. litespeed-purge).
wp_z_wtyczkami() {
  jako_klient "$WP_PHP" -d memory_limit=512M -d max_execution_time=900 -d display_errors=stderr \
    "$WP_PHAR" --path="$DOCROOT" --skip-themes "$@"
}

http_kod() {
  curl -s --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 25 -H "Host: $WPU_DOMAIN" "$HEALTH_BASE/" 2>/dev/null || true
}

# stan → base64 JSON: {"version","core":[…],"plugins":[…],"themes":[…]}
stan() {
  local wersja core wtyczki motywy
  wersja="$(wp core version 2>/dev/null)" || fail "wp-cli nie odczytał wersji WordPressa"
  core="$(wp core check-update --format=json 2>/dev/null || true)"
  wtyczki="$(wp plugin list --format=json --fields=name,title,status,version,update,update_version 2>/dev/null || echo '[]')"
  motywy="$(wp theme list --format=json --fields=name,title,status,version,update,update_version 2>/dev/null || echo '[]')"
  WERSJA="$wersja" CORE="$core" WTYCZKI="$wtyczki" MOTYWY="$motywy" python3 - <<'PY'
import base64, json, os
def j(k):
    try:
        v = json.loads(os.environ[k] or "[]")
        return v if isinstance(v, list) else []
    except ValueError:
        return []
out = {"version": os.environ["WERSJA"].strip(), "core": j("CORE"), "plugins": j("WTYCZKI"), "themes": j("MOTYWY")}
print(base64.b64encode(json.dumps(out, separators=(",", ":")).encode()).decode())
PY
}

ensure_wp_cli
WP_PHP="$(resolve_user_php)"
wp --version >/dev/null 2>&1 || fail "wp-cli nie uruchamia się (PHP / CageFS)"

if ! wp core is-installed >/dev/null 2>&1; then
  log "w $DOCROOT_WZGL nie ma zainstalowanego WordPressa"
  echo "VERRIS_WP_BRAK=1"
  exit 0
fi

PRZED="$(stan)"
echo "VERRIS_WP_PRZED=$PRZED"
# I-08 — przegląd zabezpieczeń (tylko przy sprawdzeniu; weryfikacja sum kontrolnych trwa chwilę).
zabezpieczenia() {
  local edit debug admin perm sumy konserwacja
  edit="$(wp config get DISALLOW_FILE_EDIT 2>/dev/null || echo '')"
  debug="$(wp config get WP_DEBUG 2>/dev/null || echo '')"
  if wp user get admin --field=ID >/dev/null 2>&1; then admin=1; else admin=0; fi
  perm="$(stat -c '%a' "$DOCROOT/wp-config.php" 2>/dev/null || echo '')"
  if wp core verify-checksums >/dev/null 2>&1; then sumy=ok; else sumy=zmienione; fi
  konserwacja=0
  if [ -f "$DOCROOT/.maintenance" ] && { grep -q 'time()' "$DOCROOT/.maintenance" || [ -n "$(find "$DOCROOT/.maintenance" -mmin -10)" ]; }; then konserwacja=1; fi
  KONSERWACJA="$konserwacja" EDIT="$edit" DEBUG="$debug" ADMIN="$admin" PERM="$perm" SUMY="$sumy" python3 - <<'PY'
import base64, json, os
prawda = lambda v: v.strip().lower() in ("1", "true")
out = {
    "edytorPlikow": not prawda(os.environ["EDIT"]),
    "debug": prawda(os.environ["DEBUG"]),
    "uzytkownikAdmin": os.environ["ADMIN"] == "1",
    "uprawnieniaConfig": os.environ["PERM"][:4],
    "sumyRdzenia": os.environ["SUMY"],
    "konserwacja": os.environ["KONSERWACJA"] == "1",
}
print(base64.b64encode(json.dumps(out, separators=(",", ":")).encode()).decode())
PY
}

if [ "$WPU_MODE" = "check" ]; then
  echo "VERRIS_WP_ZABEZPIECZENIA=$(zabezpieczenia)"
  log "Gotowe."
  exit 0
fi

if [ "$WPU_MODE" = "harden" ]; then
  case "$WPU_HARDEN" in
    file-edit) wp config set DISALLOW_FILE_EDIT true --raw --quiet || fail "nie udało się zapisać wp-config.php" ;;
    debug-off) wp config set WP_DEBUG false --raw --quiet || fail "nie udało się zapisać wp-config.php" ;;
    maintenance-on)
      # „$upgrading = time()” liczone przy każdym wejściu — WordPress nie wyłączy trybu po 10 minutach,
      # jak przy pliku z wp maintenance-mode. Polska strona przerwy tylko, gdy klient nie ma własnej.
      jako_klient sh -c 'umask 022; printf "%s\n" "<?php \$upgrading = time(); // $2 ?>" > "$1/.maintenance"' verris "$DOCROOT_WZGL" "$ZNACZNIK_KONSERWACJI" \
        || fail "nie udało się włączyć trybu konserwacji"
      if [ -d "$DOCROOT/wp-content" ] && [ ! -e "$DOCROOT/wp-content/maintenance.php" ] && [ ! -L "$DOCROOT/wp-content/maintenance.php" ]; then
        printf '%s\n' "<?php // $ZNACZNIK_KONSERWACJI" \
          "http_response_code(503); header('Retry-After: 3600'); header('Content-Type: text/html; charset=utf-8'); ?>" \
          '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Przerwa techniczna</title></head>' \
          '<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f6f3;color:#1c1c1a"><main style="max-width:32rem;padding:2rem;text-align:center"><h1 style="font-size:1.5rem">Trwa przerwa techniczna</h1><p>Wprowadzamy zmiany na stronie. Zajrzyj ponownie za chwilę.</p></main></body></html>' \
          | jako_klient sh -c 'umask 022; cat > "$1/wp-content/maintenance.php"' verris "$DOCROOT_WZGL" || true
      fi
      ;;
    maintenance-off)
      jako_klient rm -f -- "$DOCROOT_WZGL/.maintenance" || fail "nie udało się wyłączyć trybu konserwacji"
      if [ -f "$DOCROOT/wp-content/maintenance.php" ] && [ ! -L "$DOCROOT/wp-content/maintenance.php" ] \
        && grep -qF "$ZNACZNIK_KONSERWACJI" "$DOCROOT/wp-content/maintenance.php"; then
        jako_klient rm -f -- "$DOCROOT_WZGL/wp-content/maintenance.php" || true
      fi
      ;;
  esac
  echo "VERRIS_WP_ZABEZPIECZENIA=$(zabezpieczenia)"
  log "Gotowe."
  exit 0
fi

if [ "$WPU_MODE" = "cache" ]; then
  LSC="litespeed-cache"
  case "$WPU_CACHE" in
    on)
      KOD_PRZED="$(http_kod)"
      wp plugin is-installed "$LSC" >/dev/null 2>&1 || wp plugin install "$LSC" || fail "nie udało się zainstalować wtyczki LiteSpeed Cache"
      wp plugin activate "$LSC" || fail "nie udało się włączyć wtyczki LiteSpeed Cache"
      KOD_PO="$(http_kod)"
      log "kontrola strony: przed=$KOD_PRZED po=$KOD_PO"
      if [[ "$KOD_PRZED" =~ ^[1-4][0-9][0-9]$ ]] && ! [[ "$KOD_PO" =~ ^[1-4][0-9][0-9]$ ]]; then
        wp plugin deactivate "$LSC" || true
        echo "VERRIS_WPU_WYCOFANO=1"
        fail "po włączeniu cache strona zwracała błąd (HTTP $KOD_PO) — wyłączyliśmy wtyczkę z powrotem"
      fi
      ;;
    off) wp plugin deactivate "$LSC" || fail "nie udało się wyłączyć wtyczki LiteSpeed Cache" ;;
    purge) wp_z_wtyczkami litespeed-purge all || fail "nie udało się wyczyścić cache (czy wtyczka LiteSpeed Cache jest włączona?)" ;;
    redis-on)
      SOCK="$HOME_DIR/.verris-redis/redis.sock"
      [ -S "$SOCK" ] || fail "Redis konta nie jest włączony — włącz go najpierw w zakładce PHP i serwer"
      KOD_PRZED="$(http_kod)"
      wp plugin is-installed redis-cache >/dev/null 2>&1 || wp plugin install redis-cache || fail "nie udało się zainstalować wtyczki Redis Object Cache"
      wp config set WP_REDIS_SCHEME unix --quiet || fail "nie udało się zapisać wp-config.php"
      wp config set WP_REDIS_PATH "$SOCK" --quiet
      wp config set WP_REDIS_PREFIX "$WPU_DOMAIN:" --quiet
      wp plugin activate redis-cache || fail "nie udało się włączyć wtyczki Redis Object Cache"
      wp_z_wtyczkami redis enable --force || fail "wtyczka nie połączyła się z Redisem konta"
      KOD_PO="$(http_kod)"
      log "kontrola strony: przed=$KOD_PRZED po=$KOD_PO"
      if [[ "$KOD_PRZED" =~ ^[1-4][0-9][0-9]$ ]] && ! [[ "$KOD_PO" =~ ^[1-4][0-9][0-9]$ ]]; then
        wp_z_wtyczkami redis disable || true
        wp plugin deactivate redis-cache || true
        echo "VERRIS_WPU_WYCOFANO=1"
        fail "po włączeniu Redisa strona zwracała błąd (HTTP $KOD_PO) — wyłączyliśmy go z powrotem"
      fi
      ;;
    redis-off)
      wp_z_wtyczkami redis disable || true
      wp plugin deactivate redis-cache || fail "nie udało się wyłączyć wtyczki Redis Object Cache"
      ;;
  esac
  echo "VERRIS_WP_PO=$(stan)"
  log "Gotowe."
  exit 0
fi

[ "$WPU_CORE" != "none" ] || [ -n "$WPU_PLUGINS" ] || [ -n "$WPU_THEMES" ] || fail "nic nie wybrano do aktualizacji"
# I-15: kontrola strony po aktualizacji dostałaby 503 i wycofała zmiany; aktualizacja rdzenia i tak zdjęłaby tryb.
if [ -f "$DOCROOT/.maintenance" ] && grep -qF "$ZNACZNIK_KONSERWACJI" "$DOCROOT/.maintenance"; then
  fail "strona jest w trybie konserwacji — wyłącz go przed aktualizacją"
fi

# 1. kopia
TS="$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"
ARCH_NAZWA="verris-wp-$WPU_DOMAIN-$TS.tar.gz"
ARCH="$HOME_DIR/backups/$ARCH_NAZWA"
SQL_WZGL="verris-wp-db/$WPU_DOMAIN.sql"
jako_klient sh -c 'umask 077; mkdir -p backups verris-wp-db'
wp db export "$HOME_DIR/$SQL_WZGL" --quiet || fail "nie udało się zrzucić bazy — aktualizacja wstrzymana"
# umask 077: w archiwum jest zrzut bazy (z hasłami użytkowników WordPressa)
if ! jako_klient sh -c 'umask 077; tar -czf "$1" -C "$2" -- "$3" "$4"' verris "$ARCH" "$HOME_DIR" "$DOCROOT_WZGL" "$SQL_WZGL"; then
  jako_klient rm -f -- "$ARCH" "$HOME_DIR/$SQL_WZGL"
  fail "nie udało się zrobić kopii strony (brak miejsca?) — aktualizacja wstrzymana"
fi
jako_klient rm -f -- "$HOME_DIR/$SQL_WZGL"
log "kopia przed aktualizacją: ~/backups/$ARCH_NAZWA"
echo "VERRIS_WPU_KOPIA=$ARCH_NAZWA"
# dwie ostatnie kopie tej domeny zostają
jako_klient sh -c 'ls -1t -- backups/verris-wp-"$1"-*.tar.gz 2>/dev/null | tail -n +3 | while IFS= read -r f; do rm -f -- "$f"; done' verris "$WPU_DOMAIN"

KOD_PRZED="$(http_kod)"

# 2. aktualizacja (błąd pojedynczej wtyczki nie przerywa reszty — wynik widać w stanie PO)
BLEDY=0
case "$WPU_CORE" in
  minor) wp core update --minor || BLEDY=1 ;;
  all) wp core update || BLEDY=1 ;;
esac
[ "$WPU_CORE" = "none" ] || wp core update-db || BLEDY=1
if [ "$WPU_PLUGINS" = "*" ]; then
  wp plugin update --all || BLEDY=1
elif [ -n "$WPU_PLUGINS" ]; then
  IFS=',' read -r -a LISTA <<< "$WPU_PLUGINS"; wp plugin update "${LISTA[@]}" || BLEDY=1
fi
if [ "$WPU_THEMES" = "*" ]; then
  wp theme update --all || BLEDY=1
elif [ -n "$WPU_THEMES" ]; then
  IFS=',' read -r -a LISTA <<< "$WPU_THEMES"; wp theme update "${LISTA[@]}" || BLEDY=1
fi

# 3. kontrola strony i ewentualne wycofanie
KOD_PO="$(http_kod)"
log "kontrola strony: przed=$KOD_PRZED po=$KOD_PO"
if [[ "$KOD_PRZED" =~ ^[1-4][0-9][0-9]$ ]] && ! [[ "$KOD_PO" =~ ^[1-4][0-9][0-9]$ ]]; then
  log "strona przestała odpowiadać po aktualizacji — przywracam kopię"
  NIEUDANA="$DOCROOT_WZGL.verris-nieudana"
  jako_klient sh -c 'rm -rf -- "$1" && mv -- "$2" "$1" && mkdir -- "$2"' verris "$NIEUDANA" "$DOCROOT_WZGL"
  jako_klient tar -xzf "$ARCH" -C "$HOME_DIR" -- "$DOCROOT_WZGL" "$SQL_WZGL" || fail "przywracanie plików z ~/backups/$ARCH_NAZWA nie powiodło się — napisz do nas"
  wp db import "$HOME_DIR/$SQL_WZGL" --quiet || fail "przywracanie bazy z ~/backups/$ARCH_NAZWA nie powiodło się — napisz do nas"
  jako_klient rm -f -- "$HOME_DIR/$SQL_WZGL"
  echo "VERRIS_WPU_WYCOFANO=1"
  fail "po aktualizacji strona zwracała błąd (HTTP $KOD_PO) — przywróciliśmy pliki i bazę sprzed aktualizacji; wersja po nieudanej aktualizacji leży w $NIEUDANA"
fi

echo "VERRIS_WP_PO=$(stan)"
[ "$BLEDY" = "0" ] || log "część aktualizacji zgłosiła błąd — szczegóły powyżej"
log "Gotowe."
