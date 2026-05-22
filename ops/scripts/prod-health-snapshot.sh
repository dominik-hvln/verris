#!/usr/bin/env bash
# =============================================================================
# Verris — snapshot metryk do PROD_HEALTH_CHECKLIST (C.7)
# Uruchom na serwerze: cd /opt/verris && bash ops/scripts/prod-health-snapshot.sh
# =============================================================================
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "# Prod health snapshot — $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

section() { echo ""; echo "## $1"; echo ""; }

section "Docker (RAM / CPU)"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null || echo "(docker stats failed)"

section "Dysk"
df -h / /var 2>/dev/null | head -5

section "API health"
if curl -sf --max-time 5 https://api.verris.pl/healthz >/dev/null 2>&1; then
  echo "GET https://api.verris.pl/healthz → OK"
else
  echo "GET https://api.verris.pl/healthz → FAIL (sprawdź Caddy/API)"
fi

section "Backup MinIO (ostatni obiekt)"
if [[ -f "$ENV_FILE" ]]; then
  set -a && source "$ENV_FILE" && set +a
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps \
    --entrypoint /bin/sh minio-bootstrap -c '
    mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null
    mc stat verris/verris-backups/postgres/latest.sql.gz 2>/dev/null || echo "brak latest.sql.gz"
  ' 2>/dev/null || echo "(mc stat failed — sprawdź MinIO)"
else
  echo "Brak $ENV_FILE"
fi

section "Cron backup"
if [[ -f /var/log/verris-backup.log ]]; then
  tail -3 /var/log/verris-backup.log
else
  echo "Brak /var/log/verris-backup.log"
fi

echo ""
echo "Wklej powyższe wartości do PROD_HEALTH_CHECKLIST.md (sekcje 1, 2, 7)."
