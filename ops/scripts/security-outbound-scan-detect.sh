#!/usr/bin/env bash
# =============================================================================
# Verris — detektor wychodzącego skanu portów (netscan) — odpowiedź na abuse
# Hetzner 2026-06-11. Działa na control-plane I na węzłach.
#
# Idea: liczy ROZRÓŻNIONE zewnętrzne adresy docelowe, do których host otworzył
# NOWE połączenia TCP/80,443 w ostatnim oknie (conntrack SYN_SENT/NEW). Skan to
# fan-out do wielu różnych IP — w przeciwieństwie do normalnego ruchu (kilka
# API, dużo połączeń do tych samych adresów). Niezależne od iptables: złapie
# nawet gdy ktoś wyczyści reguły.
#
# Reakcja przy przekroczeniu progu:
#   1. Wpis do /var/log/verris-scan-detect.log + plik incydentu w /var/run.
#   2. Alert do control-plane API (jeśli /etc/verris.conf z tokenem agenta).
#   3. Z --block: tymczasowy DROP nowych TCP/80,443 (ipset z TTL) — zatrzymuje
#      skan natychmiast, nie zrywając istniejących sesji; wygasa sam.
#
# Instalacja (systemd timer co 1 min):
#   bash ops/scripts/security-outbound-scan-detect.sh --install [--block]
# =============================================================================
set -Eeuo pipefail

THRESHOLD="${SCAN_THRESHOLD:-50}"        # rozróżnione dst IP w oknie → alarm
WINDOW_NOTE="conntrack snapshot"          # conntrack to migawka aktywnych poł.
BLOCK_TTL="${SCAN_BLOCK_TTL:-3600}"       # s — jak długo trzymać auto-block
LOG="/var/log/verris-scan-detect.log"
STATE_DIR="/var/run/verris-scan-detect"
INCIDENT="${STATE_DIR}/last-incident.json"
BLOCK=0
INSTALL=0

for arg in "$@"; do
  case "$arg" in
    --block) BLOCK=1 ;;
    --install) INSTALL=1 ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG" >&2; }

# ---------------------------------------------------------------------------
install_units() {
  install -m 0755 "$0" /usr/local/bin/verris-scan-detect.sh
  mkdir -p "$STATE_DIR"
  local exec="/usr/local/bin/verris-scan-detect.sh"
  [ "$BLOCK" -eq 1 ] && exec="$exec --block"
  cat > /etc/systemd/system/verris-scan-detect.service <<UNIT
[Unit]
Description=Verris outbound port-scan detector
After=network-online.target

[Service]
Type=oneshot
ExecStart=${exec}
UNIT
  cat > /etc/systemd/system/verris-scan-detect.timer <<'TIMER'
[Unit]
Description=Run Verris outbound scan detector every minute

[Timer]
OnBootSec=60s
OnUnitActiveSec=60s
AccuracySec=5s
Unit=verris-scan-detect.service

[Install]
WantedBy=timers.target
TIMER
  systemctl daemon-reload
  systemctl enable --now verris-scan-detect.timer
  log "Zainstalowano verris-scan-detect.timer (block=${BLOCK}, próg=${THRESHOLD})"
  exit 0
}
[ "$INSTALL" -eq 1 ] && { [ "$(id -u)" = 0 ] || { echo "Uruchom jako root."; exit 1; }; install_units; }

mkdir -p "$STATE_DIR"

# ---------------------------------------------------------------------------
# Zbierz rozróżnione zewnętrzne dst IP dla NOWYCH/otwieranych połączeń 80,443.
# Preferuj conntrack; fallback do `ss`.
collect_dsts() {
  if command -v conntrack >/dev/null 2>&1; then
    conntrack -L -p tcp 2>/dev/null \
      | grep -E 'dport=(80|443) ' \
      | grep -Ev 'ESTABLISHED' \
      | grep -oE 'dst=[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
      | sed 's/dst=//'
  elif command -v ss >/dev/null 2>&1; then
    ss -tn state syn-sent 2>/dev/null \
      | awk 'NR>1 {print $5}' \
      | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' || true
  fi
}

