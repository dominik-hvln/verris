#!/usr/bin/env bash
# Uruchamia / odświeża rozszerzony stack observability (Loki, Promtail, node-exporter, cAdvisor).
# cd /opt/verris && ./ops/scripts/prod-obs-stack-up.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"

SERVICES=(node-exporter cadvisor loki promtail prometheus grafana api)

echo "[obs] docker compose up: ${SERVICES[*]}"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d "${SERVICES[@]}"

echo "[obs] reload prometheus (optional)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T prometheus \
  wget -qO- --post-data='' http://127.0.0.1:9090/-/reload 2>/dev/null || true

echo "[obs] targets (sample)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T prometheus \
  wget -qO- 'http://127.0.0.1:9090/api/v1/targets' 2>/dev/null | head -c 800 || true

echo ""
echo "[obs] Grafana: folder Verris → Ops overview + Logs explorer"
