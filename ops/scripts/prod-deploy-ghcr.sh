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

  # 4.5) X-29 — obserwowalność dostaje nową konfigurację.
  #
  #      Do 2026-08-23 wdrożenie robiło `checkout` repozytorium do SHA (więc nowe
  #      pliki lądowały na dysku) i restartowało wyłącznie APP_SERVICES.
  #      Prometheusa i Grafany na tej liście nie było, a oba czytają
  #      konfigurację TYLKO przy starcie kontenera i oba mają ją podmontowaną
  #      z repozytorium. Efekt: zielone CI, zielony deploy, plik na serwerze —
  #      i zero zmiany w działającym systemie. Wykryte przy X-28, przy poprawce,
  #      która PRZENOSI reguły alertowe do Grafany; bez tego kroku nowy
  #      rules.yaml leżałby na dysku, a Grafana dalej działałaby z niczym.
  #
  #      Dwa polecenia, nie jedno. `up -d` odtwarza kontener, gdy zmieniła się
  #      DEFINICJA usługi (X-28 usunęło montowanie alerts.yml). `restart`
  #      wymusza ponowne wczytanie, gdy zmieniła się tylko TREŚĆ podmontowanego
  #      pliku — tego compose nie widzi i sam z siebie nic nie zrobi.
  #
  #      Bezwarunkowo, nie „gdy się zmieniło": porównanie z poprzednim SHA
  #      wymagałoby obu wersji w repozytorium na serwerze, a `fetch` jest tam
  #      płytki. Nieudane porównanie skończyłoby się cichym „brak zmian → nie
  #      restartuj", czyli dokładnie tym błędem, który ten krok naprawia.
  #
  #      PO zapisaniu ostatniego dobrego tagu i PO bramce zdrowia: wydanie
  #      aplikacji jest w tym momencie udane i ma takie zostać. Awaria Grafany
  #      ma dać głośny błąd, a nie wycofać sprawną aplikację.
  OBS_SERVICES="prometheus grafana"

  # Restart na zepsutej konfiguracji zdejmuje monitoring, a zauważyć to miał
  # właśnie monitoring. Dlatego najpierw sprawdzenie, potem restart.
  #
  # `run --rm --no-deps`, a nie `exec`: sprawdzamy PLIK Z REPOZYTORIUM w świeżym
  # kontenerze z tą samą definicją usługi. `exec` wymagałby, żeby Prometheus już
  # działał — a wtedy sprawdzenie padałoby akurat wtedy, gdy monitoring leży,
  # czyli w jedynym momencie, w którym naprawdę zależy nam na restarcie.
  echo "[deploy] promtool check config…"
  if ! compose run --rm --no-deps --entrypoint promtool prometheus \
         check config /etc/prometheus/prometheus.yml; then
    echo "[deploy] FAIL: ops/observability/prometheus.yml jest niepoprawny — NIE restartuję monitoringu."
    echo "[deploy] Aplikacja ${IMAGE_TAG} jest wdrożona i zdrowa; monitoring działa na STAREJ konfiguracji."
    exit 1
  fi

  echo "[deploy] restart obserwowalności (${OBS_SERVICES})…"
  compose up -d --no-build ${OBS_SERVICES}
  compose restart ${OBS_SERVICES}

  # „Wydałem polecenie restartu" to nie to samo co „wróciły". Grafana ma własny
  # /api/health; Prometheusa pytamy Z KONTENERA Grafany, bo obraz Prometheusa
  # nie ma czym wykonać zapytania HTTP, a obie usługi są w tej samej sieci.
  OBS_OK=0
  for i in $(seq 1 20); do
    if compose exec -T grafana sh -c \
         'wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 &&
          wget -qO- http://prometheus:9090/-/healthy >/dev/null 2>&1'; then
      OBS_OK=1; break
    fi
    sleep 3
  done

  if [ "$OBS_OK" != "1" ]; then
    echo "[deploy] FAIL: po restarcie Prometheus i/lub Grafana nie odpowiadają."
    echo "[deploy] Aplikacja ${IMAGE_TAG} jest wdrożona i zdrowa — problem dotyczy WYŁĄCZNIE monitoringu."
    echo "[deploy] Sprawdź: docker compose logs --tail=100 prometheus grafana"
    compose ps
    exit 1
  fi
  echo "[deploy] obserwowalność wstała — sprawdzam, czy reguły LICZĄ SIĘ."

  # 4.6) X-30 — reguła wczytana to nie reguła działająca.
  #
  #      Wdrożenie #67 przeszło na zielono, Grafana odpowiadała na /api/health,
  #      trzynaście reguł było wczytanych — i wszystkie trzynaście waliło się co
  #      trzydzieści sekund na „data source not found". Reguły odwołują się do
  #      źródła danych po uid, a Grafana przy provisioningu aktualizuje istniejące
  #      źródło po NAZWIE i zostawia mu wylosowany wcześniej uid. Dashboardy tego
  #      nie zauważyły, bo mają starą, nazwową ścieżkę zgodności; reguły alertowe
  #      takiej nie mają.
  #
  #      Poprzednie sprawdzenie („czy wstały") nie mogło tego zobaczyć, a strażnik
  #      w testach tym bardziej: sprawdzał, że uid użyty w regułach WYSTĘPUJE
  #      w datasources.yml. Występował. Plik był spójny z plikiem, a system nie
  #      działał. To ta sama pułapka co przy Z-01 i H-20 — test, który przechodzi,
  #      i system, który nie działa.
  #
  #      Dlatego pytamy DZIAŁAJĄCĄ Grafanę o jej własny licznik nieudanych
  #      ewaluacji, dwa razy, w odstępie dłuższym niż cykl najkrótszej grupy
  #      (30 s). Liczy się PRZYROST, nie wartość: pojedyncze niepowodzenie zaraz
  #      po restarcie, gdy Prometheus jeszcze wstaje, jest normalne — stałe
  #      czerwienienie nie jest.
  liczba_metryki() {
    compose exec -T grafana sh -c "wget -qO- http://127.0.0.1:3000/metrics 2>/dev/null" \
      | awk -v m="$1" '$0 ~ "^" m "[{ ]" { s += $NF } END { printf "%.0f", s + 0 }'
  }

  # 4.6a) X-33 — „nie ma" to nie to samo co „jeszcze nie ma".
  #
  #       Wdrożenie #70 padło DOKŁADNIE TUTAJ przy czternastu działających
  #       regułach. `grafana_alerting_rule_group_rules` to GaugeVec ustawiany
  #       dopiero w `processTick()` schedulera alertów; do pierwszego taktu
  #       (domyślnie 10 s) nie ma go w /metrics W OGÓLE — a suma z pustki
  #       wygląda tak samo jak katastrofa. Poprzednia wersja czytała metrykę
  #       sekundę po tym, jak /api/health odpowiedziało: mierzyła szybkość
  #       startu, a meldowała o poprawności prowizjonowania.
  #
  #       Teraz czekamy, aż metryka się pojawi, i dopiero wtedy porównujemy.
  #       Liczba odniesienia liczona jest NA MIEJSCU z rules.yaml — wpisanie
  #       „14" do skryptu byłoby szóstym bliźniaczym miejscem w tym projekcie.
  #
  #       Logika siedzi w osobnym pliku, bo tylko wtedy da się ją przejechać
  #       testem bez Grafany i bez czekania minuty. Szczegóły: docs/zadania/X-33.
  # shellcheck source=ops/scripts/lib/bramka-regul-alertowych.sh
  . ops/scripts/lib/bramka-regul-alertowych.sh

  REGULY_YAML="ops/observability/grafana/provisioning/alerting/rules.yaml"
  OCZEKIWANE="$(policz_reguly_w_pliku "$REGULY_YAML")"
  if [ "${OCZEKIWANE:-0}" -le 0 ]; then
    echo "[deploy] FAIL: nie umiem policzyć reguł w ${REGULY_YAML}."
    echo "[deploy] Bramka bez liczby odniesienia niczego nie sprawdza — przerywam."
    exit 1
  fi

  odczyt_metryk_grafany() {
    compose exec -T grafana sh -c 'wget -qO- http://127.0.0.1:3000/metrics 2>/dev/null'
  }

  echo "[deploy] czekam na scheduler alertów (oczekuję ${OCZEKIWANE} reguł, do $(okno_bramki_sekundy) s)…"
  if ! czekaj_na_reguly "$OCZEKIWANE" odczyt_metryk_grafany; then
    echo "[deploy] FAIL: reguły alertowe nie są w stanie, w jakim powinny być."
    echo "[deploy]   ${BRAMKA_REGUL_POWOD}"
    echo "[deploy] Sprawdź ${REGULY_YAML} i log:"
    echo "[deploy]   docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml logs --tail=200 grafana | grep -i provision"
    echo "[deploy] Aplikacja ${IMAGE_TAG} jest wdrożona i zdrowa — problem dotyczy alertów."
    exit 1
  fi
  echo "[deploy] ${BRAMKA_REGUL_POWOD}"

  BLEDY_PRZED="$(liczba_metryki grafana_alerting_rule_evaluation_failures_total)"
  sleep 75
  BLEDY_PO="$(liczba_metryki grafana_alerting_rule_evaluation_failures_total)"

  if [ "${BLEDY_PO:-0}" -gt "${BLEDY_PRZED:-0}" ]; then
    echo "[deploy] FAIL: reguły alertowe NIE LICZĄ SIĘ — przyrost nieudanych ewaluacji:"
    echo "[deploy]   ${BLEDY_PRZED} → ${BLEDY_PO} w ciągu 75 sekund."
    echo "[deploy] Najczęstsza przyczyna: „data source not found\" — uid źródła danych"
    echo "[deploy] w rules.yaml nie zgadza się z uid-em, który Grafana naprawdę nadała."
    echo "[deploy]   docker compose logs --tail=200 grafana | grep 'rule evaluator'"
    echo "[deploy] Aplikacja ${IMAGE_TAG} jest wdrożona i zdrowa — problem dotyczy alertów."
    exit 1
  fi
  echo "[deploy] reguły liczą się bez błędów (${BLEDY_PRZED} → ${BLEDY_PO})."

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
