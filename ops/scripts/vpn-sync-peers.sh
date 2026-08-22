#!/usr/bin/env bash
# =============================================================================
# Verris — synchronizacja peerów WireGuard z control-plane (ETAP 8)
# -----------------------------------------------------------------------------
# Pull model: pobiera sekcje [Peer] z API (GET /agent/vpn/peers-config,
# nagłówek X-Vpn-Sync-Token), skleja z lokalną sekcją [Interface] i robi
# atomowe `wg syncconf wg0` (dodaje nowe, usuwa cofnięte — bez restartu).
#
# Instalacja timera (co 1 min):  bash ops/scripts/vpn-sync-peers.sh --install
# Wymagane env (np. /etc/default/verris-vpn-sync):
#   VPN_SYNC_API_URL   np. http://127.0.0.1:3000  (API z hosta; nie przez Caddy)
#   VPN_SYNC_TOKEN     ten sam co w .env.prod
# =============================================================================
set -Eeuo pipefail

WG_IF=wg0
WG_DIR=/etc/wireguard
ENV_FILE=/etc/default/verris-vpn-sync
STATE="$WG_DIR/peers.synced.conf"
LOG=/var/log/verris-vpn-sync.log

install_units() {
  cat > /usr/local/bin/verris-vpn-sync.sh < "$0"
  chmod 755 /usr/local/bin/verris-vpn-sync.sh
  if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<'ENV'
VPN_SYNC_API_URL=http://127.0.0.1:3000
VPN_SYNC_TOKEN=__UZUPELNIJ__
ENV
    chmod 600 "$ENV_FILE"
    echo "[vpn-sync] Uzupelnij $ENV_FILE (token z .env.prod)"
  fi
  cat > /etc/systemd/system/verris-vpn-sync.service <<'UNIT'
[Unit]
Description=Verris VPN peers sync (WireGuard)
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/default/verris-vpn-sync
ExecStart=/usr/bin/bash /usr/local/bin/verris-vpn-sync.sh
StandardOutput=append:/var/log/verris-vpn-sync.log
StandardError=append:/var/log/verris-vpn-sync.log
UNIT
  cat > /etc/systemd/system/verris-vpn-sync.timer <<'TIMER'
[Unit]
Description=Sync Verris VPN peers every minute

[Timer]
OnBootSec=60s
OnUnitActiveSec=1min
Persistent=true
Unit=verris-vpn-sync.service

[Install]
WantedBy=timers.target
TIMER
  systemctl daemon-reload
  systemctl enable --now verris-vpn-sync.timer
  echo "[vpn-sync] Zainstalowano verris-vpn-sync.timer"
  exit 0
}

[ "${1:-}" = "--install" ] && install_units

: "${VPN_SYNC_API_URL:?missing VPN_SYNC_API_URL}"
: "${VPN_SYNC_TOKEN:?missing VPN_SYNC_TOKEN}"
[ -f "$WG_DIR/$WG_IF.conf" ] || { echo "[vpn-sync] Brak $WG_DIR/$WG_IF.conf — uruchom vpn-wireguard-setup.sh" >&2; exit 1; }

PEERS=$(curl -fsS --max-time 15 -H "X-Vpn-Sync-Token: $VPN_SYNC_TOKEN" \
  "$VPN_SYNC_API_URL/agent/vpn/peers-config") || { echo "[vpn-sync] API niedostepne" >&2; exit 1; }

# Bez zmian → nic nie rób (oszczędza wg syncconf i logi).
if [ -f "$STATE" ] && printf '%s' "$PEERS" | cmp -s - "$STATE"; then
  exit 0
fi

# Pełna konfiguracja = [Interface] z wg0.conf (bez Address/DNS — syncconf ich
# nie przyjmuje; zostawiamy ListenPort/PrivateKey/FwMark) + peery z API.
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
awk '/^\[Interface\]/{flag=1} /^\[Peer\]/{flag=0} flag && /^(ListenPort|PrivateKey|FwMark)[[:space:]]*=/' "$WG_DIR/$WG_IF.conf" \
  | sed '1i [Interface]' > "$TMP"
printf '\n%s\n' "$PEERS" >> "$TMP"

wg syncconf "$WG_IF" "$TMP"
printf '%s' "$PEERS" > "$STATE"
chmod 600 "$STATE"
echo "[vpn-sync] $(date -u +%FT%TZ) zsynchronizowano peerow: $(grep -c '^\[Peer\]' "$TMP" || true)"
