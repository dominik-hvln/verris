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
id "$APP_DA_USER" >/dev/null 2>&1 || { log "Brak użytkownika $APP_DA_USER"; exit 1; }
[ -d "$DOCROOT" ] || { log "Brak docroot $DOCROOT"; exit 1; }

# Domyślna strona Verris (albo stockowa DirectAdmina) w public_html — rozpoznawana po treści.
DOMYSLNA=0
if [ -f "$DOCROOT/index.html" ] && [ ! -L "$DOCROOT/index.html" ] \
  && grep -qiE 'hosting verris|Something amazing will be constructed' "$DOCROOT/index.html"; then
  DOMYSLNA=1
fi
POMIN='^(index\.html|\.htaccess|\.well-known)$'
[ "$DOMYSLNA" = 1 ] && POMIN='^(index\.html|\.htaccess|\.well-known|assets)$'

# Bezpieczeństwo: nie nadpisuj istniejącej strony (poza domyślną stroną Verris).
if [ -n "$(ls -A "$DOCROOT" 2>/dev/null | grep -vE "$POMIN" || true)" ]; then
  log "Katalog $DOCROOT nie jest pusty — przerwano (chronimy istniejące dane)."
  exit 1
fi

# Wykryj binarkę PHP CLI konta (CloudLinux alt-php lub systemowe).
PHP_BIN="$(command -v php || echo /usr/local/bin/php)"
run_as() { su -s /bin/bash -l "$APP_DA_USER" -c "$1"; }
# Dane logowania mogą zawierać znaki specjalne powłoki — do poleceń trafiają jako tokeny z printf %q.
Q_ADMIN_USER=$(printf %q "$APP_ADMIN_USER"); Q_ADMIN_PASS=$(printf %q "$APP_ADMIN_PASS"); Q_ADMIN_EMAIL=$(printf %q "$APP_ADMIN_EMAIL")
Q_DB_PASS=$(printf %q "$APP_DB_PASS")

install_nextcloud() {
  local url="https://download.nextcloud.com/server/releases/latest.tar.bz2"
  log "Nextcloud: pobieranie + rozpakowanie"
  run_as "cd '$DOCROOT' && curl -fsSL '$url' -o /tmp/nc.tar.bz2 && tar xjf /tmp/nc.tar.bz2 --strip-components=1 -C '$DOCROOT' && rm -f /tmp/nc.tar.bz2"
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
  local url="https://github.com/PrestaShop/PrestaShop/releases/latest/download/prestashop.zip"
  log "PrestaShop: pobieranie + rozpakowanie"
  run_as "cd '$DOCROOT' && curl -fsSL '$url' -o /tmp/ps.zip && unzip -q /tmp/ps.zip -d '$DOCROOT' && rm -f /tmp/ps.zip"
  # Niektóre paczki zawierają zagnieżdżony prestashop.zip — rozpakuj jeśli trzeba.
  run_as "cd '$DOCROOT' && [ -f prestashop.zip ] && unzip -q prestashop.zip && rm -f prestashop.zip index.php Install_PrestaShop.html || true"
  log "PrestaShop: install/index_cli.php"
  run_as "cd '$DOCROOT/install' && '$PHP_BIN' index_cli.php \
    --domain='$APP_DOMAIN' --db_server=localhost --db_name='$APP_DB_NAME' \
    --db_user='$APP_DB_USER' --db_password=$Q_DB_PASS \
    --name='Sklep' --country=pl --language=pl \
    --email=$Q_ADMIN_EMAIL --password=$Q_ADMIN_PASS \
    --firstname='Admin' --lastname='Sklep' --newsletter=0 --send_email=0"
  # Po instalacji PrestaShop wymaga usunięcia katalogu install i zmiany nazwy admin.
  run_as "cd '$DOCROOT' && rm -rf install" || true
  log "PrestaShop zainstalowany (pamiętaj o zmianie nazwy katalogu admin po pierwszym logowaniu)."
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
  run_as "cd '$DOCROOT' && curl -fsSL '$url' -o /tmp/joomla.tar.gz && tar xzf /tmp/joomla.tar.gz -C '$DOCROOT' && rm -f /tmp/joomla.tar.gz"
  [ -f "$DOCROOT/installation/joomla.php" ] || { log "Paczka Joomla bez installation/joomla.php"; exit 1; }
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
  run_as "cd '$DOCROOT' && curl -fsSL '$url' -o /tmp/mediawiki.tar.gz && tar xzf /tmp/mediawiki.tar.gz --strip-components=1 -C '$DOCROOT' && rm -f /tmp/mediawiki.tar.gz"
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
  nextcloud)  command -v "$PHP_BIN" >/dev/null || { log "Brak PHP CLI"; exit 1; }; install_nextcloud ;;
  prestashop) command -v unzip >/dev/null || { log "Brak unzip"; exit 1; }; install_prestashop ;;
  joomla)     command -v "$PHP_BIN" >/dev/null || { log "Brak PHP CLI"; exit 1; }; install_joomla ;;
  mediawiki)  command -v "$PHP_BIN" >/dev/null || { log "Brak PHP CLI"; exit 1; }; install_mediawiki ;;
  *) log "Nieobsługiwana aplikacja: $APP_APP"; exit 1 ;;
esac

usun_strone_domyslna
fixperms
log "Gotowe: $APP_APP na https://${APP_DOMAIN}"