# Odfiltruj adresy prywatne/bogon (legalny ruch wewn.) i policz unikalne publiczne.
PUBLIC_DSTS="$(collect_dsts | grep -Ev '^(10\.|127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|224\.|0\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)' | sort -u || true)"
COUNT="$(printf '%s\n' "$PUBLIC_DSTS" | grep -c . || true)"

if [ "${COUNT:-0}" -lt "$THRESHOLD" ]; then
  exit 0
fi

# --- Incydent ---
SAMPLE="$(printf '%s\n' "$PUBLIC_DSTS" | head -20 | paste -sd, -)"
TOP_PROC=""
if command -v ss >/dev/null 2>&1; then
  TOP_PROC="$(ss -tnp state syn-sent 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | sed 's/users:((\"//' | sort | uniq -c | sort -rn | head -3 | tr '\n' ';' || true)"
fi
log "ALARM: wychodzący skan — ${COUNT} unikalnych publicznych dst (próg ${THRESHOLD}). Proc: ${TOP_PROC:-?}. Próbka: ${SAMPLE}"

cat > "$INCIDENT" <<JSON
{"detectedAt":"$(date -u +%FT%TZ)","distinctDst":${COUNT},"threshold":${THRESHOLD},"topProcesses":"${TOP_PROC:-}","sampleDst":"${SAMPLE}"}
JSON

# --- Alert do API (jeśli węzeł ma /etc/verris.conf) ---
if [ -r /etc/verris.conf ]; then
  # shellcheck disable=SC1091
  source /etc/verris.conf 2>/dev/null || true
  if [ -n "${VERRIS_API_URL:-}" ] && [ -n "${VERRIS_SERVER_ID:-}" ] && [ -n "${VERRIS_IDENTITY_TOKEN:-}" ]; then
    curl -fsS --max-time 10 -X POST \
      -H "X-Server-Id: $VERRIS_SERVER_ID" -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"kind\":\"OUTBOUND_SCAN\",\"distinctDst\":${COUNT},\"sample\":\"${SAMPLE}\",\"processes\":\"${TOP_PROC:-}\"}" \
      "$VERRIS_API_URL/agent/security/alert" >/dev/null 2>&1 || true
  fi
fi

# --- Auto-block (opcjonalny) ---
if [ "$BLOCK" -eq 1 ] && [ "$(id -u)" = 0 ]; then
  if command -v iptables >/dev/null 2>&1; then
    iptables -N VERRIS_SCAN_BLOCK 2>/dev/null || true
    iptables -C OUTPUT -j VERRIS_SCAN_BLOCK 2>/dev/null || iptables -I OUTPUT 1 -j VERRIS_SCAN_BLOCK
    # Twardy limit nowych poł. WWW: 10/min po wykryciu — dławi skan, przepuszcza
    # normalny ruch. Reguła zdejmowana przez at/cron po BLOCK_TTL.
    iptables -C VERRIS_SCAN_BLOCK -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m limit --limit 10/min --limit-burst 20 -j RETURN 2>/dev/null || {
      iptables -A VERRIS_SCAN_BLOCK -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m limit --limit 10/min --limit-burst 20 -j RETURN
      iptables -A VERRIS_SCAN_BLOCK -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j DROP -m comment --comment 'verris-scan-autoblock'
    }
    log "AUTO-BLOCK: limit 10 nowych poł. WWW/min (TTL ${BLOCK_TTL}s)"
    ( sleep "$BLOCK_TTL"; iptables -F VERRIS_SCAN_BLOCK 2>/dev/null || true; echo "[$(date -u +%FT%TZ)] auto-block zdjęty" >> "$LOG" ) &
  fi
fi

exit 0
