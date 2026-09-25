#!/usr/bin/env bash
# =============================================================================
# Verris — Memcached dla konta hostingowego (D-16): osobna instancja na konto, tylko gniazdo UNIX
# w katalogu konta. Dokumentacja memcached (wiki ConfiguringServer): „-s <file> … If enabling this,
# TCP/UDP will be disabled”, -a maska gniazda (ósemkowo), -m pamięć na dane w MB.
# Uruchamiany przez agenta zadań (MEMCACHED_ACCESS) z env:
#   MC_MODE        enable | disable
#   MC_DA_USER     login konta DA
#   MC_MEMORY_MB   pamięć na dane (domyślnie 64)
# Proces działa jako klient (systemd verris-memcached@<login>, MemoryMax), gniazdo
# ~/.verris-memcached/memcached.sock (katalog 0700, maska 0700). Wynik: VERRIS_MEMCACHED_SOCKET=<ścieżka>.
# MC_SKIP_SYSTEMD daje się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${MC_MODE:?}"; : "${MC_DA_USER:?}"; : "${MC_MEMORY_MB:=64}"

log() { echo "[memcached] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$MC_MODE" == "enable" || "$MC_MODE" == "disable" ]] || fail "nieznany tryb: $MC_MODE"
[[ "$MC_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$MC_MEMORY_MB" =~ ^[0-9]{2,4}$ ]] && [ "$MC_MEMORY_MB" -ge 16 ] && [ "$MC_MEMORY_MB" -le 1024 ] || fail "nieprawidłowy limit pamięci"
id "$MC_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $MC_DA_USER"
HOME_DIR="$(getent passwd "$MC_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"

DIR="$HOME_DIR/.verris-memcached"
SOCK="$DIR/memcached.sock"
UNIT="verris-memcached@$MC_DA_USER.service"
ENVF="/etc/verris-memcached/$MC_DA_USER.env"
jako_klient() { runuser -u "$MC_DA_USER" -- "$@"; }

if [ "$MC_MODE" = "disable" ]; then
  if [ "${MC_SKIP_SYSTEMD:-0}" = "1" ]; then
    pkill -u "$MC_DA_USER" -f "memcached -s $SOCK" >/dev/null 2>&1 || true
  else
    systemctl disable --now "$UNIT" >/dev/null 2>&1 || true
  fi
  rm -f "$ENVF"
  log "Memcached wyłączony dla $MC_DA_USER"
  log "Gotowe."
  exit 0
fi

MC_BIN="$(command -v memcached || true)"
[ -n "$MC_BIN" ] || fail "Memcached nie jest jeszcze zainstalowany na serwerze — napisz do nas"
[ ! -L "$DIR" ] || fail "katalog gniazda jest dowiązaniem symbolicznym"
jako_klient sh -c 'umask 077; mkdir -p "$1"' _ "$DIR"
chmod 700 "$DIR"

if [ "${MC_SKIP_SYSTEMD:-0}" = "1" ]; then
  jako_klient "$MC_BIN" -s "$SOCK" -a 0700 -m "$MC_MEMORY_MB" -c 256 -d
else
  install -d -m 755 /etc/verris-memcached
  printf 'MC_MEMORY_MB=%s\n' "$MC_MEMORY_MB" > "$ENVF"
  if [ ! -f /etc/systemd/system/verris-memcached@.service ]; then
    cat > /etc/systemd/system/verris-memcached@.service <<UNITF
[Unit]
Description=Verris Memcached dla konta %i
After=network.target

[Service]
Type=simple
User=%i
EnvironmentFile=/etc/verris-memcached/%i.env
ExecStart=$MC_BIN -s /home/%i/.verris-memcached/memcached.sock -a 0700 -m \${MC_MEMORY_MB} -c 256
Restart=on-failure
MemoryMax=$(( MC_MEMORY_MB * 2 ))M
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
UNITF
    systemctl daemon-reload
  fi
  systemctl enable "$UNIT" >/dev/null 2>&1
  systemctl restart "$UNIT"
fi

odpowiada() { jako_klient python3 - "$SOCK" <<'PY'
import socket, sys
s = socket.socket(socket.AF_UNIX); s.settimeout(2); s.connect(sys.argv[1]); s.sendall(b"version\r\n")
sys.exit(0 if s.recv(64).startswith(b"VERSION") else 1)
PY
}
for _ in $(seq 1 20); do
  [ -S "$SOCK" ] && odpowiada 2>/dev/null && break
  sleep 0.5
done
odpowiada 2>/dev/null || fail "Memcached nie odpowiada po uruchomieniu"
log "Memcached działa dla $MC_DA_USER (${MC_MEMORY_MB} MB)"
echo "VERRIS_MEMCACHED_SOCKET=$SOCK"
log "Gotowe."
