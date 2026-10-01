#!/usr/bin/env bash
# =============================================================================
# Verris — instalator 1-click aplikacji (P-3). Uruchamiany przez agenta zadań
# z payloadem w env (jako użytkownik konta DA przez `su`):
#   APP_APP         nextcloud | prestashop | joomla | mediawiki
#   APP_DA_USER     login DA konta
#   APP_DOMAIN      domena
#   APP_DB_NAME / APP_DB_USER / APP_DB_PASS   baza danych (utworzona przez DA)
#   APP_ADMIN_USER / APP_ADMIN_PASS / APP_ADMIN_EMAIL
#
# Instaluje do public_html domeny realnymi instalatorami CLI:
#   - Nextcloud:  occ maintenance:install
#   - PrestaShop: install/index_cli.php
#   - Joomla:     installation/joomla.php install (CLI od 4.3; docs.joomla.org → J4.x:Joomla CLI Installation),
#                 paczka Full_Package z najnowszego wydania na github.com/joomla/joomla-cms
#   - MediaWiki:  maintenance/run.php install (mediawiki.org → Manual:install.php), paczka z releases.wikimedia.org
#
# Domyślna strona Verris (index.html + assets/) nie blokuje instalacji i znika po udanej instalacji —
# inaczej index.html (pierwszy w DirectoryIndex) zasłaniałby aplikację.
# Idempotentny w sensie „nie nadpisuj istniejącej instalacji" (wymaga pustego
# katalogu docelowego).
# =============================================================================
set -Eeuo pipefail

: "${APP_APP:?}"; : "${APP_DA_USER:?}"; : "${APP_DOMAIN:?}"
: "${APP_DB_NAME:?}"; : "${APP_DB_USER:?}"; : "${APP_DB_PASS:?}"
: "${APP_ADMIN_USER:?}"; : "${APP_ADMIN_PASS:?}"; : "${APP_ADMIN_EMAIL:?}"

DOCROOT="/home/${APP_DA_USER}/domains/${APP_DOMAIN}/public_html"
log() { echo "[app-install] $*"; }
# Przerwanie PRZED jakąkolwiek zmianą na koncie: znacznik dla API, że bazę założoną dla tej instalacji
# można bezpiecznie usunąć (test D3 29.09 — po przerwanej Joomli zostawała pusta baza klienta).
bez_zmian() { log "$*"; echo "[VERRIS_APP] bez_zmian=1"; exit 1; }
id "$APP_DA_USER" >/dev/null 2>&1 || bez_zmian "Brak użytkownika $APP_DA_USER"
[ -d "$DOCROOT" ] || bez_zmian "Brak docroot $DOCROOT"

# Domyślna strona Verris (albo stockowa DirectAdmina) w public_html — rozpoznawana po treści.
DOMYSLNA=0
if [ -f "$DOCROOT/index.html" ] && [ ! -L "$DOCROOT/index.html" ] \
  && grep -qiE 'hosting verris|Something amazing will be constructed' "$DOCROOT/index.html"; then
  DOMYSLNA=1
fi
POMIN='^(index\.html|\.htaccess|\.well-known)$'
[ "$DOMYSLNA" = 1 ] && POMIN='^(index\.html|\.htaccess|\.well-known|assets)$'

# Bezpieczeństwo: nie nadpisuj istniejącej strony (poza domyślną stroną Verris). Puste katalogi się nie
# liczą — nowa domena w DA 1.710 dostaje katalog z nazwą domeny i cgi-bin (test D3 29.09,
# test2.d3.hvln.pl: instalacja Joomli przerwana na świeżej domenie). Nic w nich nie ma do nadpisania.
# cgi-bin od DirectAdmina ma tylko .htaccess z „Options -Indexes” (17 B, t1 29.09) — to szkielet domeny;
# każda inna zawartość cgi-bin nadal blokuje instalację.
CGI="$DOCROOT/cgi-bin"
if [ -d "$CGI" ] && [ ! -L "$CGI" ] && [ -f "$CGI/.htaccess" ] && [ ! -L "$CGI/.htaccess" ] \
  && [ "$(find "$CGI" -mindepth 1 | wc -l)" -eq 1 ] \
  && [ "$(tr -d '[:space:]' < "$CGI/.htaccess")" = "Options-Indexes" ]; then
  POMIN="${POMIN%)\$}|cgi-bin)\$"
