#!/bin/sh
# Build DATABASE_URL from POSTGRES_* when not set (avoids broken URLs when the
# password contains @ : / # ? etc.). Host must be the Docker service name.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "api-entrypoint: set DATABASE_URL or POSTGRES_PASSWORD in .env.prod" >&2
    exit 1
  fi
  enc_pass="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$POSTGRES_PASSWORD")"
  user="${POSTGRES_USER:-verris}"
  db="${POSTGRES_DB:-verris_db}"
  host="${POSTGRES_HOST:-postgres}"
  port="${POSTGRES_PORT:-5432}"
  export DATABASE_URL="postgresql://${user}:${enc_pass}@${host}:${port}/${db}?schema=public"
fi

exec "$@"
