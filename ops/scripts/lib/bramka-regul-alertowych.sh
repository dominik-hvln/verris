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

# =============================================================================
# X-34 — DLACZEGO TU NIE MA ANI JEDNEGO POTOKU
#
# Pierwsza wersja tego pliku sprawdzała obecność metryki tak:
#
#     printf '%s\n' "$metryki" | grep -q '^grafana_alerting_rule_group_rules{'
#
# Skrypt wdrożeniowy działa z `set -Eeuo pipefail`. `grep -q` KOŃCZY SIĘ
# NATYCHMIAST po znalezieniu dopasowania — a `printf` wciąż wypisuje resztę
# odpowiedzi. Gdy odpowiedź nie mieści się w buforze potoku (64 KB), printf
# dostaje SIGPIPE i kończy się kodem 141. `pipefail` bierze najwyższy niezerowy
# status z całego potoku, więc CAŁE SPRAWDZENIE ZWRACA BŁĄD — dokładnie wtedy,
# gdy metryka JEST.
#
# Zmierzone, deterministyczne, próg dokładnie na buforze potoku:
#
#     16 KB → ZNALEZIONO      64 KB → BRAK
#     32 KB → ZNALEZIONO      80 KB → BRAK
#     63 KB → ZNALEZIONO     128 KB → BRAK
#
# `/metrics` Grafany rośnie w miarę rejestrowania kolektorów. Stąd całe
# zachowanie, którego nie umiałem wyjaśnić:
#   • wdrożenie #71 — metryka pojawiła się, gdy odpowiedź była jeszcze poniżej
#     64 KB → odczyt się udał („próba 17"), i uznałem to za powolny scheduler;
#   • wdrożenie #72 — odpowiedź przekroczyła 64 KB, zanim metryka się pojawiła
#     → sześćdziesiąt odczytów z rzędu skłamało, że jej nie ma.
#
# Log Grafany z #72 rozstrzyga to bez cienia wątpliwości:
#     09:53:15  ngalert.scheduler  "Starting scheduler" tickInterval=10s
#     09:53:31  ngalert.sender.router … "Sending alerts to local notifier"
# Scheduler wystartował CZTERY SEKUNDY po restarcie i reguły liczyły się od
# kilkunastej. Bramka twierdziła, że nie ma ich przez 193 sekundy.
#
# Stara bramka (`liczba_metryki | awk`) nie miała tego błędu, bo AWK CZYTA
# WEJŚCIE DO KOŃCA — nie zamyka potoku wcześniej, więc SIGPIPE nie powstaje.
# Ten błąd wprowadziłem ja, razem z `grep -q`.
#
# DLATEGO: dopasowanie wzorca robi sama powłoka, na zmiennej. Żadnego procesu,
# żadnego potoku, żadnego SIGPIPE. Tam gdzie potrzebny jest awk, wejście idzie
# przez `<<<`, a nie przez `|` — here-string to przekierowanie, nie potok,
# więc `pipefail` nie ma czego zepsuć.
# =============================================================================

readonly METRYKA_REGUL='grafana_alerting_rule_group_rules{'

# Liczba reguł w podanym stanie. $1 = stan, $2 = treść /metrics.
regul_w_stanie() {
  awk -v st="$1" '
    $0 ~ "^grafana_alerting_rule_group_rules\\{" && $0 ~ ("state=\"" st "\"") { s += $NF }
    END { printf "%.0f", s + 0 }
  ' <<< "$2"
}

# Czy metryka w ogóle istnieje w tej odpowiedzi. To rozróżnienie jest sednem
# całego pliku: brak linii znaczy „scheduler jeszcze nie tyknął", a linia
# z zerem znaczy „scheduler tyknął i nie znalazł reguł".
metryka_istnieje() {
  case "$1" in
    "$METRYKA_REGUL"* | *"
$METRYKA_REGUL"*) return 0 ;;
    *) return 1 ;;
  esac
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
#
# SKĄD 60 PRÓB (180 s).
#
# UWAGA — pierwotne uzasadnienie tej liczby BYŁO NIEPRAWDZIWE i zostawiam ten
# akapit, żeby nikt go nie odtworzył. Brzmiało: „wdrożenie #71 potrzebowało
# 54 sekund (próba 17), więc dajmy trzykrotny zapas". Te 54 sekundy nie były
# czasem startu Grafany — były czasem, przez który KŁAMAŁ MÓJ WŁASNY ODCZYT
# (patrz X-34 wyżej: SIGPIPE + pipefail).
#
# Prawdziwy pomiar pochodzi z logu SAMEJ GRAFANY (#72):
#     09:53:12  compose restart grafana
#     09:53:15  ngalert.scheduler "Starting scheduler" tickInterval=10s
#     09:53:31  reguły wysyłają pierwsze alerty
# Scheduler startuje ~4 s po restarcie, metryka pojawia się na pierwszym
# takcie, czyli kilkanaście sekund po restarcie. Sześćdziesiąt sekund byłoby
# w zupełności wystarczające.
#
# Zostawiam 180 s mimo to, ale z INNEGO powodu niż poprzednio: czekanie jest
# DARMOWE. Pętla kończy się w chwili, w której reguły się zgadzają, więc
# zdrowe wdrożenie nie trwa ani sekundy dłużej. Płacimy wyłącznie przy
# prawdziwej awarii prowizjonowania — błąd przyjdzie po trzech minutach
# zamiast po jednej. Skoro zapas nic nie kosztuje, nie ma powodu go ścinać do
# wartości dobranej z jednego pomiaru.
#
# Czego ta liczba NIE MA robić: maskować usterki odczytu. Gdyby bramka znów
# zaczęła czekać minutami, odpowiedzią jest diagnoza, a nie 300 s.
#
# Okno podaje `okno_bramki_sekundy` i TYLKO ona. Skrypt wdrożeniowy wypisuje
# tę liczbę do logu — gdyby miał własną, powstałoby bliźniacze miejsce: log
# mówiłby „do 60 s" jeszcze długo po tym, jak bramka czekałaby trzy razy
# dłużej, i pierwsza osoba czytająca log w trakcie awarii zostałaby okłamana.
okno_bramki_sekundy() {
  echo $(( "${BRAMKA_REGUL_PROBY:-60}" * "${BRAMKA_REGUL_ODSTEP:-3}" ))
}

czekaj_na_reguly() {
  local oczekiwana="$1"
  shift
  local proby="${BRAMKA_REGUL_PROBY:-60}"
  local odstep="${BRAMKA_REGUL_ODSTEP:-3}"

  local metryki='' aktywne=0 wstrzymane=0 byla=1 i=0
  BRAMKA_REGUL_POWOD=''
  BRAMKA_REGUL_AKTYWNE=0

  while [ "$i" -lt "$proby" ]; do
    i=$((i + 1))
    metryki="$("$@" 2>/dev/null || true)"

    if metryka_istnieje "$metryki"; then
      byla=0
      aktywne="$(regul_w_stanie active "$metryki")"
      wstrzymane="$(regul_w_stanie paused "$metryki")"
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
