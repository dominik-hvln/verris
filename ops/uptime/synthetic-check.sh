#!/usr/bin/env bash
# =============================================================================
# Verris — niezależny synthetic uptime check (S-7)
# -----------------------------------------------------------------------------
# Uruchamiaj z ZEWNĘTRZNEGO hosta (inny dostawca niż control-plane!) w cronie.
# Sprawdza krytyczne ścieżki i wysyła alert na webhook przy błędzie.
# Deduplikacja: alertuje tylko przy ZMIANIE stanu (OK↔FAIL), nie co minutę.
#
# Env (/etc/default/verris-uptime lub inline):
#   API_URL      (default https://api.verris.pl)
#   PANEL_URL    (default https://panel.verris.pl)
#   STATUS_URL   (default https://status.verris.pl)
#   UPTIME_WEBHOOK_URL  — Slack/Discord/generic webhook (POST {text})
#   STATE_DIR    (default /tmp/verris-uptime)
# =============================================================================

set -uo pipefail
[ -r /etc/default/verris-uptime ] && . /etc/default/verris-uptime

API_URL="${API_URL:-https://api.verris.pl}"
PANEL_URL="${PANEL_URL:-https://panel.verris.pl}"
STATUS_URL="${STATUS_URL:-https://status.verris.pl}"
STATE_DIR="${STATE_DIR:-/tmp/verris-uptime}"
mkdir -p "$STATE_DIR"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*"; }

notify() {
  local msg="$1"
  log "ALERT: $msg"
  if [ -n "${UPTIME_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"🔴 Verris uptime: ${msg}\"}" "$UPTIME_WEBHOOK_URL" >/dev/null 2>&1 || \
      log "webhook wysyłka nieudana"
  fi
}

recover() {
  local name="$1"
  log "RECOVERED: $name"
  if [ -n "${UPTIME_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"🟢 Verris uptime: ${name} znów OK\"}" "$UPTIME_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

# check <name> <curl-args...> — porównuje z poprzednim stanem, alertuje na zmianie.
check() {
  local name="$1"; shift
  local statefile="${STATE_DIR}/${name}.state"
  local prev="ok"; [ -f "$statefile" ] && prev="$(cat "$statefile")"
  if "$@" >/dev/null 2>&1; then
    [ "$prev" = "fail" ] && recover "$name"
    echo ok > "$statefile"
  else
    [ "$prev" != "fail" ] && notify "${name} NIEDOSTĘPNY"
    echo fail > "$statefile"
    return 1
  fi
}

fail=0

# API readyz — 200
check "api-readyz" bash -c "curl -fsS -m 8 '${API_URL}/readyz' | grep -qiE 'ok|ready|true'" || fail=1
# API healthz — 200
check "api-healthz" curl -fsS -m 8 -o /dev/null "${API_URL}/healthz" || fail=1
# Panel klienta — kod < 500
check "panel" bash -c "code=\$(curl -s -m 8 -o /dev/null -w '%{http_code}' '${PANEL_URL}'); [ \"\$code\" -lt 500 ]" || fail=1
# Status page
check "status" bash -c "code=\$(curl -s -m 8 -o /dev/null -w '%{http_code}' '${STATUS_URL}'); [ \"\$code\" -lt 500 ]" || fail=1
# Login syntetyczny — musi zwrócić 401 (nie 5xx) dla złych danych
check "login" bash -c "code=\$(curl -s -m 8 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{\"email\":\"probe@verris.invalid\",\"password\":\"x\"}' '${API_URL}/auth/login'); [ \"\$code\" = '401' ] || [ \"\$code\" = '400' ] || [ \"\$code\" = '429' ]" || fail=1

[ "$fail" = 0 ] && log "wszystkie checki OK"
exit "$fail"
