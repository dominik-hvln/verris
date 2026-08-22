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

touch "$HTACCESS"
# Usuń poprzedni zarządzany blok (jeśli istnieje).
if grep -qF "$MARK_BEGIN" "$HTACCESS"; then
  sed -i "/$(printf '%s' "$MARK_BEGIN" | sed 's/[][\/.*^$]/\\&/g')/,/$(printf '%s' "$MARK_END" | sed 's/[][\/.*^$]/\\&/g')/d" "$HTACCESS"
fi

# Dopisz aktualny blok.
{
  echo "$MARK_BEGIN"
  echo "<IfModule LiteSpeed>"
  echo "  SecRuleEngine ${ENGINE}"
  echo "</IfModule>"
  echo "<IfModule mod_security2.c>"
  echo "  SecRuleEngine ${ENGINE}"
  echo "</IfModule>"
  echo "$MARK_END"
} >> "$HTACCESS"

# Właściciel pliku = użytkownik konta (CageFS-safe).
chown "${WAF_DA_USER}:${WAF_DA_USER}" "$HTACCESS" 2>/dev/null || true

echo "[VERRIS_WAF] domain=${WAF_DOMAIN} mode=${WAF_MODE} engine=${ENGINE}"
log "ModSecurity dla ${WAF_DOMAIN}: ${ENGINE}"
