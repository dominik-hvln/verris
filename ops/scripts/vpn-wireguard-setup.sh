#!/usr/bin/env bash
# =============================================================================
# Verris — WireGuard VPN dla paneli wewnętrznych (ETAP 8) — setup hosta
# -----------------------------------------------------------------------------
# Uruchom RAZ na control-plane (root):
#   bash ops/scripts/vpn-wireguard-setup.sh
#
# Co robi:
#   1. Instaluje wireguard-tools.
#   2. Generuje parę kluczy SERWERA (private zostaje na hoście, 0600).
#   3. Tworzy /etc/wireguard/wg0.conf (interface 10.88.0.1/24, port 51820/udp).
#   4. Otwiera 51820/udp w firewallu (firewalld/nft — dopasuj jeśli inny).
#   5. systemctl enable --now wg-quick@wg0.
#   6. Wypisuje wartości do .env.prod:
#        VPN_WG_SERVER_PUBLIC_KEY, VPN_WG_ENDPOINT, VPN_SYNC_TOKEN
#
# Po setupie: zainstaluj timer synchronizacji peerów:
#   bash ops/scripts/vpn-sync-peers.sh --install
# =============================================================================
set -Eeuo pipefail

WG_DIR=/etc/wireguard
WG_IF=wg0
WG_PORT="${WG_PORT:-51820}"
WG_ADDR="${WG_ADDR:-10.88.0.1/24}"

[ "$(id -u)" = 0 ] || { echo "Uruchom jako root." >&2; exit 1; }

if ! command -v wg >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then dnf install -y wireguard-tools
  elif command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y wireguard-tools
  else echo "Zainstaluj wireguard-tools ręcznie." >&2; exit 1; fi
fi

mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"

if [ ! -f "$WG_DIR/server.key" ]; then
  umask 077
  wg genkey > "$WG_DIR/server.key"
  wg pubkey < "$WG_DIR/server.key" > "$WG_DIR/server.pub"
  echo "[vpn] Wygenerowano klucze serwera w $WG_DIR"
fi

SERVER_PRIV=$(cat "$WG_DIR/server.key")
SERVER_PUB=$(cat "$WG_DIR/server.pub")

if [ ! -f "$WG_DIR/$WG_IF.conf" ]; then
  cat > "$WG_DIR/$WG_IF.conf" <<CONF
# Verris VPN — interface (peery dosypywane przez vpn-sync-peers.sh / wg syncconf)
[Interface]
Address = $WG_ADDR
ListenPort = $WG_PORT
PrivateKey = $SERVER_PRIV
CONF
  chmod 600 "$WG_DIR/$WG_IF.conf"
  echo "[vpn] Utworzono $WG_DIR/$WG_IF.conf"
fi

# Firewall: 51820/udp
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$WG_PORT"/udp || true
  firewall-cmd --reload || true
elif command -v nft >/dev/null 2>&1; then
  echo "[vpn] Dodaj regułę nft: udp dport $WG_PORT accept (dopasuj do swojego rulesetu egress-lockdown)."
fi

systemctl enable --now "wg-quick@$WG_IF"
echo ""
echo "=== Wpisz do .env.prod (i zrestartuj api) ==="
echo "VPN_WG_SERVER_PUBLIC_KEY=$SERVER_PUB"
echo "VPN_WG_ENDPOINT=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<public-ip>'):$WG_PORT"
echo "VPN_SYNC_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 43)"
echo "# Zalecane: VPN_WG_CLIENT_ALLOWED_IPS=10.88.0.0/24,<public-ip-control-plane>/32"
echo ""
echo "Nastepnie: bash ops/scripts/vpn-sync-peers.sh --install"
