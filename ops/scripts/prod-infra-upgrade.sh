#!/usr/bin/env bash
# =============================================================================
# PB-38 fala 3 — przejście infrastruktury control-plane na nowe wersje.
#
# Uruchamia WŁAŚCICIEL na serwerze (w /opt/verris), PO wdrożeniu commita z nowym
# docker-compose.prod.yml. Deploy aplikacji infrastruktury nie rusza (`--no-deps`),
# więc do tej chwili działa stara: Postgres 16, Redis 7.4, Loki 2.9 itd.
#
#   WDROZENIE_RECZNE_POWOD="PB-38 fala 3: Postgres 18, Valkey, monitoring" \
#     bash ops/scripts/prod-infra-upgrade.sh
#
# Kolejność i bezpieczniki:
#   1. Kopia szyfrowana (ops/backup-postgres.sh → MinIO). Bez niej nic dalej nie rusza.
#   2. Kolejki BullMQ muszą być puste (Valkey startuje na nowym wolumenie).
#   3. Okno serwisowe: stop aplikacji (kilka minut niedostępności paneli).
#   4. Postgres 16 → 18: zrzut każdej bazy (pg_dump -Fc) + role, odtworzenie w NOWYM wolumenie,
#      porównanie liczby wierszy KAŻDEJ tabeli. Niezgodność = automatyczny powrót na Postgres 16
#      (stary wolumen `postgres_data` jest nietknięty) i start aplikacji na starej bazie.
#   5. Valkey zamiast Redisa, start aplikacji, health-check API.
#   6. Reszta (MinIO z GHCR, Loki 3, Alloy zamiast Promtaila, eksportery, cAdvisor, Prometheus 3,
#      Grafana 13, Caddy, GlitchTip 4 → 5 → 6) — już bez niedostępności paneli.
#
# Skrypt jest powtarzalny: kroki już wykonane (np. Postgres jest już w wersji 18) są pomijane.
# Zrzuty z danymi osobowymi leżą w katalogu 0700 i są niszczone (shred) po udanym przejściu,
# chyba że ZACHOWAJ_ZRZUTY=1.
# =============================================================================
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GHCR_OVERRIDE="${GHCR_OVERRIDE:-docker-compose.ghcr.yml}"
PG16_OVERRIDE="docker-compose.pg16.yml"
ENV_FILE="${ENV_FILE:-.env.prod}"
APP_SERVICES="api client-panel staff-panel admin-panel status-page www"
HEALTH_PATH="${HEALTH_PATH:-http://127.0.0.1:3000/healthz}"

