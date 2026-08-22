#!/usr/bin/env bash
# =============================================================================
# DEPLOY-1 — deploy control-plane z gotowych obrazów GHCR (model „jak Render").
# Wywoływane z GitHub Actions po SSH. NIE buduje na serwerze — pobiera obrazy
# po tagu (IMAGE_TAG=git SHA), robi `prisma migrate deploy` (raz), rolling
# restart, health-check /healthz i AUTO-ROLLBACK do ostatniego dobrego tagu.
#
# Wymagane env:
#   REGISTRY_PREFIX  np. ghcr.io/hvln
#   IMAGE_TAG        np. <git-sha>
# =============================================================================
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GHCR_OVERRIDE="${GHCR_OVERRIDE:-docker-compose.ghcr.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
APP_SERVICES="api client-panel staff-panel admin-panel status-page www"
# API nie publikuje portu 3000 na host (słucha tylko w sieci dockera, Caddy woła
# je po nazwie), więc health-check MUSI iść WEWNĄTRZ kontenera api, nie z hosta.
HEALTH_PATH="${HEALTH_PATH:-http://127.0.0.1:3000/healthz}"
LAST_GOOD_FILE=".last-good-image-tag"

: "${REGISTRY_PREFIX:?REGISTRY_PREFIX wymagany (np. ghcr.io/owner)}"
: "${IMAGE_TAG:?IMAGE_TAG wymagany (git SHA)}"

cd "$(dirname "$0")/../.."
compose() { docker compose -f "$COMPOSE_FILE" -f "$GHCR_OVERRIDE" --env-file "$ENV_FILE" "$@"; }

echo "[deploy] tag=${IMAGE_TAG} prefix=${REGISTRY_PREFIX}"

# Kod (compose/migracje/skrypty) musi być spójny z obrazem — pobierz repo do SHA.
git -c safe.directory="$(pwd)" fetch origin "${IMAGE_TAG}" --depth 1 2>/dev/null || git fetch origin
git -c safe.directory="$(pwd)" checkout -q "${IMAGE_TAG}" 2>/dev/null || echo "[deploy] WARN: checkout ${IMAGE_TAG} pominięty"

PREV_TAG="$(cat "$LAST_GOOD_FILE" 2>/dev/null || echo '')"

# 0) Zwolnij miejsce PRZED pobraniem nowych obrazów. Deploy zostawia stare tagi/warstwy,
#    a nieudany deploy nigdy nie sprząta (czyszczenie było tylko po sukcesie) — dysk się
#    zapychał do „no space left on device" przy `pull`. Obrazy uruchomionych kontenerów
#    są bezpieczne (prune nie rusza używanych). Best-effort — nie przerywamy deployu.
if [ "${DEPLOY_PRUNE_BEFORE_PULL:-1}" != "0" ]; then
  echo "[deploy] prune przed pull (zwalnianie miejsca)…"
  docker image prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
  df -h / 2>/dev/null | awk 'NR==1||/\/$/{print "[deploy] "$0}' || true
fi

# 1) Pobierz nowe obrazy (bez ruszania działających kontenerów).
REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$IMAGE_TAG" compose pull ${APP_SERVICES}

# 1.5) Migracje Payload (apps/www) — PRZED startem nowego kodu. Obraz www jest
#      standalone (bez CLI Payloada), więc migracja idzie z jednorazowego kontenera Node.
#      Schemat musi wyprzedzać kod: inaczej nowy kod pyta o kolumny, których nie ma,
#      a blog/panel wyglądają na puste. Nieudana migracja = przerwanie deployu
#      (stary kod i stary schemat dalej działają — nic nie zostało podmienione).
echo "[deploy] payload migrate (www)…"
if ! bash ops/scripts/prod-migrate-www.sh; then
  echo "[deploy] FAIL: migracje Payload nie przeszły — przerywam przed podmianą kodu."
  exit 1
fi

# 2) Rolling restart na gotowych obrazach (bez budowania). Migracje są wstecznie
#    kompatybilne (wzorzec expand→contract, migracje idempotentne IF NOT EXISTS),
#    więc nowy kod może chwilę działać przed `migrate deploy`.
REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$IMAGE_TAG" compose up -d --no-build ${APP_SERVICES}

# 3) Faza release — migracje bazy przez działający kontener api (obraz zawiera
#    prisma + migracje). Reużywa sprawdzonego skryptu (exec + DATABASE_URL).
echo "[deploy] prisma migrate deploy…"
if ! bash ops/scripts/prod-migrate-deploy.sh; then
  echo "[deploy] FAIL: migracje nie przeszły."
  if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$IMAGE_TAG" ]; then
    echo "[deploy] ROLLBACK → ${PREV_TAG} (przed health-checkiem)"
    REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$PREV_TAG" compose up -d --no-build ${APP_SERVICES} || true
  fi
  exit 1
fi

