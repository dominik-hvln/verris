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
# DŁUGOŚĆ SPRAWDZAMY OSOBNO, NIE KWANTYFIKATOREM. Poprzednia wersja miała
# `{1,1024}`, co na Linuksie (glibc, RE_DUP_MAX 32767) działa, a na macOS
# (BSD regcomp, RE_DUP_MAX **255**) wywala kompilację wyrażenia. `[[ =~ ]]`
# zwraca wtedy 2, czyli „nie pasuje" — i guard odrzucał KAŻDĄ ścieżkę, także
# `/home/klient/public_html`. W CI zielono, na maszynie deweloperskiej czerwono.
#
# Bezpieczeństwo na tym nie ucierpiało (odmowa jest stroną bezpieczną), ale
# kontrola, która na czyimś komputerze mówi „nie" na wszystko, jest tak samo
# bezużyteczna jak ta, która mówi „tak" — po prostu psuje się w drugą stronę.
# Zestaw znaków i limit długości to zresztą dwie osobne reguły; sklejone
# w jeden kwantyfikator dawały jedno miejsce na dwa różne błędy.
readonly VG_RE_PATH='^[A-Za-z0-9 ._/-]+$'
readonly VG_MAX_PATH=1024
vg_is_path() {
  local p="$1"
  [ -z "$p" ] && return 0                       # brak ścieżki = domyślny katalog
  [ "${#p}" -le "$VG_MAX_PATH" ] || return 1
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

# Z-09 — host źródła musi być PUBLICZNY. Znaki hosta sprawdza vg_is_host, ale to
# nie mówi, DOKĄD worker (root na węźle) się połączy: 127.0.0.1 to MySQL/IMAP
# samego węzła, 10.x/172.16.x/192.168.x to sieć wewnętrzna, 169.254.169.254 to
# metadane chmury. API odrzuca takie hosty przy zakładaniu zlecenia; to jest
# druga warstwa, tuż przed połączeniem.
# ponytail: rozwiązujemy raz, a rsync/mysqldump/imapsync rozwiązują ponownie
# (okno na DNS-rebinding); przypięcie IP do każdego narzędzia, gdy będzie potrzebne.
#
# 09.10 — lista zakresów to KOPIA ops/scripts/lib/zastrzezone-zakresy.txt (to samo źródło czyta
# API: apps/api/src/common/net/webhook-post.ts). Węzeł nie ma Node ani jq, a guard musi działać
# sam, więc linie są przepisane tutaj; test zastrzezone-zakresy.spec.ts czerwieni się przy rozjeździe.
# Wcześniej guard znał tylko kilka sieci IPv4 i prefiksy fe8-/fc/fd/ff — przepuszczał NAT64
# (64:ff9b::7f00:1 = 127.0.0.1), 6to4 (2002:7f00:1::1), Teredo, 192.0.0.0/24, 198.18.0.0/15 itd.
# >>> zastrzezone-zakresy.txt (nie edytuj ręcznie bez zmiany pliku źródłowego)
readonly -a VG_ZASTRZEZONE=(
  0.0.0.0/8
  10.0.0.0/8
  100.64.0.0/10
  127.0.0.0/8
  169.254.0.0/16
  172.16.0.0/12
  192.0.0.0/24
  192.0.2.0/24
  192.168.0.0/16
  198.18.0.0/15
  198.51.100.0/24
  203.0.113.0/24
  224.0.0.0/3
  ::/127
  64:ff9b::/96
  64:ff9b:1::/48
  100::/64
  2001::/32
  2001:db8::/32
  2002::/16
  fc00::/7
  fe80::/10
  ff00::/8
)
# <<< zastrzezone-zakresy.txt

# Ścisły IPv4: cztery oktety dziesiętne 0-255, bez zer wiodących (010 to dla inet_aton ósemkowo 8,
# więc guard i narzędzie widziałyby różne adresy). Wypisuje liczbę 32-bitową; 1 = to nie IPv4.
vg_ipv4_liczba() {
  local a b c d x
  IFS=. read -r a b c d x <<<"$1"
  [ -z "$x" ] || return 1
  [[ "$1" == *.*.*.* && "$1" != *.*.*.*.* ]] || return 1
  for x in "$a" "$b" "$c" "$d"; do
    [[ "$x" =~ ^(0|[1-9][0-9]{0,2})$ ]] && (( x <= 255 )) || return 1
  done
  printf '%s\n' $(( (a << 24) | (b << 16) | (c << 8) | d ))
}

# Ścisły IPv6 (z opcjonalnym IPv4 na końcu): wypisuje 8 grup jako liczby dziesiętne; 1 = to nie IPv6.
vg_ipv6_grupy() {
  local ip="$1" ogon v4 lewa prawa g n
  local -a L=() P=() W=()
  [[ "$ip" =~ ^[0-9a-f:.]+$ ]] || return 1
  if [[ "$ip" == *.* ]]; then                   # ::ffff:1.2.3.4, 64:ff9b::1.2.3.4
    ogon="${ip##*:}"
    v4=$(vg_ipv4_liczba "$ogon") || return 1
    ip="${ip%:*}:$(printf '%x:%x' $(( v4 >> 16 )) $(( v4 & 65535 )))"
  fi
  [[ "$ip" == *:::* ]] && return 1
  if [[ "$ip" == *::* ]]; then
    lewa="${ip%%::*}"; prawa="${ip#*::}"
    [[ "$prawa" == *::* ]] && return 1
    # `read -a` gubi pusty ostatni element: bez tego „1::2:” wyglądałoby jak poprawne 1::2.
    [[ "$prawa" == *: ]] && return 1
    [ -n "$lewa" ] && IFS=: read -r -a L <<<"$lewa"
    [ -n "$prawa" ] && IFS=: read -r -a P <<<"$prawa"
    n=$(( 8 - ${#L[@]} - ${#P[@]} ))
    (( n >= 1 )) || return 1
    W=("${L[@]}"); for ((g = 0; g < n; g++)); do W+=(0); done; W+=("${P[@]}")
  else
    [[ "$ip" == *: || "$ip" == :* ]] && return 1
    IFS=: read -r -a W <<<"$ip"
  fi
  (( ${#W[@]} == 8 )) || return 1
  for g in "${W[@]}"; do [[ "$g" =~ ^[0-9a-f]{1,4}$ ]] || return 1; printf '%d ' "0x$g"; done
  printf '\n'
}

# Zakresy rozbite raz, przy wczytaniu biblioteki: IPv4 jako „sieć maska”, IPv6 jako „8 grup prefiks”.
# Wpis, którego nie da się odczytać, przerywa wczytanie — guard bez pełnej listy nie może działać.
VG_ZAKRESY_4=(); VG_ZAKRESY_6=()
vg_wczytaj_zakresy() {
  local z siec prefiks liczba grupy
  for z in "${VG_ZASTRZEZONE[@]}"; do
    siec="${z%/*}"; prefiks="${z#*/}"
    [[ "$z" == */* && "$prefiks" =~ ^[0-9]{1,3}$ ]] || return 1
    if [[ "$siec" == *:* ]]; then
      (( prefiks <= 128 )) && grupy=$(vg_ipv6_grupy "$siec") || return 1
      VG_ZAKRESY_6+=("$grupy$prefiks")
    else
      (( prefiks <= 32 )) && liczba=$(vg_ipv4_liczba "$siec") || return 1
      VG_ZAKRESY_4+=("$liczba $(( (0xffffffff << (32 - prefiks)) & 0xffffffff ))")
    fi
  done
}
vg_wczytaj_zakresy || { echo "migration-input-guard: nieprawidłowa lista VG_ZASTRZEZONE" >&2; return 1 2>/dev/null || exit 1; }

# Adres IPv6 (8 grup dziesiętnie) należy do zakresu „8 grup prefiks”.
vg_w_zakresie6() {
  local -a A=($1) S=($2)
  local prefiks="${S[8]}" i bity maska
  for ((i = 0; i < 8; i++)); do
    bity=$(( prefiks - 16 * i )); (( bity <= 0 )) && return 0; (( bity > 16 )) && bity=16
    maska=$(( (0xffff << (16 - bity)) & 0xffff ))
    (( (A[i] & maska) == (S[i] & maska) )) || return 1
  done
  return 0
}

# 0 = adres zastrzeżony albo niepoprawny (odmowa), 1 = publiczny. Te same reguły co
# isPrivateOrReservedIp w API: IPv4 w IPv6 (::ffff:a.b.c.d, 0:0:0:0:0:ffff:7f00:1) sprawdzany jako
# IPv4; zapis zaczynający się od ::ffff: bez kropek (::ffff:7f00:1) odrzucany w całości;
# wszystko, co nie jest poprawnym IP — odmowa.
vg_ip_prywatny() {
  local ip="${1,,}" z liczba grupy
  if [[ "$ip" == ::ffff:* ]]; then
    vg_ipv4_liczba "${ip#::ffff:}" >/dev/null || return 0
    vg_ip_prywatny "${ip#::ffff:}"; return $?
  fi
  if [[ "$ip" == *:* ]]; then
    grupy=$(vg_ipv6_grupy "$ip") || return 0
    # ::ffff:0:0/96 w innym zapisie (0:0:0:0:0:ffff:7f00:1) — jak w API (BlockList): osadzony IPv4
    if [[ "$grupy" == "0 0 0 0 0 65535 "* ]]; then
      read -r _ _ _ _ _ _ z liczba <<<"$grupy"
      vg_ip_prywatny "$(( z >> 8 )).$(( z & 255 )).$(( liczba >> 8 )).$(( liczba & 255 ))"; return $?
    fi
    for z in "${VG_ZAKRESY_6[@]}"; do vg_w_zakresie6 "$grupy" "$z" && return 0; done
    return 1
  fi
  liczba=$(vg_ipv4_liczba "$ip") || return 0
  for z in "${VG_ZAKRESY_4[@]}"; do
    (( (liczba & ${z#* }) == (${z% *} & ${z#* }) )) && return 0
  done
  return 1
}

# Z-09 (08.10) — adres samego węzła. Połączenie z węzła na jego własny publiczny adres idzie
# lokalnie i omija zaporę (panel :2222 tylko z control-plane, MariaDB, Radicale) — dla workera
# to to samo co 127.0.0.1. Lista z interfejsów (ip -o addr show); VG_TEST_ADRESY_WLASNE (testy)
# tylko DOKŁADA adresy — zmienną da się wyłącznie zaostrzyć odmowę, nigdy jej znieść.
# IPv6 w jednej postaci (8 grup bez zer wiodących), żeby 2001:db8:0:0::1 i 2001:db8::1 były równe.
vg_ipv6_pelny() {
  local ip="$1" lewa prawa brak i g wynik=()
  local -a L=() P=()
  if [[ "$ip" == *::* ]]; then
    lewa="${ip%%::*}"; prawa="${ip#*::}"
    [ -n "$lewa" ] && IFS=: read -r -a L <<<"$lewa"
    [ -n "$prawa" ] && IFS=: read -r -a P <<<"$prawa"
    brak=$(( 8 - ${#L[@]} - ${#P[@]} ))
    wynik=("${L[@]}"); for ((i = 0; i < brak; i++)); do wynik+=(0); done; wynik+=("${P[@]}")
  else
    IFS=: read -r -a wynik <<<"$ip"
  fi
  for i in "${!wynik[@]}"; do g=$(sed 's/^0*//' <<<"${wynik[$i]}"); wynik[$i]="${g:-0}"; done
  (IFS=:; printf '%s\n' "${wynik[*]}")
}

vg_ip_postac() {
  local ip
  ip=$(printf %s "$1" | tr '[:upper:]' '[:lower:]')
  [[ "$ip" == ::ffff:* && "${ip#::ffff:}" == *.* ]] && ip="${ip#::ffff:}"
  if [[ "$ip" == *:* ]]; then vg_ipv6_pelny "$ip"; else printf '%s\n' "$ip"; fi
}

vg_adresy_wlasne() {
  local a
  for a in $(ip -o addr show 2>/dev/null | awk '{split($4, x, "/"); print x[1]}') ${VG_TEST_ADRESY_WLASNE:-}; do
    vg_ip_postac "$a"
  done | sort -u
}

vg_ip_wlasny() {
  vg_adresy_wlasne | grep -qxF -- "$(vg_ip_postac "$1")"
}

# Adres, z którym worker nie może się łączyć: sieć prywatna/lokalna albo sam węzeł.
vg_ip_zakazany() { vg_ip_prywatny "$1" || vg_ip_wlasny "$1"; }

vg_is_public_host() {
  local host="$1" adresy ip
  vg_is_host "$host" || return 1
  if [[ "$host" =~ ^[0-9.]+$ || "$host" == *:* ]]; then
    vg_ip_zakazany "$host" && return 1
    return 0
  fi
  adresy=$(getent ahosts "$host" 2>/dev/null | awk '{print $1}' | sort -u)
  [ -n "$adresy" ] || return 1                  # nierozwiązywalny = odmowa
  for ip in $adresy; do vg_ip_zakazany "$ip" && return 1; done
  return 0
}

# Z-09 (07.10) — host rozwiązany RAZ i sprawdzony: wypisuje jeden publiczny adres (IPv4, jeśli jest),
# z którym narzędzia mają się łączyć. Sprawdzenie nazwy i późniejsze połączenie po nazwie to dwa
# zapytania DNS — złośliwy DNS mógł w drugim podać adres prywatny (DNS-rebinding). Każdy adres
# z odpowiedzi musi być publiczny; adres IP w polu wraca bez zmian (po sprawdzeniu). 1 = odmowa.
vg_pin_public() {
  local host="$1" adresy ip
  vg_is_public_host "$host" || return 1
  if [[ "$host" =~ ^[0-9.]+$ || "$host" == *:* ]]; then printf '%s\n' "$host"; return 0; fi
  adresy=$(getent ahosts "$host" 2>/dev/null | awk '{print $1}' | sort -u)
  [ -n "$adresy" ] || return 1
  for ip in $adresy; do vg_ip_zakazany "$ip" && return 1; done
  ip=$(grep -m1 -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' <<<"$adresy" || head -n1 <<<"$adresy")
  printf '%s\n' "$ip"
}

# vg_require <typ> <wartość> [<etykieta do logu>]
# Zwraca 0 gdy wartość przechodzi walidację; w przeciwnym razie wypisuje na
# stderr komunikat BEZ samej wartości (mogłaby zawierać sekret albo ładunek,
# który trafiłby do logu i dalej do zgłoszenia) i zwraca 1.
vg_require() {
  local typ="$1" wartosc="$2" etykieta="${3:-$1}"
  case "$typ" in
    host)     vg_is_host     "$wartosc" && return 0 ;;
    publichost) vg_is_public_host "$wartosc" && return 0 ;;
    username) vg_is_username "$wartosc" && return 0 ;;
    db)       vg_is_db       "$wartosc" && return 0 ;;
    path)     vg_is_path     "$wartosc" && return 0 ;;
    port)     vg_is_port     "$wartosc" && return 0 ;;
    protocol) vg_is_protocol "$wartosc" && return 0 ;;
    email)    vg_is_email    "$wartosc" && return 0 ;;
    account)  vg_is_account  "$wartosc" && return 0 ;;
    *) echo "vg_require: nieznany typ walidacji '${typ}'" >&2; return 1 ;;
  esac
  if [ "$typ" = publichost ]; then
    echo "odrzucone pole migracji '${etykieta}': host nie rozwiązuje się albo wskazuje na sieć prywatną/lokalną" >&2
  else
    echo "odrzucone pole migracji '${etykieta}': wartość zawiera znaki niedozwolone dla typu '${typ}' (długość ${#wartosc})" >&2
  fi
  return 1
}

# Tryb CLI — używany przez testy. Nie uruchamia się przy `source`.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if [ "${1:-}" = "pin" ] && [ "$#" -ge 2 ]; then
    vg_pin_public "$2"
    exit $?
  fi
  if [ "${1:-}" = "check" ] && [ "$#" -ge 2 ]; then
    vg_require "$2" "${3-}" >/dev/null 2>&1
    exit $?
  fi
  echo "użycie: $(basename "$0") check <host|publichost|username|db|path|port|protocol|email|account> <wartość>" >&2
  exit 64
fi
