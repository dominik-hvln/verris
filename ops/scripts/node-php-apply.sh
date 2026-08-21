#!/usr/bin/env bash
# =============================================================================
# Verris — zmiana wersji PHP konta (P-6). Uruchamiany przez agenta zadań z env:
#   PHP_DA_USER   login DA konta
#   PHP_DOMAIN    domena (informacyjnie)
#   PHP_VERSION   wersja PHP, np. "8.3"
#
# Mechanizm: CloudLinux PHP Selector (selectorctl) ustawia wersję alt-php dla
# użytkownika konta. Fallback: DirectAdmin CLI (custombuild/da) jeśli selectorctl
# niedostępny. Idempotentny.
# =============================================================================
set -Eeuo pipefail

: "${PHP_DA_USER:?}"; : "${PHP_VERSION:?}"

log() { echo "[php-apply] $*"; }

# Normalizuj "8.3" → selectorctl oczekuje "8.3" (alt-php). Waliduj format.
if ! echo "$PHP_VERSION" | grep -Eq '^[0-9]+\.[0-9]+$'; then
  log "Niepoprawny format wersji: $PHP_VERSION"; exit 1
fi

id "$PHP_DA_USER" >/dev/null 2>&1 || { log "Brak użytkownika systemowego $PHP_DA_USER"; exit 1; }

applied=0

# 1) CloudLinux PHP Selector (preferowane).
if command -v selectorctl >/dev/null 2>&1; then
  # Wersje selectorctl podaje bez kropki czasem; sprawdź dostępność.
  if selectorctl --list --interpreter=php --user="$PHP_DA_USER" 2>/dev/null | awk '{print $1}' | grep -qx "$PHP_VERSION"; then
    selectorctl --set-current-version="$PHP_VERSION" --interpreter=php --user="$PHP_DA_USER"
    log "selectorctl: ustawiono PHP $PHP_VERSION dla $PHP_DA_USER"
    applied=1
  else
    log "selectorctl: wersja $PHP_VERSION niedostępna dla użytkownika — sprawdź alt-php na węźle"
  fi
fi

# 2) Fallback: DirectAdmin per-domain PHP (jeśli MultiPHP skonfigurowane w DA).
if [ "$applied" = "0" ] && [ -x /usr/local/directadmin/directadmin ]; then
  # DA mapuje wersje na sloty (php1/php2/...). Spróbuj dopasować po numerze.
  ver_nodot="${PHP_VERSION/./}"
  echo "action=php_selector&domain=${PHP_DOMAIN:-}&php1_select=${ver_nodot}" \
    >> /usr/local/directadmin/data/users/"$PHP_DA_USER"/task.queue 2>/dev/null || true
  /usr/local/directadmin/dataskq d2000 >/dev/null 2>&1 || true
  log "DA fallback: zlecono php_selector=${ver_nodot} dla domeny ${PHP_DOMAIN:-}"
  applied=1
fi

[ "$applied" = "1" ] || { log "Nie udało się zastosować wersji PHP — brak selectorctl i DA."; exit 1; }

# Restart PHP-FPM puli użytkownika (best-effort) by zmiana weszła od razu.
systemctl reload "php-fpm" >/dev/null 2>&1 || \
  /usr/local/directadmin/custombuild/build php_fpm_restart >/dev/null 2>&1 || true

log "Gotowe: PHP konta $PHP_DA_USER → $PHP_VERSION"