# 3.5) NIEZMIENNIKI po migracji — bramka, nie raport.
#
#      `prisma migrate deploy` kończy się zerem, gdy pliki SQL się wykonały.
#      Nie mówi nic o tym, czy baza jest po nich w stanie, w którym kod będzie
#      się mylił: czy plan sprzedawany na stronie w ogóle istnieje, czy księga
#      pojemności zgadza się z kontami, czy faktury się sumują. Dotąd te
#      twierdzenia sprawdzało wyłącznie CI, na świeżej bazie testowej — czyli
#      dokładnie tam, gdzie nie ma prawdziwych danych.
#
#      Rollback jest ten sam co przy nieudanej migracji: wracamy do poprzedniego
#      obrazu. Schematu to nie cofa (migracje są wstecznie kompatybilne, więc
#      stary kod na nowym schemacie działa), ale zatrzymuje wypuszczenie kodu,
#      który by na tej bazie liczył źle.
#
#      `po-migracji-katalog.sql` NIE biegnie tutaj świadomie: opisuje dzisiejszą
#      decyzję handlową („dokładnie jeden publiczny pakiet", ta cena, te limity),
#      a nie niezmiennik. Cenę wolno zmienić z panelu admina — bramka na 45,00
#      zamieniłaby pierwszą legalną podwyżkę w rollback każdego kolejnego
#      wdrożenia, a wtedy ktoś słusznie wyłączyłby całe sprawdzanie.
#
#      `:?` przy zmiennych jest celowe. Gdyby POSTGRES_DB było puste, psql
#      połączyłby się z bazą o nazwie użytkownika — asercje przeszłyby na
#      PUSTEJ, NIEWŁAŚCIWEJ bazie i zameldowały zieleń. Lepiej, żeby deploy
#      stanął na braku zmiennej, niż żeby bramka udawała, że coś sprawdziła.
#
#      `sh -c`, nie `sh -lc`: powłoka logowania czyta profil, a skrypt profilu
#      czytający stdin zjadłby nasz SQL i psql dostałby pusty plik — czyli
#      zieleń bez sprawdzenia czegokolwiek.
asercja() {
  compose exec -T postgres sh -c \
    'psql -U "${POSTGRES_USER:?POSTGRES_USER puste w kontenerze postgres}" \
          -d "${POSTGRES_DB:?POSTGRES_DB puste w kontenerze postgres}" \
          -v ON_ERROR_STOP=1 -q' < "$1"
}

echo "[deploy] asercje po migracji (niezmienniki)…"
if ! asercja ops/sql/po-migracji-niezmienniki.sql; then
  echo "[deploy] FAIL: migracja zostawiła bazę naruszającą niezmiennik — patrz komunikat wyżej."
  if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$IMAGE_TAG" ]; then
    echo "[deploy] ROLLBACK → ${PREV_TAG} (naruszony niezmiennik bazy)"
    REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$PREV_TAG" compose up -d --no-build ${APP_SERVICES} || true
  fi
  exit 1
fi

# 3.6) HISTORIA — tylko raport, nigdy bramka.
#      Te zapytania mówią o danych sprzed migracji, których migracja nie
#      naprawia i nie miała naprawiać: obciążenia bez faktury z czasów, gdy
#      dokumentów jeszcze nie było, faktury czekające na PDF, brak próby
#      odtworzenia z kopii. Wycofanie wdrożenia z tego powodu byłoby karą za
#      przeszłość, nie ochroną przed błędem — dlatego wynik idzie do logu
#      deployu i nic nie zatrzymuje.
echo "[deploy] historia po migracji (raport, nie bramka)…"
asercja ops/sql/po-migracji-historia.sql || \
  echo "[deploy] WARN: raport historii nie wykonał się do końca — deploy leci dalej (to nie jest bramka)."

# 4) Health-gate — WEWNĄTRZ kontenera api (port 3000 nie jest na hoście).
#    Próbujemy wget, potem curl, a na końcu node (obraz api zawsze ma node).
echo "[deploy] health-check (in-container) ${HEALTH_PATH}…"
health_probe() {
  compose exec -T api sh -lc '
    wget -qO- "'"$HEALTH_PATH"'" 2>/dev/null \
      || curl -sf "'"$HEALTH_PATH"'" 2>/dev/null \
      || node -e "fetch(\"'"$HEALTH_PATH"'\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  ' >/dev/null 2>&1
}
OK=0
for i in $(seq 1 30); do
  if health_probe; then OK=1; break; fi
  sleep 3
done

if [ "$OK" = "1" ]; then
  echo "[deploy] OK — wersja ${IMAGE_TAG} zdrowa."
  echo "$IMAGE_TAG" > "$LAST_GOOD_FILE"
  [ "${DEPLOY_PRUNE_BUILD_CACHE:-1}" != "0" ] && docker image prune -f >/dev/null 2>&1 || true
  compose ps
  exit 0
fi

# 5) Auto-rollback do ostatniego dobrego tagu.
echo "[deploy] ERROR: health-check nie przeszedł."
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$IMAGE_TAG" ]; then
  echo "[deploy] ROLLBACK → ${PREV_TAG}"
  REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$PREV_TAG" compose pull ${APP_SERVICES} || true
  REGISTRY_PREFIX="$REGISTRY_PREFIX" IMAGE_TAG="$PREV_TAG" compose up -d --no-build ${APP_SERVICES}
  echo "[deploy] przywrócono ${PREV_TAG}. Deploy ${IMAGE_TAG} ODRZUCONY."
else
  echo "[deploy] brak poprzedniego dobrego tagu — ręczna interwencja wymagana."
fi
exit 1
