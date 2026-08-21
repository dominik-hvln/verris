#!/usr/bin/env bash
# =============================================================================
# Verris — ochrona przed outbound-spam na węźle (Postfix)  [CYBER-3]
# -----------------------------------------------------------------------------
# Dwie warstwy obrony przed przejętym/nadużywającym kontem hostingowym:
#
#  1. GLOBALNE limity tempa (anvil) — twardy sufit na klienta SMTP, żeby nagły
#     skok nie wysycił reputacji IP węzła (RBL).
#  2. Per-konto CORDON — mapa check_sender_access, którą control-plane (lub BOK)
#     wykorzystuje do natychmiastowego ZABLOKOWANIA wysyłki konkretnego nadawcy
#     (adresu lub całej domeny), zanim IP trafi na blacklistę.
#
# Idempotentny. Uruchamiany na węźle (przez agenta Verris lub ręcznie).
#
# Użycie:
#   node-outbound-throttle.sh --install                 # wpina dyrektywy do main.cf
#   node-outbound-throttle.sh cordon user@example.com   # zablokuj nadawcę
#   node-outbound-throttle.sh cordon example.com        # zablokuj całą domenę
#   node-outbound-throttle.sh release user@example.com  # zwolnij
#   node-outbound-throttle.sh list                      # wypisz cordony
#
# Zmienne (env / /etc/default/verris-outbound):
#   OUTBOUND_MSG_RATE   (default 200)  — smtpd_client_message_rate_limit / 60s okno anvil
#   OUTBOUND_RCPT_RATE  (default 400)  — smtpd_client_recipient_rate_limit
#   ANVIL_RATE_WINDOW   (default 60s)  — okno anvil
# =============================================================================

set -Eeuo pipefail

[ -r /etc/default/verris-outbound ] && . /etc/default/verris-outbound

OUTBOUND_MSG_RATE="${OUTBOUND_MSG_RATE:-200}"
OUTBOUND_RCPT_RATE="${OUTBOUND_RCPT_RATE:-400}"
ANVIL_RATE_WINDOW="${ANVIL_RATE_WINDOW:-60s}"
CORDON_MAP="/etc/postfix/verris_outbound_cordon"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

command -v postconf >/dev/null 2>&1 || fail "Postfix (postconf) nie znaleziony — uruchom na węźle z Postfixem."

ensure_map() {
  if [ ! -f "$CORDON_MAP" ]; then
    : > "$CORDON_MAP"
    log "utworzono pustą mapę cordonów: $CORDON_MAP"
  fi
  [ -f "${CORDON_MAP}.db" ] || postmap "hash:${CORDON_MAP}"
}

reload_postfix() {
  postmap "hash:${CORDON_MAP}"
  postfix reload >/dev/null 2>&1 || systemctl reload postfix || service postfix reload
  log "Postfix przeładowany."
}

install_config() {
  ensure_map
  log "konfiguruję globalne limity tempa (anvil) + restrykcje nadawcy…"

  # Globalne limity anvil — obrona przed skokiem wysyłki z jednego klienta.
  postconf -e "anvil_rate_time_unit = ${ANVIL_RATE_WINDOW}"
  postconf -e "smtpd_client_message_rate_limit = ${OUTBOUND_MSG_RATE}"
  postconf -e "smtpd_client_recipient_rate_limit = ${OUTBOUND_RCPT_RATE}"

  # Wpięcie mapy cordonów w restrykcje nadawcy — REJECT dla zablokowanych.
  # Zachowujemy istniejące restrykcje i dokładamy check_sender_access na początku.
  local current
  current="$(postconf -h smtpd_sender_restrictions 2>/dev/null || true)"
  if ! printf '%s' "$current" | grep -q "hash:${CORDON_MAP}"; then
    if [ -n "$current" ]; then
      postconf -e "smtpd_sender_restrictions = check_sender_access hash:${CORDON_MAP}, ${current}"
    else
      postconf -e "smtpd_sender_restrictions = check_sender_access hash:${CORDON_MAP}, permit_mynetworks, permit_sasl_authenticated, reject"
    fi
    log "wpięto check_sender_access hash:${CORDON_MAP} w smtpd_sender_restrictions."
  else
    log "mapa cordonów już wpięta — pomijam."
  fi

  reload_postfix
  log "instalacja OK (msg_rate=${OUTBOUND_MSG_RATE}, rcpt_rate=${OUTBOUND_RCPT_RATE}, okno=${ANVIL_RATE_WINDOW})."
}

cordon_sender() {
  local who="$1"; [ -n "$who" ] || fail "podaj adres lub domenę do zablokowania"
  ensure_map
  # Usuń ewentualny stary wpis, dodaj REJECT z komunikatem.
  grep -viE "^[[:space:]]*${who//./\\.}[[:space:]]" "$CORDON_MAP" > "${CORDON_MAP}.tmp" 2>/dev/null || true
  mv "${CORDON_MAP}.tmp" "$CORDON_MAP"
  printf '%s\tREJECT Wysyłka wstrzymana (Verris ochrona antyspamowa). Kontakt: pomoc.\n' "$who" >> "$CORDON_MAP"
  reload_postfix
  log "CORDON nałożony na: ${who}"
}

release_sender() {
  local who="$1"; [ -n "$who" ] || fail "podaj adres lub domenę do zwolnienia"
  [ -f "$CORDON_MAP" ] || { log "mapa nie istnieje — nic do zwolnienia"; return 0; }
  grep -viE "^[[:space:]]*${who//./\\.}[[:space:]]" "$CORDON_MAP" > "${CORDON_MAP}.tmp" 2>/dev/null || true
  mv "${CORDON_MAP}.tmp" "$CORDON_MAP"
  reload_postfix
  log "CORDON zwolniony dla: ${who}"
}

list_cordons() {
  [ -f "$CORDON_MAP" ] || { echo "(brak cordonów)"; return 0; }
  echo "Aktywne cordony (${CORDON_MAP}):"
  grep -vE '^[[:space:]]*$' "$CORDON_MAP" || echo "(brak)"
}

case "${1:-}" in
  --install) install_config ;;
  cordon)    cordon_sender "${2:-}" ;;
  release)   release_sender "${2:-}" ;;
  list)      list_cordons ;;
  *) echo "Użycie: $0 {--install|cordon <adres|domena>|release <adres|domena>|list}"; exit 2 ;;
esac
