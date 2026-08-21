#!/usr/bin/env bash
# verris-node — łatwe łączenie z węzłami floty z control-plane.
#
# Uruchamiaj NA CONTROL-PLANE (ma klucz SSH do węzłów i dostęp do bazy):
#   ./ops/scripts/verris-node.sh list
#   ./ops/scripts/verris-node.sh ssh <nazwa|id|ip>
#   ./ops/scripts/verris-node.sh exec <nazwa|id|ip> -- <komenda...>
#   ./ops/scripts/verris-node.sh info <nazwa|id|ip>
#
# Węzły nie są w sieci WireGuard (WG obsługuje tylko panele admin/staff), więc
# łączymy się kluczem deploy z CP po publicznym IP — dokładnie jak
# prod-rollout-node-via-jump.sh. Inwentarz węzłów czytamy z bazy (kontener db).
#
# Nadpisywalne zmienne (jak w istniejących skryptach ops):
#   NODE_SSH_KEY   klucz do węzłów            (domyślnie /root/.ssh/verris_node_deploy)
#   NODE_SSH_USER  użytkownik SSH             (domyślnie root)
#   NODE_SSH_PORT  port SSH                   (domyślnie 22)
#   VERRIS_PG_SERVICE  nazwa usługi Postgres w compose (autodetekcja: db/postgres)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_SSH_KEY="${NODE_SSH_KEY:-/root/.ssh/verris_node_deploy}"
NODE_SSH_USER="${NODE_SSH_USER:-root}"
NODE_SSH_PORT="${NODE_SSH_PORT:-22}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"

die() { printf 'verris-node: %s\n' "$*" >&2; exit 1; }

cd "$REPO_ROOT"
[ -f "$ENV_FILE" ] || die "brak $ENV_FILE (uruchom na control-plane)"

# --- Postgres w kontenerze: usługa + poświadczenia z .env.prod ---------------
detect_pg_service() {
  if [ -n "${VERRIS_PG_SERVICE:-}" ]; then printf '%s' "$VERRIS_PG_SERVICE"; return; fi
  local svc
  svc="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config --services 2>/dev/null \
        | grep -E '^(db|postgres|postgresql)$' | head -1 || true)"
  [ -n "$svc" ] || die "nie wykryto usługi Postgres — ustaw VERRIS_PG_SERVICE"
  printf '%s' "$svc"
}

# Wczytujemy tylko POSTGRES_* z .env.prod (bez eksponowania reszty sekretów).
pg_env() { grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' ; }
PG_USER="$(pg_env POSTGRES_USER)"; PG_USER="${PG_USER:-verris}"
PG_DB="$(pg_env POSTGRES_DB)";     PG_DB="${PG_DB:-verris}"
PG_SERVICE="$(detect_pg_service)"

psql_q() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T "$PG_SERVICE" \
    psql -U "$PG_USER" -d "$PG_DB" -tA -F$'\t' -c "$1"
}

# Zwraca wiersze: name<TAB>id<TAB>ip<TAB>status<TAB>region (bez usuniętych).
all_nodes() {
  psql_q "SELECT COALESCE(name,'(bez nazwy)'), id, \"ipAddress\", status, COALESCE(region,'') \
          FROM \"Server\" WHERE status <> 'DELETED' ORDER BY name NULLS LAST;"
}

