#!/usr/bin/env bash
# =============================================================================
# Verris — staging sync per konto (B5). Uruchamiany przez agenta zadań z env:
#
#   STG_DA_USER    login DA konta
#   STG_DOMAIN     domena główna (np. example.pl)
#   STG_SUB        nazwa subdomeny (staging)
#   STG_DIRECTION  TO_STAGING | TO_LIVE
#   STG_DB_NAME / STG_DB_USER / STG_DB_PASS   (tylko pierwszy klon, opcjonalne)
#
# TO_STAGING: rsync LIVE→staging (z wykluczeniem katalogu staging); jeśli
#   wykryto WordPress — eksport bazy LIVE → import do bazy staging + zamiana
#   adresów na staging.<domena> (wp search-replace, bezpieczne dla serializacji).
# TO_LIVE: backup tar plików LIVE (ostatnie 3 sztuki w ~/.verris/backups),
#   rsync staging→LIVE (bez wp-config.php — LIVE zachowuje swoją bazę);
#   dla WP — import bazy staging do LIVE + odwrotna zamiana adresów.
#
# Wszystkie operacje na plikach i bazie wykonywane JAKO UŻYTKOWNIK KONTA
# (su -l, CageFS). Idempotentny i bezpieczny do ponowienia.
# =============================================================================
set -Eeuo pipefail

: "${STG_DA_USER:?}"; : "${STG_DOMAIN:?}"; : "${STG_DIRECTION:?}"
STG_SUB="${STG_SUB:-staging}"

HOME_DIR="/home/${STG_DA_USER}"
LIVE="${HOME_DIR}/domains/${STG_DOMAIN}/public_html"
STG="${LIVE}/${STG_SUB}"
STAGING_HOST="${STG_SUB}.${STG_DOMAIN}"
VERRIS_DIR="${HOME_DIR}/.verris"
BACKUP_DIR="${VERRIS_DIR}/backups"
WP_PHAR="${VERRIS_DIR}/wp-cli.phar"
WP_PHP_ARGS="-d memory_limit=512M -d max_execution_time=900"

log() { echo "[staging-sync] $*"; }
die() { log "ERROR: $*"; exit 1; }

account_group() { id -gn "$STG_DA_USER" 2>/dev/null || echo "$STG_DA_USER"; }
as_user() { su -s /bin/bash -l "$STG_DA_USER" -c "$1"; }

[ -d "$LIVE" ] || die "Brak docroot $LIVE"
[ -d "$STG" ] || die "Brak katalogu staging $STG — czy subdomena ${STAGING_HOST} istnieje w DA?"

# --- wp-cli (współdzielony z instalatorem WP) --------------------------------
ensure_wp_cli() {
  mkdir -p "$VERRIS_DIR"
  if [ ! -s "$WP_PHAR" ]; then
    log "Pobieram wp-cli…"
    curl -fsSL --retry 3 --retry-delay 2 \
      https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
      -o "${WP_PHAR}.tmp"
    mv "${WP_PHAR}.tmp" "$WP_PHAR"
  fi
  chown "$STG_DA_USER:$(account_group)" "$VERRIS_DIR" "$WP_PHAR" 2>/dev/null || true
  chmod 755 "$VERRIS_DIR"; chmod 644 "$WP_PHAR"
}

resolve_user_php() {
  local p
  p=$(as_user 'command -v php 2>/dev/null | head -1' || true)
  if [ -n "$p" ] && as_user "test -x '$p'" 2>/dev/null; then echo "$p"; return 0; fi
  local candidate
  for candidate in /usr/local/bin/php /usr/bin/php /opt/alt/php*/usr/bin/php; do
    if [ -x "$candidate" ] 2>/dev/null && as_user "test -x '$candidate'" 2>/dev/null; then
      echo "$candidate"; return 0
    fi
  done
  echo ""
}

WP_PHP=""
wp_in() {
  # wp_in <path> <args…> — wp-cli jako użytkownik konta we wskazanym katalogu
  local path="$1"; shift
  as_user "cd '$path' && '$WP_PHP' $WP_PHP_ARGS '$WP_PHAR' --path='$path' $*"
}

is_wordpress() { [ -f "${1}/wp-config.php" ] && [ -d "${1}/wp-includes" ]; }

# --- rsync (jako użytkownik, z wykluczeniem stagingu i backupów) -------------
sync_files() {
  local from="$1" to="$2" extra="${3:-}"
  command -v rsync >/dev/null 2>&1 || die "Brak rsync na węźle."
  as_user "rsync -a --delete \
    --exclude '/${STG_SUB}/' \
    --exclude '.well-known' \
    ${extra} \
    '${from}/' '${to}/'"
}

# =============================================================================
ensure_wp_cli
WP_PHP="$(resolve_user_php)"

