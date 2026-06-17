#!/usr/bin/env bash
# =============================================================================
# Verris — instalator 1-click aplikacji (P-3). Uruchamiany przez agenta zadań
# z payloadem w env (jako użytkownik konta DA przez `su`):
#   APP_APP         nextcloud | prestashop
#   APP_DA_USER     login DA konta
#   APP_DOMAIN      domena
#   APP_DB_NAME / APP_DB_USER / APP_DB_PASS   baza danych (utworzona przez DA)
#   APP_ADMIN_USER / APP_ADMIN_PASS / APP_ADMIN_EMAIL
#
# Instaluje do public_html domeny realnymi instalatorami CLI:
#   - Nextcloud:  occ maintenance:install
#   - PrestaShop: install/index_cli.php
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

# Bezpieczeństwo: nie nadpisuj istniejącej strony (poza domyślną stroną Verris).
if [ -n "$(ls -A "$DOCROOT" 2>/dev/null | grep -vE '^(index\.html|\.htaccess|\.well-known)$' || true)" ]; then
  log "Katalog $DOCROOT nie jest pusty — przerwano (chronimy istniejące dane)."
  exit 1
fi

# Wykryj binarkę PHP CLI konta (CloudLinux alt-php lub systemowe).
PHP_BIN="$(command -v php || echo /usr/local/bin/php)"
run_as() { su -s /bin/bash -l "$APP_DA_USER" -c "$1"; }

install_nextcloud() {
  local url="https://download.nextcloud.com/server/releases/latest.tar.bz2"
  log "Nextcloud: pobieranie + rozpakowanie"
  run_as "cd '$DOCROOT' && curl -fsSL '$url' -o /tmp/nc.tar.bz2 && tar xjf /tmp/nc.tar.bz2 --strip-components=1 -C '$DOCROOT' && rm -f /tmp/nc.tar.bz2"
  log "Nextcloud: occ maintenance:install"
  run_as "cd '$DOCROOT' && '$PHP_BIN' occ maintenance:install \
    --database mysql --database-name '$APP_DB_NAME' --database-user '$APP_DB_USER' \
    --database-pass '$APP_DB_PASS' --database-host localhost \
    --admin-user '$APP_ADMIN_USER' --admin-pass '$APP_ADMIN_PASS' \
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
    --db_user='$APP_DB_USER' --db_password='$APP_DB_PASS' \
    --name='Sklep' --country=pl --language=pl \
    --email='$APP_ADMIN_EMAIL' --password='$APP_ADMIN_PASS' \
    --firstname='Admin' --lastname='Sklep' --newsletter=0 --send_email=0"
  # Po instalacji PrestaShop wymaga usunięcia katalogu install i zmiany nazwy admin.
  run_as "cd '$DOCROOT' && rm -rf install" || true
  log "PrestaShop zainstalowany (pamiętaj o zmianie nazwy katalogu admin po pierwszym logowaniu)."
}

# Ustaw poprawne uprawnienia po instalacji.
fixperms() { chown -R "${APP_DA_USER}:${APP_DA_USER}" "$DOCROOT" 2>/dev/null || true; }

case "$APP_APP" in
  nextcloud)  command -v "$PHP_BIN" >/dev/null || { log "Brak PHP CLI"; exit 1; }; install_nextcloud ;;
  prestashop) command -v unzip >/dev/null || { log "Brak unzip"; exit 1; }; install_prestashop ;;
  *) log "Nieobsługiwana aplikacja: $APP_APP"; exit 1 ;;
esac

fixperms
log "Gotowe: $APP_APP na https://${APP_DOMAIN}"
