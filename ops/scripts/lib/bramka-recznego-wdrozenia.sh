#!/usr/bin/env bash
#
# bramka-recznego-wdrozenia.sh — X-03: wdrożenie z pominięciem bramki testów
# jest jawne i zapisane, a nie domyślne.
#
# Ścieżka automatyczna (push na main → deploy.yml) od 2026-08-21 nie
# przepuszcza czerwonych testów: job `test-gate` stoi przed budową obrazów.
# Ale trzy skrypty wdrożeniowe dało się odpalić na serwerze ręcznie —
# `prod-deploy-ghcr.sh` z dowolnym tagiem, a `prod-deploy-release.sh`
# i `prod-deploy-rolling.sh` wręcz budują z gałęzi na serwerze — i żaden nie
# uruchamiał testów ani nie pytał, dlaczego omijamy bramkę. Kod, którego
# nikt nie przetestował, trafiał na produkcję jednym poleceniem, bez śladu.
#
# Zablokować ręcznej drogi nie chcemy: to jest droga awaryjna (rollback do
# znanego tagu, gaszenie pożaru przy leżącym GitHubie). Chcemy, żeby była
# DECYZJĄ: z nazwanym powodem, zapisaną w dzienniku na serwerze i w syslogu.
#
# Użycie w skrypcie wdrożeniowym, PRZED pierwszą zmianą na serwerze:
#
#   . "$(dirname "$0")/lib/bramka-recznego-wdrozenia.sh"
#   bramka_recznego_wdrozenia "prod-deploy-ghcr.sh" "${IMAGE_TAG:-}"
#
# Przepuszcza bez pytań wyłącznie wdrożenie z GitHub Actions, które przeszło
# przez `test-gate` — deploy.yml ustawia VERRIS_WDROZENIE_Z_ACTIONS=1 razem
# z GITHUB_RUN_ID. Ręczne wywołanie wymaga:
#
#   WDROZENIE_RECZNE_POWOD="rollback po awarii X, tag abc123 był zielony" \
#     ./ops/scripts/prod-deploy-ghcr.sh
#
# Ustawienie VERRIS_WDROZENIE_Z_ACTIONS=1 ręcznie jest możliwe — i jest
# świadomym kłamstwem w poleceniu, a nie przeoczeniem. Tego skrypt nie
# udaje, że potrafi powstrzymać; potrafi sprawić, że przeoczenie przestaje
# być możliwe.

BRAMKA_WDROZENIA_MIN_POWOD=15

bramka_recznego_wdrozenia() {
  local skrypt="${1:?nazwa skryptu wymagana}" cel="${2:-}"

  if [ "${VERRIS_WDROZENIE_Z_ACTIONS:-}" = "1" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
    echo "[bramka] wdrożenie z GitHub Actions (run ${GITHUB_RUN_ID}) — po test-gate"
    return 0
  fi

  # Spacje na brzegach nie są powodem.
  local powod="${WDROZENIE_RECZNE_POWOD:-}"
  powod="${powod#"${powod%%[![:space:]]*}"}"
  powod="${powod%"${powod##*[![:space:]]}"}"

  if [ "${#powod}" -lt "$BRAMKA_WDROZENIA_MIN_POWOD" ]; then
    cat >&2 <<KOMUNIKAT
[bramka] ODMOWA: ${skrypt} uruchomiony poza GitHub Actions, czyli z pominięciem
[bramka] bramki testów (X-03). Zwykła droga: push na main — deploy.yml najpierw
[bramka] uruchamia typecheck i testy, dopiero potem wdraża.
[bramka]
[bramka] Jeżeli to świadoma decyzja (awaria, rollback), podaj powód, min.
[bramka] ${BRAMKA_WDROZENIA_MIN_POWOD} znaków — trafi do dziennika na serwerze i do syslogu:
[bramka]
[bramka]   WDROZENIE_RECZNE_POWOD="rollback po awarii ..., tag ... był zielony" ./ops/scripts/${skrypt}
KOMUNIKAT
    return 2
  fi

  # Znaki sterujące i nowe linie precz — wpis dziennika ma być jedną linią,
  # której nie da się podrobić wstrzyknięciem kolejnego „wpisu" w powodzie.
  powod="$(printf '%s' "$powod" | tr -d '\000-\037\177')"

  local kto="${SUDO_USER:-${USER:-$(id -un 2>/dev/null || echo nieznany)}}"
  local skad="${SSH_CLIENT:-}"
  skad="${skad%% *}"
  local kiedy
  kiedy="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local head
  head="$(git -c safe.directory="$(pwd)" rev-parse --short HEAD 2>/dev/null || echo '?')"
  local wpis="${kiedy} skrypt=${skrypt} cel=${cel:-?} head=${head} kto=${kto} skad=${skad:-lokalnie} powod=${powod}"

  local dziennik="${WDROZENIE_DZIENNIK:-/var/log/verris/wdrozenia-reczne.log}"
  if ! { mkdir -p "$(dirname "$dziennik")" && printf '%s\n' "$wpis" >> "$dziennik"; } 2>/dev/null; then
    # Brak prawa zapisu do /var/log nie może zablokować gaszenia pożaru —
    # ale wpis musi gdzieś zostać. Katalog wdrożenia jest trwały.
    dziennik=".wdrozenia-reczne.log"
    printf '%s\n' "$wpis" >> "$dziennik"
  fi
  command -v logger >/dev/null 2>&1 && logger -t verris-wdrozenie -- "$wpis" 2>/dev/null || true

  echo "[bramka] WDROŻENIE RĘCZNE (bez test-gate) — zapisane w ${dziennik}"
  echo "[bramka] ${wpis}"
  return 0
}