case "$STG_DIRECTION" in
# -----------------------------------------------------------------------------
TO_STAGING)
  log "Klonuję pliki LIVE → ${STAGING_HOST}…"
  # wp-config.php staging ma własną bazę — nie nadpisujemy go przy odświeżeniu.
  if is_wordpress "$STG"; then
    sync_files "$LIVE" "$STG" "--exclude '/wp-config.php'"
  else
    sync_files "$LIVE" "$STG"
  fi

  if is_wordpress "$LIVE" && [ -n "$WP_PHP" ]; then
    log "Wykryto WordPress — kopiuję bazę danych…"
    DUMP="${VERRIS_DIR}/stg-dump.sql"

    if ! is_wordpress "$STG" || [ ! -f "${STG}/wp-config.php" ]; then
      # Pierwszy klon: wp-config dla stagingu z dedykowaną bazą.
      [ -n "${STG_DB_NAME:-}" ] || die "Pierwszy klon WP wymaga danych bazy staging (payload dbName/dbUser/dbPass)."
      as_user "cp '${LIVE}/wp-config.php' '${STG}/wp-config.php'"
      wp_in "$STG" "config set DB_NAME '${STG_DB_NAME}'"
      wp_in "$STG" "config set DB_USER '${STG_DB_USER}'"
      wp_in "$STG" "config set DB_PASSWORD '${STG_DB_PASS}'"
    fi

    wp_in "$LIVE" "db export '$DUMP' --add-drop-table"
    wp_in "$STG" "db import '$DUMP'"
    as_user "rm -f '$DUMP'"

    log "Zamieniam adresy na ${STAGING_HOST}…"
    wp_in "$STG" "search-replace '://www.${STG_DOMAIN}' '://${STAGING_HOST}' --all-tables --precise" >/dev/null
    wp_in "$STG" "search-replace '://${STG_DOMAIN}' '://${STAGING_HOST}' --all-tables --precise" >/dev/null
    # Staging nie powinien być indeksowany ani spamować mailami.
    wp_in "$STG" "option update blog_public 0" >/dev/null || true
    wp_in "$STG" "cache flush" >/dev/null 2>&1 || true
    echo "[VERRIS_STAGING] direction=TO_STAGING status=ok wp=yes host=${STAGING_HOST}"
  else
    echo "[VERRIS_STAGING] direction=TO_STAGING status=ok wp=no host=${STAGING_HOST}"
  fi
  log "Staging gotowy: https://${STAGING_HOST}"
  ;;

# -----------------------------------------------------------------------------
TO_LIVE)
  log "Backup plików LIVE przed publikacją…"
  as_user "mkdir -p '$BACKUP_DIR'"
  TS=$(date -u +%Y%m%d-%H%M%S)
  BACKUP="${BACKUP_DIR}/live-${STG_DOMAIN}-${TS}.tar.gz"
  as_user "cd '$LIVE' && tar -czf '$BACKUP' --exclude='./${STG_SUB}' ." \
    || die "Backup LIVE nie powiódł się — publikacja przerwana."
  # Retencja: 3 ostatnie backupy.
  as_user "ls -1t '${BACKUP_DIR}'/live-${STG_DOMAIN}-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f"
  log "Backup: $BACKUP"

  if is_wordpress "$STG" && [ -n "$WP_PHP" ]; then
    log "Publikuję bazę staging → LIVE…"
    DUMP="${VERRIS_DIR}/live-dump.sql"
    # Backup bazy LIVE obok plików (do ręcznego przywrócenia w razie potrzeby).
    wp_in "$LIVE" "db export '${BACKUP_DIR}/db-${STG_DOMAIN}-${TS}.sql' --add-drop-table" \
      || log "UWAGA: backup bazy LIVE nie powiódł się (kontynuuję — pliki mają backup)."
    as_user "ls -1t '${BACKUP_DIR}'/db-${STG_DOMAIN}-*.sql 2>/dev/null | tail -n +4 | xargs -r rm -f"

    wp_in "$STG" "db export '$DUMP' --add-drop-table"
    wp_in "$LIVE" "db import '$DUMP'"
    as_user "rm -f '$DUMP'"

    log "Zamieniam adresy z powrotem na ${STG_DOMAIN}…"
    wp_in "$LIVE" "search-replace '://${STAGING_HOST}' '://${STG_DOMAIN}' --all-tables --precise" >/dev/null
    wp_in "$LIVE" "option update blog_public 1" >/dev/null || true
  fi

  log "Publikuję pliki staging → LIVE…"
  # Bez wp-config.php: LIVE zachowuje swoją bazę i sól.
  sync_files "$STG" "$LIVE" "--exclude '/wp-config.php'"
  if is_wordpress "$LIVE" && [ -n "$WP_PHP" ]; then
    wp_in "$LIVE" "cache flush" >/dev/null 2>&1 || true
  fi

  echo "[VERRIS_STAGING] direction=TO_LIVE status=ok backup=${BACKUP} host=${STG_DOMAIN}"
  log "Opublikowano. Backup plików: ${BACKUP}"
  ;;

*)
  die "Nieznany STG_DIRECTION=$STG_DIRECTION"
  ;;
esac
