#!/usr/bin/env bash
# =============================================================================
# Sieć danych bez internetu (2026-09-28) — JEDNORAZOWE przejście verris_internal
# na `internal: true`. Uruchamia właściciel na serwerze (w /opt/verris), po tym,
# jak deploy commita z nową flagą odmówił dalszej pracy.
#
#   WDROZENIE_RECZNE_POWOD="sieć danych bez internetu" bash ops/scripts/prod-siec-danych-izolacja.sh
#
# Po co: Postgres, Valkey, MinIO, Loki, eksportery i Alloy nie potrzebują
# internetu, a do dziś go miały. Do tego kontenery w obu sieciach (API, www,
# Grafana, Prometheus) wychodziły w świat przez TĘ sieć — `internal: true` zdejmuje
# z niej bramę, więc ich ruch idzie przez verris_public.
#
# Jak: Docker nie zmienia flag istniejącej sieci — trzeba ją odtworzyć, a to
# odpina wszystkie kontenery. Sprawdzone na replice stosu (Docker 29, Compose 5.1):
#   - częściowe `up --no-deps <usługa>` przy starej sieci potrafi zatrzymać bazę
#     i paść na „network has active endpoints" — stąd blokada w deployu;
#   - `up -d --no-recreate --no-deps <WSZYSTKIE usługi, które mają kontener>`
#     przy czystym stanie odtwarza sieć i tylko RESTARTUJE kontenery (nic nie jest
#     odtwarzane — PB-38: postgres zostaje tym samym kontenerem na tym samym
#     wolumenie). Niedostępność: kilkanaście sekund.
# =============================================================================
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GHCR_OVERRIDE="${GHCR_OVERRIDE:-docker-compose.ghcr.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
HEALTH_PATH="${HEALTH_PATH:-http://127.0.0.1:3000/healthz}"

