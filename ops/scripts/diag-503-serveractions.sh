#!/usr/bin/env bash
# =============================================================================
# Verris — diagnostyka intermittentnych 503 na server-action (panel kliencki).
# Uruchom NA SERWERZE control-plane: cd /opt/verris && bash ops/scripts/diag-503-serveractions.sh
# READ-ONLY (poza krótką serią testowych GET-ów na panel).
# =============================================================================
set -uo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"
PANEL="${BASE_PANEL:-https://panel.verris.pl}"
sec(){ echo; echo "=== $1 ==="; }

sec "1. Zużycie zasobów kontenerów (CPU/RAM)"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null | grep -Ei 'name|client-panel|caddy|api' || echo "(docker stats niedostępne)"

sec "2. Restarty / status kontenera client-panel (OOMKilled?)"
cid=$($DC ps -q client-panel 2>/dev/null)
if [ -n "$cid" ]; then
  docker inspect "$cid" --format 'RestartCount={{.RestartCount}}  OOMKilled={{.State.OOMKilled}}  Status={{.State.Status}}  Started={{.State.StartedAt}}' 2>/dev/null
  echo "--- limit pamięci kontenera ---"
  docker inspect "$cid" --format 'MemLimit(bytes)={{.HostConfig.Memory}}' 2>/dev/null
else
  echo "(nie znaleziono kontenera client-panel)"
fi

sec "3. Logi client-panel — błędy / OOM / server actions (ostatnie 300 linii)"
$DC logs --tail 300 client-panel 2>&1 | grep -iE "error|unhandled|heap|out of memory|ECONN|ETIMEDOUT|fatal|killed|action" | tail -40 || echo "(brak dopasowań)"

sec "4. Logi Caddy — 503/502 i problemy z upstream client-panel"
$DC logs --tail 500 caddy 2>&1 | grep -iE "503|502|upstream|dial tcp|no upstreams|client-panel" | tail -40 || echo "(brak dopasowań)"

sec "5. Test serii równoległych POST (server-action) — szukamy 503"
# Wysyła 20 równoległych POST-ów na nieistniejącą akcję (spodziewane 400/404/405),
# ale jeśli pojawia się 503 → potwierdza problem przeciążenia/upstreamu.
codes=$(for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PANEL/dashboard" \
    -H 'content-type: text/plain' --data 'x' --max-time 15 &
done; wait)
echo "$codes" | sort | uniq -c | sed 's/^/  /'
echo "  (jeśli widać 503 → upstream/przeciążenie; jeśli tylko 4xx → server actions zdrowe pod obciążeniem)"

sec "Wniosek / co dalej"
echo "  • OOMKilled=true lub rosnący RestartCount → kontener client-panel ma za mało RAM: zwiększ limit w ${COMPOSE_FILE} (deploy.resources.limits.memory) i/lub NODE_OPTIONS=--max-old-space-size."
echo "  • 503 w logach Caddy z 'no upstreams'/'dial tcp' → client-panel chwilowo nie odpowiada (restart/zawieszenie)."
echo "  • 503 tylko pod serią równoległą → rozważ więcej replik client-panel lub wyższy limit współbieżności."
echo "  • Brak 503 w teście → problem był przejściowy (jednorazowy restart/cold start)."
