#!/usr/bin/env bash
set -euo pipefail
"$(dirname "$0")/prod-db-exec.sh" \
  npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
