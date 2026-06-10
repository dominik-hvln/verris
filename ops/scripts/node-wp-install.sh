#!/usr/bin/env bash
# =============================================================================
# Verris — instalator WordPress per konto (A4). Uruchamiany przez agenta zadań
# (verris-task-run.sh) z payloadem w zmiennych środowiskowych:
#
#   WP_DA_USER     login DA konta (np. domi3055)
#   WP_DOMAIN      domena (np. example.pl)
#   WP_DB_NAME     pełna nazwa bazy (np. domi3055_wp)
#   WP_DB_USER     pełna nazwa usera bazy (np. domi3055_wp)
#   WP_DB_PASS     hasło bazy
#   WP_SITE_TITLE  tytuł witryny
#   WP_ADMIN_USER  login admina WP
#   WP_ADMIN_PASS  hasło admina WP
#   WP_ADMIN_EMAIL e-mail admina WP
#   WP_LOCALE      np. pl_PL (domyślnie)
#
# Instalacja wykonywana JAKO UŻYTKOWNIK KONTA (su -s), w docroot domeny.
# Idempotentny: jeśli WordPress już zainstalowany — kończy się sukcesem (no-op).
# =============================================================================
set -Eeuo pipefail

: "${WP_DA_USER:?}"; : "${WP_DOMAIN:?}"
: "${WP_DB_NAME:?}"; : "${WP_DB_USER:?}"; : "${WP_DB_PASS:?}"
: "${WP_ADMIN_USER:?}"; : "${WP_ADMIN_PASS:?}"; : "${WP_ADMIN_EMAIL:?}"
WP_SITE_TITLE="${WP_SITE_TITLE:-Moja strona}"
WP_LOCALE="${WP_LOCALE:-pl_PL}"

DOCROOT="/home/${WP_DA_USER}/domains/${WP_DOMAIN}/public_html"
WP_CLI="/usr/local/bin/wp"

log() { echo "[wp-install] $*"; }

# wp-cli — pobierz jeśli brak.
if [ ! -x "$WP_CLI" ]; then
  log "Pobieram wp-cli…"
  curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o "$WP_CLI"
  chmod +x "$WP_CLI"
fi

[ -d "$DOCROOT" ] || { log "Brak docroot $DOCROOT — czy domena istnieje w DA?"; exit 1; }

# Helper: wp-cli jako użytkownik konta (CageFS-safe).
wp_as_user() {
  su -s /bin/bash -l "$WP_DA_USER" -c "cd '$DOCROOT' && $WP_CLI $*"
}

# Idempotencja: jeśli już zainstalowany, nie nadpisuj.
if wp_as_user "core is-installed --path='$DOCROOT'" 2>/dev/null; then
  log "WordPress już zainstalowany w $DOCROOT — pomijam (no-op)."
  echo "[VERRIS_WP] status=already_installed domain=$WP_DOMAIN url=https://$WP_DOMAIN"
  exit 0
fi

log "Pobieram rdzeń WordPress ($WP_LOCALE)…"
wp_as_user "core download --locale='$WP_LOCALE' --path='$DOCROOT' --force"

log "Tworzę wp-config.php…"
wp_as_user "config create --path='$DOCROOT' --dbname='$WP_DB_NAME' --dbuser='$WP_DB_USER' --dbpass='$WP_DB_PASS' --dbhost='localhost' --locale='$WP_LOCALE' --force"

log "Instaluję WordPress…"
wp_as_user "core install --path='$DOCROOT' --url='https://$WP_DOMAIN' --title='$WP_SITE_TITLE' --admin_user='$WP_ADMIN_USER' --admin_password='$WP_ADMIN_PASS' --admin_email='$WP_ADMIN_EMAIL' --skip-email"

# Sensowne domyślne: LiteSpeed Cache (A3) + ładne permalinki + usunięcie demo.
log "Konfiguruję wtyczki i ustawienia…"
wp_as_user "rewrite structure '/%postname%/' --path='$DOCROOT'" || true
wp_as_user "plugin install litespeed-cache --activate --path='$DOCROOT'" || log "LiteSpeed Cache — pominięto (brak sieci?)"
wp_as_user "post delete 1 2 --force --path='$DOCROOT'" 2>/dev/null || true

echo "[VERRIS_WP] status=installed domain=$WP_DOMAIN url=https://$WP_DOMAIN admin_user=$WP_ADMIN_USER"
log "Gotowe: https://$WP_DOMAIN/wp-admin"