fi
ZAJETE="$(find "$DOCROOT" -mindepth 1 -maxdepth 1 ! -empty -printf '%f\n' 2>/dev/null | grep -vE "$POMIN" || true)"
if [ -n "$ZAJETE" ]; then
  log "Katalog $DOCROOT nie jest pusty ($(echo "$ZAJETE" | head -5 | tr '\n' ' ')) — przerwano (chronimy istniejące dane)."
  bez_zmian "BŁĄD: W katalogu domeny są już pliki strony — instalacja działa tylko na pustym katalogu. Usuń je w menedżerze plików albo wybierz inną domenę."
fi

# Nieudana instalacja nie może zostawić połowy aplikacji w katalogu domeny (test D3 30.09: Joomla
# rozpakowana, instalator CLI odrzucił PHP 8.2 — ponowienie blokował „katalog nie jest pusty”).
# Katalog ma tu tylko szkielet (sprawdzone wyżej), więc kopia jest mała; przy błędzie wraca 1:1,
# a znacznik bez_zmian pozwala API usunąć bazę założoną dla tej instalacji.
REALNY="$(realpath -e -- "$DOCROOT")"
[[ "$REALNY" == "/home/${APP_DA_USER}/"* ]] || bez_zmian "Katalog domeny poza katalogiem konta: $REALNY"
DOCROOT="$REALNY"
KOPIA="$(mktemp -d /var/tmp/verris-app-kopia.XXXXXX)"
cp -a -- "$DOCROOT/." "$KOPIA/"
BLAD_DLA_KLIENTA=""
blad() { BLAD_DLA_KLIENTA=1; log "BŁĄD: $*"; exit 1; }
wycofaj() {
  local rc=$?
  if [ "$rc" -eq 0 ]; then rm -rf -- "$KOPIA"; return 0; fi
  if find "$DOCROOT" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && cp -a -- "$KOPIA/." "$DOCROOT/"; then
    rm -rf -- "$KOPIA"
    log "Przywrócono katalog domeny sprzed instalacji."
    [ -n "$BLAD_DLA_KLIENTA" ] || log "BŁĄD: Instalacja nie powiodła się — katalog domeny jest taki jak przed instalacją. Spróbuj ponownie albo napisz do nas."
    echo "[VERRIS_APP] bez_zmian=1"
  else
    log "UWAGA: nie udało się przywrócić katalogu domeny (kopia: $KOPIA)"
  fi
  exit "$rc"
}
trap wycofaj EXIT

# Wykryj binarkę PHP CLI konta (CloudLinux alt-php lub systemowe).
PHP_BIN="$(command -v php || echo /usr/local/bin/php)"
run_as() { su -s /bin/bash -l "$APP_DA_USER" -c "$1"; }
# Paczki aplikacji mają po 50–250 MB. Serwer wydań MediaWiki zrywa transfer po ~70–85 s niezależnie od
# HTTP/2 czy 1.1 i od użytkownika (t1 01.10: „curl: (92) … CANCEL”, „(18) … bytes missing”), a --retry
# curla zaczyna od nowa (sprawdzone), więc dociągamy kolejnymi wywołaniami z -C - (zakresy HTTP).
# Root pobiera do własnego pliku tymczasowego, klient dostaje gotową paczkę na stdin do swojego /tmp.
pobierz() {
  local tmp i rc
  tmp="$(mktemp /var/tmp/verris-app-pobranie.XXXXXX)"
  for i in 1 2 3 4 5 6 7 8; do
    curl -fsSL -C - "$1" -o "$tmp" && break
    [ "$i" = 8 ] && { rm -f -- "$tmp"; blad "Nie udało się pobrać paczki aplikacji od producenta — spróbuj ponownie za kilka minut."; }
    sleep 3
  done
  run_as "umask 077; cat > '$2'" < "$tmp"; rc=$?
  rm -f -- "$tmp"
  return "$rc"
}
# Dane logowania mogą zawierać znaki specjalne powłoki — do poleceń trafiają jako tokeny z printf %q.
Q_ADMIN_USER=$(printf %q "$APP_ADMIN_USER"); Q_ADMIN_PASS=$(printf %q "$APP_ADMIN_PASS"); Q_ADMIN_EMAIL=$(printf %q "$APP_ADMIN_EMAIL")
Q_DB_PASS=$(printf %q "$APP_DB_PASS")

