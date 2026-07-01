#!/usr/bin/env bash
# =============================================================================
# DEPLOY-1 — deploy control-plane z gotowych obrazów GHCR (model „jak Render").
# Wywoływane z GitHub Actions po SSH. NIE buduje na serwerze — pobiera obrazy
# po tagu (IMAGE_TAG=git SHA), robi `prisma migrate deploy` (raz), rolling
# restart, health-check /healthz i AUTO-ROLLBACK do ostatniego dobrego tagu.
#
# Wymagane env:
#   REGISTRY_PREFIX  np. ghcr.io/hvln
#   IMAGE_TAG        np. <git-sha>
# =============================================================================
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GHCR_OVERRIDE="${GHCR_OVERRIDE:-docker-compose.ghcr.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
APP_SERVICES="api client-panel staff-panel admin-panel status-page"
# API nie publikuje portu 3000 na host (słucha tylko w sieci dockera, Caddy woła
# je po nazwie), więc health-check MUSI iść WEWNĄTRZ kontenera api, nie z hosta.
HEALTH_PATH="${HEALTH_PATH:-http://127.0.0.1:3000/healthz}"
LAST_GOOD_FILE=".last-good-image-tag"

: "${REGISTRY_PREFIX:?REGISTRY_PREFIX wymagany (np. ghcr.io/owner)}"
: "${IMAGE_TAG:?IMAGE_TAG wymagany (git SHA)}"

cd "$(dirname "$0")/../.."
compose() { docker compose -f "$COMPOSE_FILE" -f "$GHCR_OVERRIDE" --env-file "$ENV_FILE" "$@"; }

echo "[deploy] tag=${IMAGE_TAG} prefix=${REGISTRY_PREFIX}"

# Kod (compose/migracje/skrypty) musi być spójny z obrazem — pobierz repo do SHA.
git -c safe.directory="$(pwd)" fetch origin "${IMAGE_TAG}" --depth 1 2>/dev/null || git fetch origin
git -c safe.directory="$(pwd)" checkout -q "${IMAGE_TAG}" 2>/dev/null || echo "[deploy] WARN: checkout ${IMAGE_TAG} pominięty"

PREV_TAG="$(cat "$LAST_GOOD_FILE" 2>/dev/null || echo '')"

# 1) Pobierz nowe obrazy (bez ruszania działających kontenerów).
REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$IMAGE_TAG" compose pull ${APP_SERVICES}

# 2) Rolling restart na gotowych obrazach (bez budowania). Migracje są wstecznie
#    kompatybilne (wzorzec expand→contract, migracje idempotentne IF NOT EXISTS),
#    więc nowy kod może chwilę działać przed `migrate deploy`.
REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$IMAGE_TAG" compose up -d --no-build ${APP_SERVICES}

# 3) Faza release — migracje bazy przez działający kontener api (obraz zawiera
#    prisma + migracje). Reużywa sprawdzonego skryptu (exec + DATABASE_URL).
echo "[deploy] prisma migrate deploy…"
if ! bash ops/scripts/prod-migrate-deploy.sh; then
  echo "[deploy] FAIL: migracje nie przeszły."
  if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$IMAGE_TAG" ]; then
    echo "[deploy] ROLLBACK → ${PREV_TAG} (przed health-checkiem)"
    REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$PREV_TAG" compose up -d --no-build ${APP_SERVICES} || true
  fi
  exit 1
fi

# 4) Health-gate — WEWNĄTRZ kontenera api (port 3000 nie jest na hoście).
#    Próbujemy wget, potem curl, a na końcu node (obraz api zawsze ma node).
echo "[deploy] health-check (in-container) ${HEALTH_PATH}…"
health_probe() {
  compose exec -T api sh -lc '
    wget -qO- "'"$HEALTH_PATH"'" 2>/dev/null \
      || curl -sf "'"$HEALTH_PATH"'" 2>/dev/null \
      || node -e "fetch(\"'"$HEALTH_PATH"'\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  ' >/dev/null 2>&1
}
OK=0
for i in $(seq 1 30); do
  if health_probe; then OK=1; break; fi
  sleep 3
done

if [ "$OK" = "1" ]; then
  echo "[deploy] OK — wersja ${IMAGE_TAG} zdrowa."
  echo "$IMAGE_TAG" > "$LAST_GOOD_FILE"
  [ "${DEPLOY_PRUNE_BUILD_CACHE:-1}" != "0" ] && docker image prune -f >/dev/null 2>&1 || true
  compose ps
  exit 0
fi

# 5) Auto-rollback do ostatniego dobrego tagu.
echo "[deploy] ERROR: health-check nie przeszedł."
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$IMAGE_TAG" ]; then
  echo "[deploy] ROLLBACK → ${PREV_TAG}"
  REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$PREV_TAG" compose pull ${APP_SERVICES} || true
  REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$PREV_TAG" compose up -d --no-build ${APP_SERVICES}
  echo "[deploy] przywrócono ${PREV_TAG}. Deploy ${IMAGE_TAG} ODRZUCONY."
else
  echo "[deploy] brak poprzedniego dobrego tagu — ręczna interwencja wymagana."
fi
exit 1
