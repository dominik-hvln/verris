#!/usr/bin/env bash
# =============================================================================
# Verris — Redis dla konta hostingowego (D-15/J-03): osobna instancja na konto, tylko gniazdo
# w katalogu konta (bez portu TCP), limit pamięci, bez zapisu na dysk. Uruchamiany przez agenta
# zadań (REDIS_ACCESS) z env:
#   RD_MODE        enable | disable
#   RD_DA_USER     login konta DA
#   RD_MEMORY_MB   limit pamięci Redis (domyślnie 64)
# Konfiguracja należy do roota (/etc/verris-redis/<login>.conf) — klient nie włączy portu TCP
# ani nie podniesie limitu; systemd pilnuje dodatkowo MemoryMax. Gniazdo: ~/.verris-redis/redis.sock
# (0700, widoczne w klatce CageFS klienta). Wynik: VERRIS_REDIS_SOCKET=<ścieżka>.
# RD_ETC / RD_SKIP_SYSTEMD dają się podmienić wyłącznie w testach.
# =============================================================================
set -Eeuo pipefail

: "${RD_MODE:?}"; : "${RD_DA_USER:?}"; : "${RD_MEMORY_MB:=64}"

log() { echo "[redis] $*"; }
fail() { log "BŁĄD: $*" >&2; exit 1; }

[[ "$RD_MODE" == "enable" || "$RD_MODE" == "disable" ]] || fail "nieznany tryb: $RD_MODE"
[[ "$RD_DA_USER" =~ ^[a-z][a-z0-9]{0,15}$ ]] || fail "nieprawidłowy login konta"
[[ "$RD_MEMORY_MB" =~ ^[0-9]{2,4}$ ]] && [ "$RD_MEMORY_MB" -ge 16 ] && [ "$RD_MEMORY_MB" -le 1024 ] || fail "nieprawidłowy limit pamięci"
id "$RD_DA_USER" >/dev/null 2>&1 || fail "brak użytkownika systemowego $RD_DA_USER"
HOME_DIR="$(getent passwd "$RD_DA_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] || fail "brak katalogu domowego konta"

ETC="${RD_ETC:-/etc/verris-redis}"
CONF="$ETC/$RD_DA_USER.conf"
DIR="$HOME_DIR/.verris-redis"
SOCK="$DIR/redis.sock"
UNIT="verris-redis@$RD_DA_USER.service"
jako_klient() { runuser -u "$RD_DA_USER" -- "$@"; }

if [ "$RD_MODE" = "disable" ]; then
  if [ "${RD_SKIP_SYSTEMD:-0}" = "1" ]; then
    jako_klient redis-cli -s "$SOCK" shutdown nosave >/dev/null 2>&1 || true
  else
    systemctl disable --now "$UNIT" >/dev/null 2>&1 || true
  fi
  rm -f "$CONF"
  log "Redis wyłączony dla $RD_DA_USER"
  log "Gotowe."
  exit 0
fi

REDIS_BIN="$(command -v redis-server || true)"
[ -n "$REDIS_BIN" ] || fail "Redis nie jest jeszcze zainstalowany na serwerze — napisz do nas"

install -d -m 755 "$ETC"
jako_klient sh -c 'umask 077; mkdir -p "$1"' _ "$DIR"
chmod 700 "$DIR"
umask 022
cat > "$CONF.tmp" <<CONF
# Zarządzane przez Verris — zmiany ręczne zostaną nadpisane.
port 0
unixsocket $SOCK
unixsocketperm 700
dir $DIR
maxmemory ${RD_MEMORY_MB}mb
maxmemory-policy allkeys-lru
save ""
appendonly no
daemonize no
protected-mode yes
# klient nie zmieni limitu ani katalogu zapisu przez gniazdo
rename-command CONFIG ""
CONF
mv -f "$CONF.tmp" "$CONF"

if [ "${RD_SKIP_SYSTEMD:-0}" = "1" ]; then
  jako_klient "$REDIS_BIN" "$CONF" --daemonize yes >/dev/null
else
  if [ ! -f /etc/systemd/system/verris-redis@.service ]; then
    cat > /etc/systemd/system/verris-redis@.service <<UNITF
[Unit]
Description=Verris Redis dla konta %i
After=network.target

[Service]
Type=simple
User=%i
ExecStart=$REDIS_BIN $ETC/%i.conf
Restart=on-failure
MemoryMax=$(( RD_MEMORY_MB * 2 ))M
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

for _ in $(seq 1 20); do
  [ -S "$SOCK" ] && jako_klient redis-cli -s "$SOCK" ping 2>/dev/null | grep -q PONG && break
  sleep 0.5
done
jako_klient redis-cli -s "$SOCK" ping 2>/dev/null | grep -q PONG || fail "Redis nie odpowiada po uruchomieniu"
log "Redis działa dla $RD_DA_USER (limit ${RD_MEMORY_MB} MB)"
echo "VERRIS_REDIS_SOCKET=$SOCK"
log "Gotowe."
