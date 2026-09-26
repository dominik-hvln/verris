#!/usr/bin/env bash
# =============================================================================
# Migracje Payload dla apps/www (schemat `payload` w Postgresie).
#
# Uruchamiane przez prod-deploy-ghcr.sh PRZED startem nowego obrazu www —
# schemat musi wyprzedzać kod (expand → contract). Nieudana migracja przerywa deploy.
#
# Obraz produkcyjny www jest „standalone" i nie zawiera CLI Payloada, dlatego
# migracja idzie z jednorazowego kontenera Node z zamontowanym repo.
#
# Połączenie przez zmienne PG* (nie DATABASE_URI) — payload.config.ts preferuje je,
# dzięki czemu hasło ze znakami specjalnymi nie wymaga enkodowania URL.
# =============================================================================
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

ENV_FILE="${ENV_FILE:-.env.prod}"
NODE_IMAGE="${MIGRATE_NODE_IMAGE:-node:24-trixie-slim}"

[ -f "$ENV_FILE" ] || { echo "[migrate-www] brak $ENV_FILE"; exit 1; }

# Sieć wewnętrzna, w której działa postgres.
NET="${MIGRATE_NETWORK:-$(docker network ls --format '{{.Name}}' | grep -m1 verris_internal || true)}"
[ -n "$NET" ] || { echo "[migrate-www] nie znaleziono sieci verris_internal"; exit 1; }

val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

PG_USER="$(val POSTGRES_USER)"; PG_USER="${PG_USER:-verris}"
PG_DB="$(val POSTGRES_DB)";     PG_DB="${PG_DB:-verris_db}"
PG_PASS="$(val POSTGRES_PASSWORD)"
PL_SECRET="$(val PAYLOAD_SECRET)"

[ -n "$PG_PASS" ]   || { echo "[migrate-www] brak POSTGRES_PASSWORD w $ENV_FILE"; exit 1; }
[ -n "$PL_SECRET" ] || { echo "[migrate-www] brak PAYLOAD_SECRET w $ENV_FILE"; exit 1; }

echo "[migrate-www] sieć=$NET db=$PG_DB user=$PG_USER"

# Obraz Node z Docker Huba jest jedyną rzeczą w deployu spoza ghcr.io, a prune przed pull
# usuwa go przy każdym wdrożeniu. 2026-09-23: auth.docker.io odpowiadał „TLS handshake
# timeout” i deploy stanął, choć wszystkie obrazy aplikacji były już pobrane. Zapas: mirror
# Google (mirror.gcr.io) serwuje te same oficjalne obrazy; po pobraniu tagujemy pod
# oryginalną nazwą, więc reszta skryptu się nie zmienia.
if ! docker image inspect "$NODE_IMAGE" >/dev/null 2>&1; then
  if ! docker pull -q "$NODE_IMAGE"; then
    echo "[migrate-www] WARN: Docker Hub nie odpowiada — próbuję mirror.gcr.io/library/$NODE_IMAGE"
    docker pull -q "mirror.gcr.io/library/$NODE_IMAGE"
    docker tag "mirror.gcr.io/library/$NODE_IMAGE" "$NODE_IMAGE"
  fi
fi

# --entrypoint bash: obraz API ma własny entrypoint (składa DATABASE_URL i startuje API).
# NODE_ENV= : obraz API ustawia production, a wtedy pnpm pomija devDependencies (CLI Payloada).
docker run --rm \
  --entrypoint bash \
  -e NODE_ENV= \
  --network "$NET" \
  -v "$PWD":/repo -w /repo/apps/www \
  -e PGHOST=postgres \
  -e PGPORT=5432 \
  -e PGUSER="$PG_USER" \
  -e PGPASSWORD="$PG_PASS" \
  -e PGDATABASE="$PG_DB" \
  -e PAYLOAD_SECRET="$PL_SECRET" \
  "$NODE_IMAGE" -lc '
    set -e
    command -v pnpm >/dev/null || npm install -g "$(node -p "require(\"/repo/package.json\").packageManager")"
    pnpm install --filter @verris/www... --frozen-lockfile
    pnpm --filter @verris/www exec payload migrate
  '

echo "[migrate-www] OK"
