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
df -i / 2>/dev/null | tail -1 | awk '{print "inodes used:", $3, "avail:", $4, "pct:", $5}'

section "CPU / load"
uptime 2>/dev/null || true

section "API health"
for path in healthz readyz; do
  if curl -sf --max-time 10 "https://api.verris.pl/${path}" >/dev/null 2>&1; then
    echo "GET https://api.verris.pl/${path} → OK"
  else
    echo "GET https://api.verris.pl/${path} → FAIL"
  fi
done

section "Panele (HTTP)"
for url in \
  "https://panel.verris.pl/" \
  "https://staff.verris.pl/" \
  "https://admin.verris.pl/" \
  "https://status.verris.pl/"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$url" 2>/dev/null || echo "ERR")
  echo "$url → HTTP $code"
done

section "Backup MinIO (ostatni obiekt)"
# Nazwa obiektu z JEDNEGO miejsca (ops/lib/backup-crypto.sh). Do 2026-08-22
# stało tu na sztywno "latest.sql.gz" — obiekt, którego produkcja nie tworzy,
# bo szyfrowanie dokłada sufiks .age. Ten snapshot meldował więc brak kopii
# także wtedy, gdyby kopie działały, i nikt już go nie czytał.
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
  # shellcheck source=ops/lib/backup-crypto.sh
  source "${ROOT}/ops/lib/backup-crypto.sh"
  OBIEKT_KOPII="$(backup_crypto_latest_object)"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps \
    --entrypoint /bin/sh -e "OBIEKT_KOPII=${OBIEKT_KOPII}" minio-bootstrap -c '
    mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null
    mc stat "verris/${S3_BUCKET_BACKUPS:-verris-backups}/postgres/${OBIEKT_KOPII}" 2>/dev/null \
      || echo "BRAK KOPII: ${OBIEKT_KOPII}"
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