# Rozwiązuje selektor (nazwa / prefix id / dokładne IP) → wiersz węzła.
resolve_node() {
  local sel="$1" rows match
  rows="$(all_nodes)"
  [ -n "$rows" ] || die "brak węzłów w bazie"
  # 1) dokładne IP, 2) dokładna nazwa (ci), 3) prefix id, 4) fragment nazwy (ci)
  match="$(awk -F'\t' -v s="$sel" 'tolower($3)==tolower(s){print; exit}' <<<"$rows")"
  [ -z "$match" ] && match="$(awk -F'\t' -v s="$sel" 'tolower($1)==tolower(s){print; exit}' <<<"$rows")"
  [ -z "$match" ] && match="$(awk -F'\t' -v s="$sel" 'index($2,s)==1{print; exit}' <<<"$rows")"
  if [ -z "$match" ]; then
    local n; n="$(awk -F'\t' -v s="$sel" 'tolower($1) ~ tolower(s){print}' <<<"$rows")"
    [ "$(wc -l <<<"$n" | tr -d ' ')" = "1" ] && [ -n "$n" ] && match="$n"
    [ -z "$match" ] && die "nie znaleziono jednoznacznego wezla dla: $sel (sprobuj: verris-node list)"
  fi
  printf '%s' "$match"
}

node_ip()     { cut -f3 <<<"$1"; }
node_name()   { cut -f1 <<<"$1"; }
node_status() { cut -f4 <<<"$1"; }

ssh_base() {
  local ip="$1"
  ssh -i "$NODE_SSH_KEY" -p "$NODE_SSH_PORT" \
      -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
      "${NODE_SSH_USER}@${ip}"
}

require_key() { [ -f "$NODE_SSH_KEY" ] || die "brak klucza $NODE_SSH_KEY (ustaw NODE_SSH_KEY)"; }

cmd_list() {
  printf '%-22s %-10s %-16s %-12s %s\n' "NAZWA" "ID" "IP" "STATUS" "REGION"
  all_nodes | while IFS=$'\t' read -r name id ip status region; do
    printf '%-22s %-10s %-16s %-12s %s\n' "$name" "${id:0:8}" "$ip" "$status" "$region"
  done
}

cmd_info() {
  [ $# -ge 1 ] || die "użycie: verris-node info <nazwa|id|ip>"
  local row; row="$(resolve_node "$1")"
  IFS=$'\t' read -r name id ip status region <<<"$row"
  printf 'Nazwa:   %s\nID:      %s\nIP:      %s\nStatus:  %s\nRegion:  %s\nSSH:     ssh -i %s %s@%s\n' \
    "$name" "$id" "$ip" "$status" "$region" "$NODE_SSH_KEY" "$NODE_SSH_USER" "$ip"
}

cmd_ssh() {
  [ $# -ge 1 ] || die "użycie: verris-node ssh <nazwa|id|ip>"
  require_key
  local row ip name; row="$(resolve_node "$1")"; ip="$(node_ip "$row")"; name="$(node_name "$row")"
  printf 'verris-node: łączę z %s (%s)…\n' "$name" "$ip" >&2
  exec ssh -i "$NODE_SSH_KEY" -p "$NODE_SSH_PORT" \
       -o StrictHostKeyChecking=accept-new "${NODE_SSH_USER}@${ip}"
}

cmd_exec() {
  [ $# -ge 1 ] || die "użycie: verris-node exec <nazwa|id|ip> -- <komenda...>"
  require_key
  local row ip; row="$(resolve_node "$1")"; ip="$(node_ip "$row")"; shift
  [ "${1:-}" = "--" ] && shift
  [ $# -ge 1 ] || die "brak komendy po --"
  ssh_base "$ip" "$@"
}

usage() {
  cat >&2 <<EOF
verris-node — łączenie z węzłami floty (uruchamiaj na control-plane)

  verris-node list                       lista węzłów
  verris-node info <selektor>            szczegóły + gotowa komenda SSH
  verris-node ssh  <selektor>            interaktywna sesja SSH na węźle
  verris-node exec <selektor> -- <cmd>   jednorazowa komenda na węźle

Selektor: nazwa (fragment), początek ID lub dokładne IP.
EOF
  exit 1
}

case "${1:-}" in
  list)  shift; cmd_list "$@" ;;
  info)  shift; cmd_info "$@" ;;
  ssh)   shift; cmd_ssh  "$@" ;;
  exec)  shift; cmd_exec "$@" ;;
  ''|-h|--help|help) usage ;;
  *) die "nieznana komenda: $1 (verris-node --help)" ;;
esac
