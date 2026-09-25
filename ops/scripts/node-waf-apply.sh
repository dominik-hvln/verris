#!/usr/bin/env bash
# =============================================================================
# Verris — zastosowanie trybu ModSecurity WAF per konto (B2).
# Uruchamiany przez agenta zadań z payloadem w env:
#   WAF_DA_USER   login DA konta
#   WAF_DOMAIN    domena
#   WAF_MODE      OFF | DETECTION | ON
#
# Mechanizm: zarządzany blok w .htaccess docroot domeny ustawia SecRuleEngine.
# Idempotentny — blok jest wymieniany w całości przy każdym uruchomieniu.
# =============================================================================
set -Eeuo pipefail

: "${WAF_DA_USER:?}"; : "${WAF_DOMAIN:?}"; : "${WAF_MODE:?}"
[[ "$WAF_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || { echo "[waf-apply] nieprawidłowy login konta"; exit 1; }
[[ "$WAF_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || { echo "[waf-apply] nieprawidłowa domena"; exit 1; }

DOCROOT="/home/${WAF_DA_USER}/domains/${WAF_DOMAIN}/public_html"
HTACCESS="${DOCROOT}/.htaccess"
MARK_BEGIN="# >>> verris-waf (zarządzane — nie edytuj) >>>"
MARK_END="# <<< verris-waf <<<"

log() { echo "[waf-apply] $*"; }
[ -d "$DOCROOT" ] || { log "Brak docroot $DOCROOT"; exit 1; }

case "$WAF_MODE" in
  OFF)        ENGINE="Off" ;;
  DETECTION)  ENGINE="DetectionOnly" ;;
  ON)         ENGINE="On" ;;
  *) log "Nieznany tryb WAF_MODE=$WAF_MODE"; exit 1 ;;
esac

# Edycja jako klient: .htaccess leży w katalogu klienta i może być dowiązaniem symbolicznym — root
# dopisujący do niego (albo robiący chown) zmieniłby dowolny plik systemu (np. /etc/passwd).
BLOK="$(printf '%s\n' "$MARK_BEGIN" "<IfModule LiteSpeed>" "  SecRuleEngine ${ENGINE}" "</IfModule>" \
  "<IfModule mod_security2.c>" "  SecRuleEngine ${ENGINE}" "</IfModule>" "$MARK_END")"
runuser -u "$WAF_DA_USER" -- sh -c '
  set -e
  plik="$1"; poczatek="$2"; koniec="$3"; blok="$4"
  umask 022
  touch "$plik"
  tmp="$plik.verris.$$"
  # Poprzedni zarządzany blok (jeśli jest) wypada; reszta pliku zostaje bez zmian.
  awk -v p="$poczatek" -v k="$koniec" "\$0==p{w=1;next} \$0==k{w=0;next} !w" "$plik" > "$tmp"
  printf "%s\n" "$blok" >> "$tmp"
  cat "$tmp" > "$plik"
  rm -f "$tmp"
' verris "$HTACCESS" "$MARK_BEGIN" "$MARK_END" "$BLOK" || { log "Nie udało się zapisać .htaccess"; exit 1; }

echo "[VERRIS_WAF] domain=${WAF_DOMAIN} mode=${WAF_MODE} engine=${ENGINE}"
log "ModSecurity dla ${WAF_DOMAIN}: ${ENGINE}"
