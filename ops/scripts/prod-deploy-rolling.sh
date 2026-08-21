#!/usr/bin/env bash
# =============================================================================
# Verris — rolling deploy na prod (STAB-1) — eliminacja okna 502/503
#
# Różnica względem prod-deploy-release.sh:
#   1. Najpierw BUDUJEMY wszystkie obrazy (stare kontenery dalej obsługują ruch).
#   2. Migracje DB (muszą być wstecznie zgodne — patrz uwaga niżej).
#   3. Recreacja usług POJEDYNCZO, z bramką health-check po każdej — nie ma
#      momentu, w którym wszystkie panele/API padają naraz.
#   Połączone z aktywnym health-check Caddy (health_uri + lb_try_duration 30s)
#   i graceful-drain API (SIGTERM → /readyz 503) → żądania w oknie restartu są
#   przetrzymywane/retryowane zamiast zwracać 502/503.
#
# WAŻNE (migracje): rolling deploy zakłada migracje wstecznie zgodne
#   (expand→contract). Nigdy nie usuwaj kolumny/tabeli w tej samej migracji,
#   w której przestaje jej używać kod — najpierw wdroż kod, potem osobno
#   „contract". Dla zmian niezgodnych użyj okna maintenance.
#
# Użycie: cd /opt/verris && ./ops/scripts/prod-deploy-rolling.sh
# =============================================================================
set -Eeuo pipefail

BRANCH="${DEPLOY_BRANCH:-live-release-readiness}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
# Kolejność: API najpierw (panele zależą od niego), potem panele, na końcu status.
ROLL_SERVICES="${ROLL_SERVICES:-api client-panel staff-panel admin-panel status-page}"
# Usługi infra/obserwowalności — odświeżamy bez bramki health (nie są na ścieżce klienta).
SIDE_SERVICES="${SIDE_SERVICES:-prometheus grafana loki promtail postgres-exporter redis-exporter node-exporter cadvisor}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"   # s — maks. czas oczekiwania na healthy

DC=(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}")

cd "$(dirname "$0")/../.."
echo "[deploy] $(pwd) branch=${BRANCH} (rolling)"

git fetch origin "${BRANCH}"
git -c safe.directory="$(pwd)" checkout "${BRANCH}"
git -c safe.directory="$(pwd)" pull origin "${BRANCH}"
echo "[deploy] HEAD: $(git -c safe.directory="$(pwd)" log -1 --oneline)"

# 1) Zbuduj WSZYSTKIE obrazy zanim cokolwiek ruszymy (stare kontenery żyją).
echo "[deploy] build wszystkich obrazów (bez przerywania ruchu)…"
"${DC[@]}" build ${ROLL_SERVICES}

# 2) Migracje DB (wstecznie zgodne) — przed recreacją kodu.
echo "[deploy] migracje bazy…"
bash ops/scripts/prod-migrate-deploy.sh

# 3) Recreacja usług pojedynczo z bramką health-check.
wait_healthy() {
  local svc="$1"
  local cid
  cid="$("${DC[@]}" ps -q "${svc}" 2>/dev/null | head -n1)"
  if [[ -z "${cid}" ]]; then
    echo "[deploy] WARN: brak kontenera dla ${svc} — pomijam bramkę health"
    return 0
  fi
  # Jeśli usługa nie ma healthchecku, Docker zwróci puste/'<no value>' — wtedy
  # tylko sprawdzamy, że kontener działa.
  local has_hc
  has_hc="$(docker inspect -f '{{if .State.Health}}yes{{end}}' "${cid}" 2>/dev/null || true)"
  if [[ "${has_hc}" != "yes" ]]; then
    echo "[deploy] ${svc}: brak healthchecku — sprawdzam tylko status running"
    docker inspect -f '{{.State.Status}}' "${cid}"
    return 0
  fi
  echo -n "[deploy] ${svc}: czekam na healthy "
  local waited=0
  while (( waited < HEALTH_TIMEOUT )); do
    local st
    st="$(docker inspect -f '{{.State.Health.Status}}' "${cid}" 2>/dev/null || echo unknown)"
    if [[ "${st}" == "healthy" ]]; then echo " OK"; return 0; fi
    if [[ "${st}" == "unhealthy" ]]; then
      echo " UNHEALTHY"; echo "[deploy] logi ${svc}:"; "${DC[@]}" logs --tail 40 "${svc}" || true
      return 1
    fi
    sleep 3; waited=$((waited+3)); echo -n "."
  done
  echo " TIMEOUT (${HEALTH_TIMEOUT}s)"; "${DC[@]}" logs --tail 40 "${svc}" || true
  return 1
}

for svc in ${ROLL_SERVICES}; do
  echo "[deploy] → recreacja ${svc}"
  # --no-deps: nie restartuj zależności (API/DB) przy odświeżaniu paneli.
  "${DC[@]}" up -d --no-deps "${svc}"
  if ! wait_healthy "${svc}"; then
    echo "[deploy] BŁĄD: ${svc} nie wstał zdrowo — przerywam (poprzednie usługi już działają na nowej wersji)."
    exit 1
  fi
done

# 4) Usługi poboczne (obserwowalność) — odśwież bez bramki.
echo "[deploy] odświeżam usługi poboczne…"
"${DC[@]}" up -d ${SIDE_SERVICES} 2>/dev/null || true

# 5) Przeładuj Caddy (gdyby zmienił się Caddyfile) — bez restartu kontenera.
if "${DC[@]}" ps -q caddy >/dev/null 2>&1; then
  echo "[deploy] reload Caddy (bez przerwy)…"
  "${DC[@]}" exec -w /etc/caddy caddy caddy reload 2>/dev/null \
    || "${DC[@]}" up -d caddy
fi

"${DC[@]}" ps

if [[ "${DEPLOY_PRUNE_BUILD_CACHE:-1}" != "0" ]]; then
  echo "[deploy] prune build cache…"
  docker builder prune -af >/dev/null 2>&1 || true
  df -h / | awk 'NR==2 { print "[deploy] disk:", $3, "used,", $4, "avail,", $5 }'
fi

echo "[deploy] rolling done ✓"
