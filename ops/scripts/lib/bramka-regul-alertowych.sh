# shellcheck shell=bash
# =============================================================================
# X-33 — bramka, która nie myli „nie ma" z „jeszcze nie ma".
#
# DLACZEGO TEN PLIK ISTNIEJE
# ──────────────────────────
# Wdrożenie #70 padło na bramce X-30 przy zdrowym systemie. Oś czasu z logu:
#
#   15:43:09  compose restart prometheus grafana
#   15:43:15  /api/health OK        → bramka uznała, że obserwowalność wstała
#   15:43:16  odczyt /metrics       → zero → FAIL
#
# W tej samej chwili Grafana miała czternaście aktywnych reguł. Powód jest
# w kodzie Grafany 10.4.2: `grafana_alerting_rule_group_rules` to GaugeVec
# z etykietami `org` i `state`, ustawiany w `processTick()` — czyli dopiero na
# pierwszym takcie schedulera alertów, a nie przy starcie procesu. Do tego
# momentu metryka NIE MA W /metrics ANI JEDNEJ LINII. Nie „ma zero" — nie ma
# jej wcale. Sumowanie pustki przez awk daje zero i wygląda identycznie jak
# katastrofa.
#
# Domyślny takt to dziesięć sekund. `/api/health` odpowiedziało po sześciu.
# Wdrożenia #68 i #69 wygrały ten wyścig, #70 przegrało. O werdykcie bramki
# decydowała szybkość startu, a nie stan systemu.
#
# To jest gorsze niż jeden czerwony deploy. Bramka, która potrafi zapalić się
# na zdrowym systemie, uczy człowieka klikać „re-run" — i od tego momentu nie
# chroni już niczego.
#
# CZEGO NIE ZROBILIŚMY
# ────────────────────
# Nie wpisaliśmy liczby „14" do skryptu wdrożeniowego. Byłoby to szóste
# bliźniacze miejsce w tym projekcie (Z-12, Z-16, M-06, X-24, H-24): jedna
# reguła w dwóch kopiach, z których ktoś kiedyś zaktualizuje tylko jedną.
# Oczekiwana liczba liczona jest NA MIEJSCU z `rules.yaml` — tego samego pliku,
# który Grafana wczytuje.
#
# Nie skróciliśmy też taktu schedulera Grafany. Zmiana ustawienia produkcyjnego
# po to, żeby zadowolić bramkę, odwraca zależność: to bramka ma się dostosować
# do systemu.
# =============================================================================

# Ile reguł opisuje plik rules.yaml. Grupy mają `name:`, reguły mają `uid:` —
# liczymy wyłącznie te drugie.
policz_reguly_w_pliku() {
  awk '/^[[:space:]]*-[[:space:]]+uid:[[:space:]]/ { n++ } END { print n + 0 }' "$1"
}

# Ze STDIN (treść /metrics) — liczba reguł w podanym stanie.
regul_w_stanie() {
  awk -v st="$1" '
    $0 ~ "^grafana_alerting_rule_group_rules\\{" && $0 ~ ("state=\"" st "\"") { s += $NF }
    END { printf "%.0f", s + 0 }
  '
}

# Czy metryka w ogóle istnieje w tej odpowiedzi. To rozróżnienie jest sednem
# całego pliku: brak linii znaczy „scheduler jeszcze nie tyknął", a linia
# z zerem znaczy „scheduler tyknął i nie znalazł reguł".
metryka_istnieje() {
  grep -q '^grafana_alerting_rule_group_rules{' 2>/dev/null
}

# czekaj_na_reguly <oczekiwana_liczba> <polecenie drukujące /metrics ...>
#
# Zwraca 0, gdy liczba reguł aktywnych zgadza się z oczekiwaną i żadna nie
# wisi w stanie `paused`. W przeciwnym razie 1, a powód ląduje
# w BRAMKA_REGUL_POWOD — osobno dla każdego z trzech różnych niepowodzeń,
# bo każde wymaga innej reakcji człowieka.
#
# Odstęp i liczba prób są w zmiennych środowiskowych, żeby test mógł przejść
# tę samą ścieżkę bez czekania minuty.
czekaj_na_reguly() {
  local oczekiwana="$1"
  shift
  local proby="${BRAMKA_REGUL_PROBY:-20}"
  local odstep="${BRAMKA_REGUL_ODSTEP:-3}"

  local metryki='' aktywne=0 wstrzymane=0 byla=1 i=0
  BRAMKA_REGUL_POWOD=''
  BRAMKA_REGUL_AKTYWNE=0

  while [ "$i" -lt "$proby" ]; do
    i=$((i + 1))
    metryki="$("$@" 2>/dev/null || true)"

    if printf '%s\n' "$metryki" | metryka_istnieje; then
      byla=0
      aktywne="$(printf '%s\n' "$metryki" | regul_w_stanie active)"
      wstrzymane="$(printf '%s\n' "$metryki" | regul_w_stanie paused)"
      BRAMKA_REGUL_AKTYWNE="$aktywne"

      if [ "$aktywne" -eq "$oczekiwana" ] && [ "$wstrzymane" -eq 0 ]; then
        BRAMKA_REGUL_POWOD="OK: ${aktywne}/${oczekiwana} reguł aktywnych (próba ${i})."
        return 0
      fi
    fi

    [ "$i" -lt "$proby" ] && sleep "$odstep"
  done

  if [ "$byla" = "1" ]; then
    BRAMKA_REGUL_POWOD="Grafana nie opublikowała metryki grafana_alerting_rule_group_rules w ciągu ${proby} prób co ${odstep}s. Scheduler alertów nie wystartował."
  elif [ "$wstrzymane" -gt 0 ]; then
    BRAMKA_REGUL_POWOD="${wstrzymane} reguł wisi w stanie paused — wczytane, ale NIE LICZĄ SIĘ."
  else
    BRAMKA_REGUL_POWOD="prowizjonowanie CZĘŚCIOWE: ${aktywne} z ${oczekiwana} reguł aktywnych."
  fi
  return 1
}
