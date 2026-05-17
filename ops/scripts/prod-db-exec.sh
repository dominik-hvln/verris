#!/usr/bin/env bash
# Run a command in the api container with DATABASE_URL built from POSTGRES_*.
# `docker compose exec` bypasses the image ENTRYPOINT, so plain `prisma` fails
# when DATABASE_URL is empty in .env.prod.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec api /usr/local/bin/api-entrypoint.sh "$@"
