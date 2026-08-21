#!/usr/bin/env bash
# Requires a freshly built `api` image that includes new prisma/migrations/* folders.
# Run after: docker compose ... up -d --build api
set -euo pipefail
"$(dirname "$0")/prod-db-exec.sh" \
  npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
