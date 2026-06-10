#!/usr/bin/env bash
# =============================================================================
# Verris — instalator WordPress per konto (A4). Uruchamiany przez agenta zadań
# (verris-task-run.sh) z payloadem w zmiennych środowiskowych:
#
#   WP_DA_USER, WP_DOMAIN, WP_DB_*, WP_ADMIN_*, WP_SITE_TITLE, WP_LOCALE
#
# Instalacja jako użytkownik konta DA (CageFS). Rdzeń WP: curl + tar (bez limitu
# pamięci PHP). Konfiguracja: wp-cli z podniesionym memory_limit (512M).
# Idempotentny: pełna instalacja → no-op.
# =============================================================================
set -Eeuo pipefail

: "${WP_DA_USER:?}"; : "${WP_DOMAIN:?}"
: "${WP_DB_NAME:?}"; : "${WP_DB_USER:?}"; : "${WP_DB_PASS:?}"
: "${WP_ADMIN_USER:?}"; : "${WP_ADMIN_PASS:?}"; : "${WP_ADMIN_EMAIL:?}"
WP_SITE_TITLE="${WP_SITE_TITLE:-Moja strona}"
WP_LOCALE="${WP_LOCALE:-pl_PL}"

DOCROOT="/home/${WP_DA_USER}/domains/${WP_DOMAIN}/public_html"
WP_DIR="/home/${WP_DA_USER}/.verris"
WP_PHAR="${WP_DIR}/wp-cli.phar"
WP_PHP_ARGS="-d memory_limit=512M -d max_execution_time=900"

log() { echo "[wp-install] $*"; }
die() { log "ERROR: $*"; exit 1; }

account_group() {
  id -gn "$WP_DA_USER" 2>/dev/null || echo "$WP_DA_USER"
}

chown_user() {
  chown -R "$WP_DA_USER:$(account_group)" "$1"
}

[ -d "$DOCROOT" ] || die "Brak docroot $DOCROOT — czy domena istnieje w DA?"

ensure_wp_cli() {
  mkdir -p "$WP_DIR"
  if [ ! -s "$WP_PHAR" ]; then
    log "Pobieram wp-cli…"
    curl -fsSL --retry 3 --retry-delay 2 \
      https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
      -o "${WP_PHAR}.tmp"
    mv "${WP_PHAR}.tmp" "$WP_PHAR"
  fi
  chown_user "$WP_DIR"
  chmod 755 "$WP_DIR"
  chmod 644 "$WP_PHAR"
}

resolve_user_php() {
  local p
  p=$(su -s /bin/bash -l "$WP_DA_USER" -c 'command -v php 2>/dev/null | head -1' || true)
  if [ -n "$p" ] && su -s /bin/bash -l "$WP_DA_USER" -c "test -x '$p'" 2>/dev/null; then
    echo "$p"
    return 0
  fi
  local candidate
  for candidate in /usr/local/bin/php /usr/bin/php /opt/alt/php*/usr/bin/php; do
    if [ -x "$candidate" ] 2>/dev/null && \
      su -s /bin/bash -l "$WP_DA_USER" -c "test -x '$candidate'" 2>/dev/null; then
      echo "$candidate"
      return 0
    fi
  done
  die "Brak PHP CLI dla użytkownika $WP_DA_USER (CageFS / alt-php)."
}

wordpress_tarball_url() {
  local locale="$1"
  case "$locale" in
    en_US | en) echo "https://wordpress.org/latest.tar.gz" ;;
    *)
      local lang="${locale%%_*}"
      echo "https://${lang}.wordpress.org/latest-${locale}.tar.gz"
      ;;
  esac
}

# Pobieranie rdzenia tar+gzip — omija wyczerpanie pamięci przy rozpakowaniu ZIP w PHP.
download_wordpress_core() {
  local primary fallback tmp
  primary=$(wordpress_tarball_url "$WP_LOCALE")
  fallback="https://wordpress.org/latest.tar.gz"
  tmp="${WP_DIR}/wp-core.tar.gz"

  log "Pobieram rdzeń WordPress ($WP_LOCALE)…"
  if ! su -s /bin/bash -l "$WP_DA_USER" -c "
    set -e
    if curl -fsSL --retry 3 --retry-delay 2 '$primary' -o '$tmp'; then
      echo '[wp-install] tarball: $primary'
    elif curl -fsSL --retry 3 --retry-delay 2 '$fallback' -o '$tmp'; then
      echo '[wp-install] tarball fallback: $fallback'
    else
      echo '[wp-install] curl failed' >&2
      exit 1
    fi
    tar -xzf '$tmp' -C '$DOCROOT' --strip-components=1
    rm -f '$tmp'
  "; then
    die "Nie udało się pobrać lub rozpakować rdzenia WordPress (sieć / docroot)."
  fi
  chown_user "$DOCROOT"
}

ensure_wp_cli
WP_PHP="$(resolve_user_php)"
log "PHP CLI: $WP_PHP"

wp_as_user() {
  # shellcheck disable=SC2086
  su -s /bin/bash -l "$WP_DA_USER" -c "cd '$DOCROOT' && '$WP_PHP' $WP_PHP_ARGS '$WP_PHAR' $*"
}

if ! wp_as_user "--version" >/dev/null 2>&1; then
  die "wp-cli nie uruchamia się (php / phar / CageFS)."
fi

if wp_as_user "core is-installed --path='$DOCROOT'" 2>/dev/null; then
  log "WordPress już zainstalowany w $DOCROOT — pomijam (no-op)."
  echo "[VERRIS_WP] status=already_installed domain=$WP_DOMAIN url=https://$WP_DOMAIN"
  exit 0
fi

download_wordpress_core

log "Tworzę wp-config.php…"
wp_as_user "config create --path='$DOCROOT' --dbname='$WP_DB_NAME' --dbuser='$WP_DB_USER' --dbpass='$WP_DB_PASS' --dbhost='localhost' --locale='$WP_LOCALE' --force"

log "Instaluję WordPress…"
wp_as_user "core install --path='$DOCROOT' --url='https://$WP_DOMAIN' --title='$WP_SITE_TITLE' --admin_user='$WP_ADMIN_USER' --admin_password='$WP_ADMIN_PASS' --admin_email='$WP_ADMIN_EMAIL' --skip-email"

log "Konfiguruję wtyczki i ustawienia…"
wp_as_user "rewrite structure '/%postname%/' --path='$DOCROOT'" || true
wp_as_user "plugin install litespeed-cache --activate --path='$DOCROOT'" 2>/dev/null || \
  log "LiteSpeed Cache — pominięto (brak sieci lub repo WP)."
wp_as_user "post delete 1 2 --force --path='$DOCROOT'" 2>/dev/null || true

chown_user "$DOCROOT"

echo "[VERRIS_WP] status=installed domain=$WP_DOMAIN url=https://$WP_DOMAIN admin_user=$WP_ADMIN_USER"
log "Gotowe: https://$WP_DOMAIN/wp-admin"
