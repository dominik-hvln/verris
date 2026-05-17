#!/usr/bin/env bash
# Usage: SEED_ADMIN_PASSWORD=... SEED_STAFF_PASSWORD=... ./ops/scripts/prod-seed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec \
  -e SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:?set SEED_ADMIN_PASSWORD}" \
  -e SEED_STAFF_PASSWORD="${SEED_STAFF_PASSWORD:-$SEED_ADMIN_PASSWORD}" \
  api /usr/local/bin/api-entrypoint.sh \
  node -e "require('child_process').execSync('npx --yes ts-node libs/database/prisma/seed.ts', { stdio: 'inherit' })"
