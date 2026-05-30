#!/usr/bin/env bash
# =============================================================================
# Verris — deploy release na prod (control-plane)
# Uruchamiaj na serwerze: cd /opt/verris && ./ops/scripts/prod-deploy-release.sh
# =============================================================================
set -Eeuo pipefail

BRANCH="${DEPLOY_BRANCH:-live-release-readiness}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
SERVICES="${DEPLOY_SERVICES:-api client-panel admin-panel staff-panel prometheus grafana}"

cd "$(dirname "$0")/../.."
echo "[deploy] $(pwd) branch=${BRANCH}"

git fetch origin "${BRANCH}"
git -c safe.directory="$(pwd)" checkout "${BRANCH}"
git -c safe.directory="$(pwd)" pull origin "${BRANCH}"
echo "[deploy] HEAD: $(git log -1 --oneline)"

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build ${SERVICES}
bash ops/scripts/prod-migrate-deploy.sh

sleep 10
if curl -sf http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
  echo "[deploy] API healthz OK (internal)"
else
  echo "[deploy] WARN: internal healthz failed — check: docker compose logs api"
fi

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

# INF-2: reclaim unused build cache so repeated panel/API builds do not fill disk (see docs/HOSTING_LAUNCH_TASKS.md)
if [[ "${DEPLOY_PRUNE_BUILD_CACHE:-1}" != "0" ]]; then
  echo "[deploy] pruning unused docker build cache…"
  docker builder prune -af >/dev/null 2>&1 || true
  df -h / | awk 'NR==2 { print "[deploy] disk:", $3, "used,", $4, "avail,", $5 }'
fi

echo "[deploy] done"