install_nextcloud() {
  local url="https://download.nextcloud.com/server/releases/latest.tar.bz2"
  log "Nextcloud: pobieranie + rozpakowanie"
  pobierz "$url" /tmp/nc.tar.bz2
  run_as "cd '$DOCROOT' && tar xjf /tmp/nc.tar.bz2 --strip-components=1 -C '$DOCROOT' && rm -f /tmp/nc.tar.bz2"
  log "Nextcloud: occ maintenance:install"
  run_as "cd '$DOCROOT' && '$PHP_BIN' occ maintenance:install \
    --database mysql --database-name '$APP_DB_NAME' --database-user '$APP_DB_USER' \
    --database-pass $Q_DB_PASS --database-host localhost \
    --admin-user $Q_ADMIN_USER --admin-pass $Q_ADMIN_PASS \
    --data-dir '$DOCROOT/data'"
  # Dodaj domenę do trusted_domains.
  run_as "cd '$DOCROOT' && '$PHP_BIN' occ config:system:set trusted_domains 1 --value='$APP_DOMAIN'" || true
  log "Nextcloud zainstalowany."
}

install_prestashop() {
  # Od 9.x wydania GitHub nie mają paczki (9.2.0: brak zasobów, t1 01.10 — „curl: (22) 404”); wersja 9
  # jest tylko w formularzu na prestashop.com. Bierzemy najnowsze stabilne wydanie z paczką prestashop_X.Y.Z.zip
  # (dziś gałąź 8.2, nadal wydawana) — z API wydań GitHub, jak Joomla.
  local url
  url="$(curl -fsSL 'https://api.github.com/repos/PrestaShop/PrestaShop/releases?per_page=30' | python3 -c '
import json, re, sys
for r in json.load(sys.stdin):
    if r.get("prerelease") or r.get("draft"):
        continue
    a = [x["browser_download_url"] for x in r.get("assets", []) if re.fullmatch(r"prestashop_[0-9.]+\.zip", x.get("name", ""))]
    if a:
        print(a[0]); break')"
  [[ "$url" =~ ^https://github\.com/PrestaShop/PrestaShop/releases/download/[0-9.]+/prestashop_[0-9.]+\.zip$ ]] \
    || { log "Nie znaleziono paczki PrestaShop w wydaniach"; exit 1; }
  log "PrestaShop: pobieranie + rozpakowanie ($url)"
  pobierz "$url" /tmp/ps.zip
  run_as "cd '$DOCROOT' && unzip -q /tmp/ps.zip -d '$DOCROOT' && rm -f /tmp/ps.zip"
  # Paczka ma w środku prestashop.zip (właściwe pliki) obok startowego index.php i Install_PrestaShop.html.
  # Najpierw usuwamy te dwa, potem rozpakowujemy — inaczej unzip pytał o nadpisanie index.php (bez terminala
  # pomijał go), a późniejsze rm kasowało index.php sklepu.
  run_as "cd '$DOCROOT' && if [ -f prestashop.zip ]; then rm -f index.php Install_PrestaShop.html && unzip -q -o prestashop.zip && rm -f prestashop.zip; fi"
  [ -f "$DOCROOT/install/index_cli.php" ] || { log "Paczka PrestaShop bez install/index_cli.php"; exit 1; }
  log "PrestaShop: install/index_cli.php"
  run_as "cd '$DOCROOT/install' && '$PHP_BIN' index_cli.php \
    --domain='$APP_DOMAIN' --db_server=localhost --db_name='$APP_DB_NAME' \
    --db_user='$APP_DB_USER' --db_password=$Q_DB_PASS \
    --name='Sklep' --country=pl --language=pl \
    --email=$Q_ADMIN_EMAIL --password=$Q_ADMIN_PASS \
    --firstname='Admin' --lastname='Sklep' --newsletter=0 --send_email=0"
  # PrestaShop nie wpuszcza do panelu, dopóki jest katalog install/ i dopóki panel leży pod „admin/”.
  # Nazwę liczy też API (adres panelu pokazany klientowi): admin + 10 znaków sha256("<baza>:<hasło>") —
  # bez hasła nie da się jej zgadnąć. Wspólny wzór pilnuje test instalator-aplikacji-katalog.spec.ts.
  local panel
  panel="admin$(printf '%s:%s' "$APP_DB_NAME" "$APP_ADMIN_PASS" | sha256sum | cut -c1-10)"
  run_as "cd '$DOCROOT' && rm -rf install && mv admin '$panel'" || blad "Nie udało się przygotować panelu sklepu — napisz do nas."
  log "PrestaShop zainstalowany (panel: /$panel)."
}

install_joomla() {
  # Najnowsze wydanie stabilne: zasób *-Stable-Full_Package.tar.gz z API wydań GitHub.
  local url
  url="$(curl -fsSL https://api.github.com/repos/joomla/joomla-cms/releases/latest | python3 -c '
import json, sys
a = [x["browser_download_url"] for x in json.load(sys.stdin).get("assets", []) if x.get("name", "").endswith("-Stable-Full_Package.tar.gz")]
print(a[0] if a else "")')"
  [[ "$url" =~ ^https://github\.com/joomla/joomla-cms/releases/download/[A-Za-z0-9._-]+/Joomla_[A-Za-z0-9._-]+-Stable-Full_Package\.tar\.gz$ ]] \
    || { log "Nie znaleziono paczki Joomla w najnowszym wydaniu"; exit 1; }
  log "Joomla: pobieranie + rozpakowanie ($url)"
  pobierz "$url" /tmp/joomla.tar.gz
  run_as "cd '$DOCROOT' && tar xzf /tmp/joomla.tar.gz -C '$DOCROOT' && rm -f /tmp/joomla.tar.gz"
  [ -f "$DOCROOT/installation/joomla.php" ] || { log "Paczka Joomla bez installation/joomla.php"; exit 1; }
  # Wymóg PHP z paczki (JOOMLA_MINIMUM_PHP) sprawdzamy sami — instalator CLI odrzuca starszy PHP
  # komunikatem po angielsku, a klient ma wiedzieć, co zmienić.
  local min akt
  min="$(grep -rhoE "JOOMLA_MINIMUM_PHP['\"]?[[:space:]]*[,=][[:space:]]*['\"][0-9]+(\.[0-9]+)+" \
    "$DOCROOT/installation" "$DOCROOT/includes" 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)+' | head -1 || true)"
  akt="$(run_as "'$PHP_BIN' -r 'echo PHP_VERSION;'" 2>/dev/null | tail -1 || true)"
  if [ -n "$min" ] && [ -n "$akt" ] && [ "$(printf '%s\n%s\n' "$min" "$akt" | sort -V | head -1)" != "$min" ]; then
    blad "Najnowsza Joomla wymaga PHP ${min%.0} lub nowszego, a hosting działa na PHP ${akt%.*}. Zmień wersję PHP (Strona → PHP) i zainstaluj ponownie."
  fi
  log "Joomla: installation/joomla.php install"
  run_as "cd '$DOCROOT' && '$PHP_BIN' installation/joomla.php install -n \
    --site-name='$APP_DOMAIN' --admin-user=Administrator --admin-username=$Q_ADMIN_USER \
    --admin-password=$Q_ADMIN_PASS --admin-email=$Q_ADMIN_EMAIL \
    --db-type=mysqli --db-host=localhost --db-user='$APP_DB_USER' --db-pass=$Q_DB_PASS \
    --db-name='$APP_DB_NAME' --db-encryption=0"
  run_as "cd '$DOCROOT' && rm -rf installation" || true
  log "Joomla zainstalowana (panel: /administrator)."
}

# MediaWiki nie ma adresu „latest” z kompletem zależności (vendor/) — wersję podbijamy tu,
# zgodnie z mediawiki.org → Download (2026-09-25: 1.46.0).
MEDIAWIKI_WERSJA="1.46.0"
install_mediawiki() {
  local gal="${MEDIAWIKI_WERSJA%.*}"
  local url="https://releases.wikimedia.org/mediawiki/${gal}/mediawiki-${MEDIAWIKI_WERSJA}.tar.gz"
  log "MediaWiki ${MEDIAWIKI_WERSJA}: pobieranie + rozpakowanie"
  pobierz "$url" /tmp/mediawiki.tar.gz
  run_as "cd '$DOCROOT' && tar xzf /tmp/mediawiki.tar.gz --strip-components=1 -C '$DOCROOT' && rm -f /tmp/mediawiki.tar.gz"
  log "MediaWiki: maintenance/run.php install"
  run_as "cd '$DOCROOT' && '$PHP_BIN' maintenance/run.php install \
    --dbtype=mysql --dbserver=localhost --dbname='$APP_DB_NAME' \
    --installdbuser='$APP_DB_USER' --installdbpass=$Q_DB_PASS \
    --dbuser='$APP_DB_USER' --dbpass=$Q_DB_PASS \
    --server='https://$APP_DOMAIN' --scriptpath='' --lang=pl \
    --pass=$Q_ADMIN_PASS '$APP_DOMAIN' $Q_ADMIN_USER"
  log "MediaWiki zainstalowana."
}

# Po udanej instalacji: domyślna strona Verris nie może zasłaniać aplikacji (index.html przed index.php).
usun_strone_domyslna() {
  [ "$DOMYSLNA" = 1 ] || return 0
  rm -f -- "$DOCROOT/index.html"
  if [ -d "$DOCROOT/assets" ] && [ ! -L "$DOCROOT/assets" ] \
    && [ -z "$(find "$DOCROOT/assets" -mindepth 1 ! -name 'verris-*.svg' -print -quit)" ]; then
    rm -rf -- "$DOCROOT/assets"
  fi
  log "Usunięto domyślną stronę Verris z public_html."
}

# Ustaw poprawne uprawnienia po instalacji.
fixperms() { chown -R "${APP_DA_USER}:${APP_DA_USER}" "$DOCROOT" 2>/dev/null || true; }

case "$APP_APP" in
  nextcloud)  command -v "$PHP_BIN" >/dev/null || bez_zmian "Brak PHP CLI"; install_nextcloud ;;
  prestashop) command -v unzip >/dev/null || bez_zmian "Brak unzip"; install_prestashop ;;
  joomla)     command -v "$PHP_BIN" >/dev/null || bez_zmian "Brak PHP CLI"; install_joomla ;;
  mediawiki)  command -v "$PHP_BIN" >/dev/null || bez_zmian "Brak PHP CLI"; install_mediawiki ;;
  *) bez_zmian "Nieobsługiwana aplikacja: $APP_APP" ;;
esac

usun_strone_domyslna
fixperms
log "Gotowe: $APP_APP na https://${APP_DOMAIN}"
