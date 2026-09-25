#!/usr/bin/env bash
# =============================================================================
# Verris — wersja PHP konta (P-6) i rozszerzenia PHP (B-04). Uruchamiany przez agenta zadań z env:
#   PHP_DA_USER      login DA konta
#   PHP_DOMAIN       domena (informacyjnie)
#   PHP_VERSION      wersja PHP, np. "8.3"
#   PHP_EXT_ENABLE   opcjonalnie: rozszerzenia do włączenia, np. "intl,imagick"
#   PHP_EXT_DISABLE  opcjonalnie: rozszerzenia do wyłączenia
#
# Mechanizm: CloudLinux PHP Selector, wg oficjalnej dokumentacji CloudLinux (selectorctl):
#   selectorctl --set-user-current=<V> --user=<U>
#   selectorctl --enable-user-extensions=a,b --version=<V> --user=<U>
#   selectorctl --disable-user-extensions=a,b --version=<V> --user=<U>
# Bez selectorctl zadanie kończy się błędem (wcześniejszy „zapasowy” wpis do task.queue DA nie był
# poleceniem z dokumentacji i zgłaszał sukces bez zmiany). Wersję per domena ustawia API przez
# CMD_API_DOMAIN action=php_selector. Idempotentny.
# =============================================================================
set -Eeuo pipefail
: "${PHP_DA_USER:?}"; : "${PHP_VERSION:?}"
log() { echo "[php-apply] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$PHP_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$PHP_VERSION" =~ ^[0-9]+\.[0-9]+$ ]] || fail "niepoprawny format wersji: $PHP_VERSION"
LISTA='^[a-z0-9_]{1,40}(,[a-z0-9_]{1,40}){0,29}$'
[ -z "${PHP_EXT_ENABLE:-}" ] || [[ "$PHP_EXT_ENABLE" =~ $LISTA ]] || fail "nieprawidłowa lista rozszerzeń do włączenia"
[ -z "${PHP_EXT_DISABLE:-}" ] || [[ "$PHP_EXT_DISABLE" =~ $LISTA ]] || fail "nieprawidłowa lista rozszerzeń do wyłączenia"
id "$PHP_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $PHP_DA_USER"
command -v selectorctl >/dev/null 2>&1 || fail "na serwerze nie ma selektora PHP (CloudLinux selectorctl) — zmiana niemożliwa, napisz do pomocy"

selectorctl --list --interpreter=php 2>/dev/null | awk '{print $1}' | grep -qx "$PHP_VERSION" \
  || fail "wersja PHP $PHP_VERSION nie jest zainstalowana na serwerze"
selectorctl --set-user-current="$PHP_VERSION" --user="$PHP_DA_USER" >/dev/null \
  || fail "selektor nie ustawił wersji $PHP_VERSION"
log "PHP konta $PHP_DA_USER → $PHP_VERSION"

if [ -n "${PHP_EXT_ENABLE:-}" ]; then
  selectorctl --enable-user-extensions="$PHP_EXT_ENABLE" --version="$PHP_VERSION" --user="$PHP_DA_USER" >/dev/null \
    || fail "nie udało się włączyć: $PHP_EXT_ENABLE"
  log "włączone rozszerzenia: $PHP_EXT_ENABLE"
fi
if [ -n "${PHP_EXT_DISABLE:-}" ]; then
  selectorctl --disable-user-extensions="$PHP_EXT_DISABLE" --version="$PHP_VERSION" --user="$PHP_DA_USER" >/dev/null \
    || fail "nie udało się wyłączyć: $PHP_EXT_DISABLE"
  log "wyłączone rozszerzenia: $PHP_EXT_DISABLE"
fi
log "Gotowe."