log() { printf '[siec %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { log "BŁĄD: $*"; exit 1; }

[ -f "$ENV_FILE" ] || fail "brak $ENV_FILE — uruchom w /opt/verris."
[ -f .last-good-image-tag ] || fail "brak .last-good-image-tag — najpierw udany deploy aplikacji."
# shellcheck source=lib/bramka-recznego-wdrozenia.sh
. ops/scripts/lib/bramka-recznego-wdrozenia.sh
bramka_recznego_wdrozenia "prod-siec-danych-izolacja.sh" "siec-danych"

export IMAGE_TAG REGISTRY_PREFIX
IMAGE_TAG="$(cat .last-good-image-tag)"
REGISTRY_PREFIX="${REGISTRY_PREFIX:-ghcr.io/dominik-hvln}"
compose() { docker compose -f "$COMPOSE_FILE" -f "$GHCR_OVERRIDE" --env-file "$ENV_FILE" "$@"; }

siec="$(docker network ls --format '{{.Name}}' | grep -m1 '_verris_internal$' || true)"
[ -n "$siec" ] || fail "nie ma sieci *_verris_internal — stos nie działa?"
if [ "$(docker network inspect -f '{{.Internal}}' "$siec")" = "true" ]; then
  log "$siec ma już internal=true — nic do zrobienia."
  exit 0
fi
projekt="${siec%_verris_internal}"
compose config 2>/dev/null | awk '/^  verris_internal:/{f=1;next} f&&/^  [^ ]/{f=0} f&&/internal: true/{t=1} END{exit !t}' \
  || fail "$COMPOSE_FILE nie ma internal: true dla verris_internal — najpierw git checkout commita z tą zmianą."

# Czysty stan jest warunkiem: kontener „w pół drogi" (created, restarting, dead)
# to dokładnie przypadek, w którym Compose zostawił na replice zatrzymany stos.
zle="$(docker ps -a --filter "label=com.docker.compose.project=$projekt" --format '{{.Names}} {{.State}}' \
  | awk '$2!="running" && $2!="exited"')"
[ -z "$zle" ] || fail "kontenery w nietypowym stanie (najpierw je napraw):
$zle"

# Kontenery spoza stosu blokowałyby usunięcie sieci — odpinamy je, a po przejściu
# podpinamy z powrotem z tymi samymi aliasami DNS. Chodzi o verris-sogo-db
# (ops/docker-compose.sogo-mail.yml dołącza się do tej sieci jako `external`) —
# bez ponownego podpięcia API traci bazę uwierzytelniania poczty. Jednorazowe
# `compose run` (oneoff) tylko odpinamy.
declare -A do_podpiecia=()
for c in $(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$siec"); do
  if [ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$c" 2>/dev/null || true)" = "True" ]; then
    log "odpinam jednorazowy kontener: $c"
    docker network disconnect -f "$siec" "$c"
  elif [ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$c" 2>/dev/null || true)" != "$projekt" ]; then
    do_podpiecia[$c]="$(docker inspect -f "{{range (index .NetworkSettings.Networks \"$siec\").Aliases}}{{.}} {{end}}" "$c" 2>/dev/null || true)"
    log "odpinam kontener spoza stosu (wróci po przejściu, aliasy: ${do_podpiecia[$c]:-brak}): $c"
    docker network disconnect -f "$siec" "$c"
  fi
done
podepnij_z_powrotem() {
  local c a args
  for c in "${!do_podpiecia[@]}"; do
    args=()
    for a in ${do_podpiecia[$c]}; do [ "$a" = "$c" ] || args+=(--alias "$a"); done
    docker network connect "${args[@]}" "$siec" "$c" && log "podpięty z powrotem: $c" \
      || log "UWAGA: nie udało się podpiąć $c — ręcznie: docker network connect $siec $c"
  done
}

# Wszystkie usługi z kontenerem (także wyłączone jednorazówki i usługi z profili —
# usługa podana z nazwy włącza swój profil). Pominięcie którejkolwiek = „active endpoints".
uslugi="$(docker ps -a --filter "label=com.docker.compose.project=$projekt" --filter 'label=com.docker.compose.oneoff=False' \
  --format '{{.Label "com.docker.compose.service"}}' | sort -u | tr '\n' ' ')"
log "usługi: $uslugi"
log "zapamiętuję identyfikatory kontenerów (kontrola, że nic nie zostało odtworzone)…"
przed="$(docker ps -aq --no-trunc --filter "label=com.docker.compose.project=$projekt" --filter 'label=com.docker.compose.oneoff=False' | sort)"

log "odtwarzam sieć — kilkanaście sekund niedostępności…"
# shellcheck disable=SC2086
if ! compose up -d --no-build --no-recreate --no-deps $uslugi; then
  podepnij_z_powrotem
  log "Compose zgłosił błąd. Stan kontenerów:"
  docker ps -a --filter "label=com.docker.compose.project=$projekt" --format '  {{.Names}} {{.State}}'
  fail "przejście przerwane. Ratunek (kilkadziesiąt sekund przerwy, wolumeny zostają):
  docker compose -f $COMPOSE_FILE -f $GHCR_OVERRIDE --env-file $ENV_FILE up -d --no-build --no-recreate $uslugi"
fi
podepnij_z_powrotem
compose up -d --no-build --no-recreate --no-deps --wait --wait-timeout 240 postgres redis \
  || fail "postgres/Valkey nie są zdrowe po przejściu."

po="$(docker ps -aq --no-trunc --filter "label=com.docker.compose.project=$projekt" --filter 'label=com.docker.compose.oneoff=False' | sort)"
[ "$przed" = "$po" ] || log "UWAGA: zestaw kontenerów się zmienił (sprawdź: docker ps -a) — oczekiwany był sam restart."
[ "$(docker network inspect -f '{{.Internal}}' "$siec")" = "true" ] || fail "$siec nadal bez internal=true."

log "API: zdrowie i wyjście do internetu przez verris_public…"
for i in $(seq 1 30); do
  compose exec -T api node -e "fetch('$HEALTH_PATH').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && break
  [ "$i" = 30 ] && fail "API nie odpowiada na $HEALTH_PATH po przejściu."
  sleep 2
done
compose exec -T api node -e "fetch('https://api.stripe.com/healthcheck',{signal:AbortSignal.timeout(10000)}).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})" \
  || fail "API nie ma wyjścia do internetu po przejściu (trasa domyślna?) — sprawdź: docker compose exec api cat /proc/net/route"
log "Postgres: brak wyjścia do internetu…"
if compose exec -T postgres sh -c 'nc -z -w 5 1.1.1.1 443' 2>/dev/null; then
  fail "postgres NADAL ma internet — sieć nie działa jak zakładaliśmy."
fi
log "OK: verris_internal bez internetu, API wychodzi przez verris_public. Teraz ponów deploy (Re-run w GitHub Actions)."