log() { printf '[infra %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { log "BŁĄD: $*"; exit 1; }

[ -f "$ENV_FILE" ] || fail "brak $ENV_FILE — uruchom w katalogu wdrożenia (/opt/verris)."
[ -f .last-good-image-tag ] || fail "brak .last-good-image-tag — najpierw udany deploy aplikacji."

# shellcheck source=lib/bramka-recznego-wdrozenia.sh
. ops/scripts/lib/bramka-recznego-wdrozenia.sh
bramka_recznego_wdrozenia "prod-infra-upgrade.sh" "PB-38"

export IMAGE_TAG REGISTRY_PREFIX
IMAGE_TAG="$(cat .last-good-image-tag)"
REGISTRY_PREFIX="${REGISTRY_PREFIX:-ghcr.io/dominik-hvln}"

compose() { docker compose -f "$COMPOSE_FILE" -f "$GHCR_OVERRIDE" --env-file "$ENV_FILE" "$@"; }
compose_pg16() { docker compose -f "$COMPOSE_FILE" -f "$GHCR_OVERRIDE" -f "$PG16_OVERRIDE" --env-file "$ENV_FILE" "$@"; }

# `!override` w docker-compose.pg16.yml wymaga Compose ≥ 2.24.4.
wersja_compose="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
[ "$(printf '%s\n2.24.4\n' "$wersja_compose" | sort -V | head -1)" = "2.24.4" ] \
  || fail "Docker Compose $wersja_compose — potrzebny co najmniej 2.24.4."

KOPIE="${VERRIS_LOCAL_BACKUP_DIR:-/var/lib/verris/backups}/infra-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$KOPIE" && chmod 700 "$(dirname "$KOPIE")" "$KOPIE"
umask 077
log "katalog roboczy (0700): $KOPIE"

pg() { compose exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "${1:-$POSTGRES_DB}" -v ON_ERROR_STOP=1 -qAt' _ "$@"; }
czekaj_na_zdrowie() { # usługa, limit sekund
  for _ in $(seq 1 "$2"); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q "$1")" 2>/dev/null)" = "healthy" ] && return 0
    sleep 1
  done
  return 1
}
api_zdrowe() {
  for _ in $(seq 1 40); do
    compose exec -T api node -e "fetch('$HEALTH_PATH').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}
glitchtip_dziala() { [ -n "$(compose --profile glitchtip ps -q glitchtip-web 2>/dev/null)" ]; }

# -----------------------------------------------------------------------------
# 0. Obrazy — pobierz wszystko PRZED oknem serwisowym (pobieranie nie może wydłużyć przerwy).
# -----------------------------------------------------------------------------
INFRA="postgres redis minio minio-bootstrap postgres-exporter redis-exporter node-exporter cadvisor loki alloy prometheus grafana caddy"
log "pobieram obrazy infrastruktury…"
compose pull $INFRA
GLITCHTIP=0
if glitchtip_dziala; then
  GLITCHTIP=1
  compose --profile glitchtip pull glitchtip-migrate glitchtip-web glitchtip-worker
  docker pull glitchtip/glitchtip:5.2
fi

PG_WERSJA="$(compose exec -T postgres postgres --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
log "działający Postgres: ${PG_WERSJA:-?}"

# -----------------------------------------------------------------------------
# 1. Kopia szyfrowana (ta sama, co codzienna z crona) — warunek konieczny.
# -----------------------------------------------------------------------------
if [ "$PG_WERSJA" = "16" ]; then
  log "kopia szyfrowana bazy (ops/backup-postgres.sh)…"
  # Jak cron (ops/cron/verris-backup.cron): skrypt kopii bierze klucze age i dane MinIO ze środowiska.
  # shellcheck disable=SC1090
  ( set -a; . "./$ENV_FILE"; set +a; bash ops/backup-postgres.sh ) \
    || fail "kopia się nie udała — przerywam, nic nie zostało zmienione."
fi

# -----------------------------------------------------------------------------
# 2. Kolejki BullMQ muszą być puste — Valkey startuje na nowym wolumenie.
# -----------------------------------------------------------------------------
if [ "$(compose exec -T redis sh -c 'command -v valkey-server || true')" = "" ]; then
  log "czekam na puste kolejki BullMQ (maks. 10 min)…"
  puste=0
  for _ in $(seq 1 60); do
    zaleglosci="$(compose exec -T redis sh -c '
      n=0
      for k in $(redis-cli --scan --pattern "bull:*:wait") $(redis-cli --scan --pattern "bull:*:active"); do
        n=$((n + $(redis-cli llen "$k")))
      done
      for k in $(redis-cli --scan --pattern "bull:*:delayed") $(redis-cli --scan --pattern "bull:*:prioritized"); do
        n=$((n + $(redis-cli zcard "$k")))
      done
      echo $n' | tr -d '\r')"
    [ "$zaleglosci" = "0" ] && { puste=1; break; }
    log "  w kolejkach: $zaleglosci zadań — czekam 10 s"
    sleep 10
  done
  [ "$puste" = "1" ] || fail "kolejki nie opustoszały w 10 min — spróbuj później (nic nie zostało zmienione)."
fi

# -----------------------------------------------------------------------------
# 3. Okno serwisowe.
# -----------------------------------------------------------------------------
PRZERWA_OD="$(date +%s)"
log "OKNO SERWISOWE: zatrzymuję aplikację (${APP_SERVICES})…"
compose stop $APP_SERVICES
[ "$GLITCHTIP" = "1" ] && compose --profile glitchtip stop glitchtip-web glitchtip-worker

powrot_na_16() {
  log "POWRÓT: Postgres 16 na starym wolumenie + start aplikacji."
  compose stop postgres || true
  compose rm -f postgres || true
  compose_pg16 up -d --no-deps postgres
  czekaj_na_zdrowie postgres 120 || log "UWAGA: Postgres 16 nie zgłasza gotowości — sprawdź ręcznie."
  compose_pg16 up -d --no-deps $APP_SERVICES
  fail "przejście na Postgres 18 wycofane — aplikacja działa na Postgresie 16. Zrzuty: $KOPIE"
}

# -----------------------------------------------------------------------------
# 4. Postgres 16 → 18.
# -----------------------------------------------------------------------------
LICZ_SQL="SELECT format('SELECT %L || '' '' || count(*) FROM %I.%I', schemaname || '.' || relname, schemaname, relname)
          FROM pg_stat_user_tables ORDER BY schemaname, relname \\gexec"

if [ "$PG_WERSJA" = "16" ]; then
  BAZY="$(pg postgres <<< "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY 1")"
  log "bazy do przeniesienia: $(echo $BAZY)"

  log "liczę wiersze w Postgresie 16…"
  for b in $BAZY; do pg "$b" <<< "$LICZ_SQL" | sed "s|^|$b.|" ; done > "$KOPIE/wiersze-16.txt"

  log "zrzut ról i baz…"
  compose exec -T postgres sh -c 'pg_dumpall -U "$POSTGRES_USER" --roles-only' > "$KOPIE/role.sql"
  for b in $BAZY; do
    compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc -d "$1"' _ "$b" > "$KOPIE/$b.dump"
    [ -s "$KOPIE/$b.dump" ] || fail "pusty zrzut bazy $b — przerywam przed zatrzymaniem Postgresa 16 (aplikacja stoi: compose up -d --no-deps $APP_SERVICES)."
  done

  log "zatrzymuję Postgres 16, startuję Postgres 18 na nowym wolumenie…"
  compose stop postgres
  compose rm -f postgres
  compose up -d --no-deps postgres
  czekaj_na_zdrowie postgres 180 || powrot_na_16

  log "odtwarzam role i bazy w Postgresie 18…"
  # Właściciel klastra (POSTGRES_USER) już istnieje — pomijamy tylko jego CREATE ROLE.
  PGU="$(compose exec -T postgres sh -c 'printf %s "$POSTGRES_USER"')"
  grep -vE "^CREATE ROLE \"?${PGU}\"?;$" "$KOPIE/role.sql" | pg postgres || powrot_na_16
  for b in $BAZY; do
    pg postgres <<< "SELECT 1 FROM pg_database WHERE datname = '$b'" | grep -q 1 \
      || pg postgres <<< "CREATE DATABASE \"$b\" OWNER \"$PGU\"" || powrot_na_16
    compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --exit-on-error' _ "$b" < "$KOPIE/$b.dump" \
      || powrot_na_16
  done

  log "porównuję liczby wierszy…"
  for b in $BAZY; do pg "$b" <<< "$LICZ_SQL" | sed "s|^|$b.|" ; done > "$KOPIE/wiersze-18.txt"
  if ! diff -q "$KOPIE/wiersze-16.txt" "$KOPIE/wiersze-18.txt" >/dev/null; then
    diff "$KOPIE/wiersze-16.txt" "$KOPIE/wiersze-18.txt" | head -20 || true
    powrot_na_16
  fi
  log "liczby wierszy zgodne ($(wc -l < "$KOPIE/wiersze-18.txt") tabel)."

  log "statystyki planera (vacuumdb --analyze-in-stages)…"
  compose exec -T postgres sh -c 'vacuumdb -U "$POSTGRES_USER" --all --analyze-in-stages -q'
else
  log "Postgres już w wersji ${PG_WERSJA} — pomijam przejście."
fi

# -----------------------------------------------------------------------------
# 5. Valkey + start aplikacji.
# -----------------------------------------------------------------------------
log "Valkey zamiast Redisa…"
compose up -d --no-deps redis
czekaj_na_zdrowie redis 60 || fail "Valkey nie wstał — aplikacja stoi. Sprawdź: docker compose logs redis"

log "start aplikacji…"
compose up -d --no-deps $APP_SERVICES
api_zdrowe || fail "API nie odpowiada na $HEALTH_PATH — sprawdź: docker compose logs --tail=100 api"
log "KONIEC OKNA SERWISOWEGO po $(( $(date +%s) - PRZERWA_OD )) s — API zdrowe."

# -----------------------------------------------------------------------------
# 6. Reszta (bez niedostępności paneli).
# -----------------------------------------------------------------------------
log "MinIO (obraz z GHCR, zbudowany ze źródeł)…"
compose up -d --no-deps minio
czekaj_na_zdrowie minio 120 || fail "MinIO nie wstał — sprawdź: docker compose logs minio"
compose run --rm --no-deps minio-bootstrap || fail "minio-bootstrap nie przeszedł."

log "Loki 3 + Alloy (Promtail wycofany)…"
compose up -d --no-deps loki
docker ps -aq --filter "label=com.docker.compose.project=$(compose config --format json | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)" \
  --filter "label=com.docker.compose.service=promtail" | xargs -r docker rm -f >/dev/null
compose up -d --no-deps alloy

log "eksportery i cAdvisor…"
compose up -d --no-deps postgres-exporter redis-exporter node-exporter cadvisor

log "Prometheus 3 + Grafana 13 (kopia danych Grafany w $KOPIE)…"
compose run --rm --no-deps -T --entrypoint sh grafana -c 'tar czf - -C /var/lib/grafana .' > "$KOPIE/grafana.tgz" \
  || log "UWAGA: kopia Grafany nie powstała."
compose up -d --no-deps prometheus grafana
czekaj_na_zdrowie grafana 180 || log "UWAGA: Grafana nie zgłasza gotowości — sprawdź: docker compose logs grafana"

log "Caddy 2.11 (chwilowe przerwanie połączeń przy odtworzeniu kontenera)…"
compose up -d --no-deps caddy

if [ "$GLITCHTIP" = "1" ]; then
  log "GlitchTip 4 → 5.2 (migracje) → 6…"
  printf 'services:\n  glitchtip-migrate:\n    image: glitchtip/glitchtip:5.2\n' > "$KOPIE/glitchtip-5.yml"
  docker compose -f "$COMPOSE_FILE" -f "$GHCR_OVERRIDE" -f "$KOPIE/glitchtip-5.yml" --env-file "$ENV_FILE" \
    --profile glitchtip run --rm --no-deps glitchtip-migrate || fail "migracje GlitchTip 5.2 nie przeszły."
  compose --profile glitchtip run --rm --no-deps glitchtip-migrate || fail "migracje GlitchTip 6 nie przeszły."
  compose --profile glitchtip up -d --no-deps glitchtip-web glitchtip-worker
fi

# -----------------------------------------------------------------------------
# 7. Podsumowanie.
# -----------------------------------------------------------------------------
log "wersje po przejściu:"
compose exec -T postgres postgres --version
compose exec -T redis valkey-server --version
compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'

if [ "${ZACHOWAJ_ZRZUTY:-0}" != "1" ]; then
  find "$KOPIE" -maxdepth 1 \( -name '*.dump' -o -name 'role.sql' \) -exec shred -u {} +
  log "zrzuty z danymi zniszczone (shred). Kopia szyfrowana z kroku 1 jest w MinIO."
fi

cat <<EOF

GOTOWE. Stare wolumeny zostały nietknięte na wypadek powrotu:
  postgres_data (Postgres 16), redis_data (Redis 7.4)
Po tygodniu bez problemów usuń je ręcznie:
  docker volume rm \$(docker volume ls -q | grep -E '_(postgres_data|redis_data)$')
EOF
