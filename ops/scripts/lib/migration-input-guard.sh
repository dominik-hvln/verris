#!/usr/bin/env bash
#
# migration-input-guard.sh — walidacja danych migracji PRZED użyciem ich
# w poleceniu powłoki na węźle.
#
# Z-03 (bloker startu). Worker migracji dostaje z control-plane JSON, którego
# treść w całości pochodzi z formularza klienta: host, użytkownik, nazwa bazy,
# ścieżka zdalna. Te wartości trafiały do:
#
#   lftp -e "... mirror ... '${spath}' '${dst}'; bye"        # apostrof w ścieżce
#                                                            # zamyka cytowanie,
#                                                            # a lftp ma `!cmd`
#   eval "$mysql_cmd -N -e \"... table_schema='${db}' ...\"" # eval z nazwą bazy
#
# Worker działa jako root na węźle hostującym konta innych klientów. Walidacja
# po stronie API (DTO) sprawdzała wyłącznie długość.
#
# Ten plik jest DRUGĄ warstwą — pierwszą jest walidacja w
# apps/api/src/subscriptions/dto/migration.dto.ts. Druga istnieje, bo pierwsza
# kiedyś zniknie przy refaktoryzacji albo ktoś dopisze inną drogę do kolejki,
# a wtedy jedyne, co stoi między formularzem a rootem, to ten plik.
#
# Zasada: allowlista znaków, nie blacklista. Blacklisty w powłoce zawsze mają
# dziurę (podstawienie procesu, nowa linia, znak spoza ASCII, backslash).
#
# Użycie jako biblioteka:
#   source ops/scripts/lib/migration-input-guard.sh
#   vg_require host "$host" || return 2
#
# Użycie jako CLI (na tym opierają się testy):
#   migration-input-guard.sh check host przyklad.pl   # exit 0 = bezpieczne
#   migration-input-guard.sh check path "/a'b"        # exit 1 = odrzucone

# Wzorce trzymamy w zmiennych, bo `[[ "$x" =~ ^[a-z ]+$ ]]` ze spacją wewnątrz
# klasy znaków rozjeżdża się przy dzieleniu na słowa — bash zgłasza wtedy
# „syntax error in conditional expression". Zmienna omija ten problem i przy
# okazji czyta się lepiej.

# Nazwa hosta albo adres IP. Dwukropek dopuszczony dla IPv6.
readonly VG_RE_HOST='^[A-Za-z0-9]([A-Za-z0-9._:-]{0,251}[A-Za-z0-9])?$'
vg_is_host() {
  [[ "$1" =~ $VG_RE_HOST ]]
}

# Login FTP/SFTP/MySQL/IMAP. Adresy e-mail jako login są częste, stąd @ i +.
readonly VG_RE_USERNAME='^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$'
vg_is_username() {
  [[ "$1" =~ $VG_RE_USERNAME ]]
}

# Identyfikator bazy MySQL. Formalnie MySQL dopuszcza więcej, ale nic z tego
# nie występuje u realnych dostawców hostingu, a każdy dodatkowy znak to
# powierzchnia ataku.
readonly VG_RE_DB='^[A-Za-z0-9][A-Za-z0-9_$-]{0,63}$'
vg_is_db() {
  [[ "$1" =~ $VG_RE_DB ]]
}

# Ścieżka zdalna na serwerze źródłowym. Bez apostrofów, cudzysłowów, backslashy,
# dolarów, średników, nowych linii — czyli bez wszystkiego, czym da się wyjść
# z cytowania w lftp albo w powłoce.
readonly VG_RE_PATH='^[A-Za-z0-9 ._/-]{1,1024}$'
vg_is_path() {
  local p="$1"
  [ -z "$p" ] && return 0                       # brak ścieżki = domyślny katalog
  [[ "$p" =~ $VG_RE_PATH ]] || return 1
  [[ "$p" == *".."* ]] && return 1              # wyjście w górę drzewa
  return 0
}

readonly VG_RE_PORT='^[0-9]{1,5}$'
vg_is_port() {
  [[ "$1" =~ $VG_RE_PORT ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

readonly VG_RE_PROTOCOL='^(ftp|ftps|sftp)$'
vg_is_protocol() {
  [[ "$1" =~ $VG_RE_PROTOCOL ]]
}

readonly VG_RE_EMAIL='^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$'
vg_is_email() {
  [[ "$1" =~ $VG_RE_EMAIL ]]
}

# Login konta DirectAdmin na naszym węźle. Nie pochodzi od klienta, ale
# wchodzi do GRANT-a i do nazwy bazy, więc sprawdzamy tak samo.
readonly VG_RE_ACCOUNT='^[a-z0-9][a-z0-9_-]{0,31}$'
vg_is_account() {
  [[ "$1" =~ $VG_RE_ACCOUNT ]]
}

# vg_require <typ> <wartość> [<etykieta do logu>]
# Zwraca 0 gdy wartość przechodzi walidację; w przeciwnym razie wypisuje na
# stderr komunikat BEZ samej wartości (mogłaby zawierać sekret albo ładunek,
# który trafiłby do logu i dalej do zgłoszenia) i zwraca 1.
vg_require() {
  local typ="$1" wartosc="$2" etykieta="${3:-$1}"
  case "$typ" in
    host)     vg_is_host     "$wartosc" && return 0 ;;
    username) vg_is_username "$wartosc" && return 0 ;;
    db)       vg_is_db       "$wartosc" && return 0 ;;
    path)     vg_is_path     "$wartosc" && return 0 ;;
    port)     vg_is_port     "$wartosc" && return 0 ;;
    protocol) vg_is_protocol "$wartosc" && return 0 ;;
    email)    vg_is_email    "$wartosc" && return 0 ;;
    account)  vg_is_account  "$wartosc" && return 0 ;;
    *) echo "vg_require: nieznany typ walidacji '${typ}'" >&2; return 1 ;;
  esac
  echo "odrzucone pole migracji '${etykieta}': wartość zawiera znaki niedozwolone dla typu '${typ}' (długość ${#wartosc})" >&2
  return 1
}

# Tryb CLI — używany przez testy. Nie uruchamia się przy `source`.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if [ "${1:-}" = "check" ] && [ "$#" -ge 2 ]; then
    vg_require "$2" "${3-}" >/dev/null 2>&1
    exit $?
  fi
  echo "użycie: $(basename "$0") check <host|username|db|path|port|protocol|email|account> <wartość>" >&2
  exit 64
fi
