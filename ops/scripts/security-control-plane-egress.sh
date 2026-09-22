#!/usr/bin/env bash
# Docker-safe egress hardening for Verris control-plane hosts.
# Nie czyści tabeli nat — tylko dopina łańcuch OUTPUT na początku.
#
#   sudo bash ops/scripts/security-control-plane-egress.sh
#   sudo bash ops/scripts/security-control-plane-egress.sh --strict   # ipset allowlist (ostrożnie)
#   sudo bash ops/scripts/security-control-plane-egress.sh --dry-run
#   sudo bash ops/scripts/security-control-plane-egress.sh --pomiar      # SEC-05: co host naprawdę robi
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Katalog konfiguracji — zmienna, żeby strażnik zachowaniowy (SEC-01) mógł
# uruchomić prawdziwy skrypt na atrapach bez dotykania /etc.
SECURITY_DIR="${SECURITY_DIR:-/etc/verris/security}"
IOC_FILE="${IOC_FILE:-$SECURITY_DIR/ioc-ips.txt}"
ALLOW_HOSTS="${ALLOW_HOSTS:-$SECURITY_DIR/egress-allow-hostnames.txt}"
# X-36 — zakresy CIDR obok nazw. Nazwa rozwiazana w jednej chwili nie obejmuje
# round-robinu: 2026-08-24 do zbioru trafilo 140.82.121.34, a docker pull
# poszedl na .33 i zginal na i/o timeout. Zbior jest `hash:net`, wiec podsiec
# wchodzi jako jeden wpis i nie starzeje sie przy rotacji DNS.
ALLOW_NETS="${ALLOW_NETS:-$SECURITY_DIR/egress-allow-nets.txt}"
CHAIN_IOC="VERRIS_IOC_DROP"
CHAIN_LOG="VERRIS_EGRESS_LOG"
CHAIN_ANTISCAN="VERRIS_ANTISCAN"
CHAIN_BOGON="VERRIS_EGRESS_BOGON"
# X-41 — obserwacja ruchu KONTENERÓW. Osobny łańcuch, bo wisi w innym miejscu
# niż cała reszta: w DOCKER-USER (FORWARD), nie w OUTPUT.
CHAIN_FWD_OBS="VERRIS_FWD_OBSERW"
# Jedna nazwa zbioru dla --strict i dla zwolnienia z licznika anty-skanu (X-36).
# Wcześniej siedziała jako `local setname` wewnątrz apply_strict_allowlist i nie
# dało się jej użyć nigdzie indziej.
ALLOW_SET="${ALLOW_SET:-verris_egress_https}"

# SEC-05 — ZAPIS, NIE PRÓBKA.
#
# Do 2026-09-22 jedynym źródłem wiedzy o tym, dokąd host się łączy, był
# VERRIS-EGRESS-WEB w logu jądra — z `-m limit 120/min`. Zmierzone: ~1,81 mln
# pakietów przez łańcuch wobec 1796 wpisów w journalu z 48 h. Nieobecność celu
# w logu nie dowodziła niczego, a allowlista budowana na takim odczycie była
# niepełna z definicji (SEC-06).
#
# Zamiast zdejmować ogranicznik z LOG (dysk i journal pod każdym połączeniem)
# każde NOWE połączenie dopisuje cel do zbioru ipset — bez limitu, w pamięci
# jądra, jeden wpis na parę (adres, protokół:port). Obecność celu w zbiorze
# jest pewna; nie ma próbkowania. Wpis żyje 7 dni od OSTATNIEGO użycia, więc
# zbiór to „dokąd host chodził w ostatnim tygodniu", a nie „od zawsze".
#
# Osobny zbiór dla ruchu kontenerów (FORWARD, X-41): strict dotyczy hosta
# (OUTPUT), więc warunek wstępny strict czyta wyłącznie zbiór hosta.
SEEN_SET="${SEEN_SET:-verris_egress_seen}"
SEEN_SET_FWD="${SEEN_SET_FWD:-verris_egress_seen_fwd}"
SEEN_TIMEOUT="${SEEN_TIMEOUT:-604800}"
CHAIN_SEEN="VERRIS_EGRESS_SEEN"
# Od kiedy trwa pomiar — bez tej daty „w zbiorze nie ma celu X" może znaczyć
# „pomiar trwa od pięciu minut".
POMIAR_OD_PLIK="${POMIAR_OD_PLIK:-$SECURITY_DIR/egress-pomiar-od}"
POMIAR_MIN_DNI="${POMIAR_MIN_DNI:-7}"
WYMUS_STRICT=0
POMIAR_RAPORT=0
STRICT=0
ALLOWLIST_ONLY=0
DRY_RUN=0
OBSERWUJ_KONTENERY=0
# Obniżone po incydencie Hetzner 2026-06-11 (wolny skan ~1/s, ~256 hostów).
# Control-plane gada z ~kilkunastoma API — 40 nowych poł./60s to i tak duży zapas.
ANTISCAN_HITCOUNT="${ANTISCAN_HITCOUNT:-40}"
ANTISCAN_WINDOW="${ANTISCAN_WINDOW:-60}"
# Druga warstwa: wolny skan rozłożony w czasie (np. 1/s przez 10 min).
#
# X-36 — DLACZEGO 250, A NIE 300.
#
# Moduł jądra `xt_recent` ma stałą XT_RECENT_MAX_NSTAMPS = 256 i odrzuca każdą
# regułę z `--hitcount` większym lub równym tej wartości. Maksimum to więc 255.
# Wpisane tu wcześniej 300 sprawiało, że iptables odrzucał regułę:
#
#     RULE_APPEND failed (Invalid argument): rule in chain VERRIS_ANTISCAN
#
# Skrypt umierał w tym miejscu pod `set -e`, zostawiając łańcuch ZBUDOWANY DO
# POŁOWY — z warstwą szybką i bez wolnej. To wyjaśnia „dryf konfiguracji", nad
# którym siedzieliśmy 2026-08-24: uruchomiony łańcuch nigdy nie zgadzał się ze
# skryptem, bo skrypt nigdy nie zdołał się wykonać do końca. Nikt się nie
# dowiedział, bo padał bez własnego komunikatu, po trzech zielonych linijkach.
#
# 250 w oknie 900 s to ~17 nowych połączeń na minutę wobec ~20 przy 300 —
# intencja („wolny skan rozłożony w czasie") zostaje praktycznie nietknięta.
ANTISCAN_SLOW_HITCOUNT="${ANTISCAN_SLOW_HITCOUNT:-250}"
ANTISCAN_SLOW_WINDOW="${ANTISCAN_SLOW_WINDOW:-900}"
# Twardy limit modułu. Klamrujemy JAWNIE i głośno, zamiast pozwolić iptables
# odrzucić regułę i wywrócić skrypt w połowie łańcucha.
XT_RECENT_MAX_HITCOUNT=255
# Adresy, do których control-plane NIE powinien inicjować ruchu WWW (bogony,
# sieci prywatne, link-local, multicast). Węzły mają publiczne IP, więc to nie
# blokuje DA:2222. Wyjątek: wewn. sieć Dockera (obsłużona przez ctstate/iface).
BOGON_DESTS="${BOGON_DESTS:-10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 192.0.2.0/24 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/3}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "DRY-RUN: $*"
  else
    eval "$@"
  fi
}

usage() {
  cat <<'EOF'
security-control-plane-egress.sh

  Instaluje reguły iptables na hoście (bez flush Docker NAT).

Opcje:
  --allowlist  Buduje/odświeża TYLKO ipset z allow-hostnames. Nic nie blokuje.
  --strict     Ogranicza NOWE połączenia TCP/80 i TCP/443 do ipset z allow-hostnames.
               SEC-01: naprawdę odrzuca. Odmawia (kod 1), jeśli pomiar (--pomiar)
               trwa krócej niż POMIAR_MIN_DNI dni albo widział cele 80/443
               spoza allowlisty — wtedy strict odciąłby coś, co host robi.
  --wymus-strict
               Pomija warunek pomiaru. Tylko świadomie, np. przy incydencie.
  --pomiar     Raport: dokąd host i kontenery łączyły się w ostatnich 7 dniach
               (z ipset, nie z logu) i co z tego jest poza allowlistą.
  --dry-run    Tylko podgląd
  --obserwuj-kontenery
               Wpina do DOCKER-USER łańcuch, który TYLKO LOGUJE ruch wychodzący
               z kontenerów. Nic nie blokuje. Tryb wyłączny — nie rusza OUTPUT.

Domyślnie włączone (bez --strict): IOC drop, logowanie egress, anty-netscan
(rate-limit burst nowych TCP/80,443 → DROP; env ANTISCAN_HITCOUNT / ANTISCAN_WINDOW).

X-36: anty-netscan zwalnia z licznika cele obecne w ipset. Kolejność wdrażania
jest więc istotna — najpierw `--allowlist` (sam zbiór, zero blokad), dopiero
potem przebieg domyślny. Odwrotnie licznik obejmie ghcr.io i wdrożenie padnie
na `compose pull`.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --allowlist) ALLOWLIST_ONLY=1; shift ;;
    --strict) STRICT=1; shift ;;
    --wymus-strict) STRICT=1; WYMUS_STRICT=1; shift ;;
    --pomiar) POMIAR_RAPORT=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --obserwuj-kontenery) OBSERWUJ_KONTENERY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "Run as root"
command -v iptables >/dev/null 2>&1 || die "iptables not found"

install -d "$SECURITY_DIR"
if [ ! -f "$IOC_FILE" ]; then
  install -m 0644 "$REPO_ROOT/ops/etc/verris/security/ioc-ips.txt" "$IOC_FILE"
fi
if [ ! -f "$ALLOW_NETS" ] && [ -f "$REPO_ROOT/ops/etc/verris/security/egress-allow-nets.txt" ]; then
  install -m 0644 "$REPO_ROOT/ops/etc/verris/security/egress-allow-nets.txt" "$ALLOW_NETS"
fi

apply_ioc_drop() {
  run "iptables -N '$CHAIN_IOC' 2>/dev/null || iptables -F '$CHAIN_IOC'"
  run "iptables -C OUTPUT -j '$CHAIN_IOC' 2>/dev/null || iptables -I OUTPUT 1 -j '$CHAIN_IOC'"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="$(echo "$line" | tr -d '[:space:]')"
    [ -z "$line" ] && continue
    if ! [[ "$line" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      log "SKIP invalid IOC line: $line"
      continue
    fi
    run "iptables -C '$CHAIN_IOC' -d '$line' -j DROP 2>/dev/null || iptables -A '$CHAIN_IOC' -d '$line' -j DROP -m comment --comment 'verris-ioc'"
  done <"$IOC_FILE"
  log "IOC drop rules loaded from $IOC_FILE"
}

apply_egress_log() {
  run "iptables -N '$CHAIN_LOG' 2>/dev/null || iptables -F '$CHAIN_LOG'"
  run "iptables -C OUTPUT -j '$CHAIN_LOG' 2>/dev/null || iptables -I OUTPUT 2 -j '$CHAIN_LOG'"
  run "iptables -A '$CHAIN_LOG' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m limit --limit 120/min --limit-burst 60 -j LOG --log-prefix 'VERRIS-EGRESS-WEB ' --log-level 4"
  run "iptables -A '$CHAIN_LOG' -j RETURN"
  log "Egress web logging enabled (kernel log, ports 80+443)"
}

apply_antiscan() {
  # Klamrowanie przed pierwszą regułą — lepiej obniżyć próg i powiedzieć o tym,
  # niż zostawić po sobie pół łańcucha (patrz komentarz przy XT_RECENT_MAX_HITCOUNT).
  local h
  for h in ANTISCAN_HITCOUNT ANTISCAN_SLOW_HITCOUNT; do
    if [ "${!h}" -gt "$XT_RECENT_MAX_HITCOUNT" ]; then
      log "WARN: ${h}=${!h} przekracza limit modułu xt_recent (${XT_RECENT_MAX_HITCOUNT})."
      log "WARN: obniżam do ${XT_RECENT_MAX_HITCOUNT}. Bez tego iptables odrzuciłby regułę."
      printf -v "$h" '%s' "$XT_RECENT_MAX_HITCOUNT"
    fi
  done

  run "iptables -N '$CHAIN_ANTISCAN' 2>/dev/null || iptables -F '$CHAIN_ANTISCAN'"
  run "iptables -C OUTPUT -j '$CHAIN_ANTISCAN' 2>/dev/null || iptables -I OUTPUT 3 -j '$CHAIN_ANTISCAN'"
  run "iptables -A '$CHAIN_ANTISCAN' -m conntrack --ctstate established,related -j RETURN"

  # ===========================================================================
  # X-36 — CELE Z ALLOWLISTY NIE LICZĄ SIĘ DO BUDŻETU.
  #
  # CO SIĘ STAŁO. 2026-08-24 o 22:00 UTC wdrożenie #77 padło na `compose pull`.
  # W kern.log z tych dwóch minut: 63 dropy VERRIS-ANTISCAN-DROP, wszystkie do
  # 140.82.121.33/34 — czyli do ghcr.io. Skrypt wdrożeniowy zginął pod
  # `set -Eeuo pipefail` nie dochodząc do żadnej ze swoich bramek.
  #
  # PRZYCZYNA JEST W `--rsource`. W łańcuchu OUTPUT źródłem każdego pakietu
  # jesteśmy my, więc lista `recent` ma DOKŁADNIE JEDEN wpis i jedno wiadro.
  # Reguła nie mierzy więc różnorodności celów — nie ma o niej pojęcia — tylko
  # sumuje wszystkie nowe połączenia web hosta. To globalna przepustnica
  # z etykietą „anty-skan": docker pull, apt, certbot, mapy rspamd i sondy do
  # węzłów dzielą jeden budżet. Pobranie sześciu obrazów przebija go bez trudu.
  #
  # CZEGO NIE ZROBILIŚMY. Nie podnieśliśmy progu. Czterdzieści zostało wybrane
  # po incydencie z 2026-06-11 (wolny skan ~1/s do ~256 hostów) i podniesienie
  # go rozbroiłoby kontrolę dokładnie tam, gdzie raz już zawiodła.
  #
  # Nie przestawiliśmy też na `--rdest`. Per-cel liczyłoby połączenia do TEGO
  # SAMEGO adresu, więc skan po 256 hostach (jedno połączenie na host) nie
  # ruszyłby licznika ani razu, a `docker pull` — który wali w dwa adresy GHCR
  # — nadal by padał. Zamiana jednej niewłaściwej miary na drugą.
  #
  # CO ZROBILIŚMY. Ruch do celów z allowlisty wychodzi z łańcucha PRZED
  # licznikiem. Dzięki temu licznik mierzy wreszcie coś sensownego: nowe
  # połączenia do miejsc, KTÓRYCH NIE ZNAMY — a to jest znacznie bliżej
  # sygnatury skanu niż „wszystko, co host wysyła". Próg 40 zostaje ostry.
  #
  # Wykrywaniem samej różnorodności celów zajmuje się `security-egress-watch.sh`
  # (UNIQUE_DST > 25 w oknie 6 min z kern.log). iptables jest tu zgrubnym
  # bezpiecznikiem, nie detektorem — i dopiero teraz tak się zachowuje.
  # ===========================================================================
  if command -v ipset >/dev/null 2>&1 && ipset list -n 2>/dev/null | grep -qx "$ALLOW_SET"; then
    run "iptables -A '$CHAIN_ANTISCAN' -m set --match-set '$ALLOW_SET' dst -j RETURN"
    log "Anti-netscan: cele z ipset $ALLOW_SET zwolnione z licznika"
  else
    log "WARN: brak ipset $ALLOW_SET — licznik obejmuje TAKŻE ghcr.io, apt i SURBL."
    log "WARN: w tym stanie wdrożenie może paść na 'compose pull' (patrz X-36)."
    log "WARN: napraw: sudo bash ops/scripts/security-control-plane-egress.sh --strict"
  fi

  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --set --name verris_eg_new --rsource"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_WINDOW' --hitcount '$ANTISCAN_HITCOUNT' --name verris_eg_new --rsource -j LOG --log-prefix 'VERRIS-ANTISCAN-DROP ' --log-level 4"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_WINDOW' --hitcount '$ANTISCAN_HITCOUNT' --name verris_eg_new --rsource -j DROP -m comment --comment 'verris-antiscan'"
  # Druga warstwa — wolny skan rozłożony w czasie (osobna lista `recent`).
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --set --name verris_eg_slow --rsource"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_SLOW_WINDOW' --hitcount '$ANTISCAN_SLOW_HITCOUNT' --name verris_eg_slow --rsource -j LOG --log-prefix 'VERRIS-ANTISCAN-SLOW ' --log-level 4"
  run "iptables -A '$CHAIN_ANTISCAN' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m recent --update --seconds '$ANTISCAN_SLOW_WINDOW' --hitcount '$ANTISCAN_SLOW_HITCOUNT' --name verris_eg_slow --rsource -j DROP -m comment --comment 'verris-antiscan-slow'"
  run "iptables -A '$CHAIN_ANTISCAN' -j RETURN"
  log "Anti-netscan: >${ANTISCAN_HITCOUNT}/${ANTISCAN_WINDOW}s (burst) i >${ANTISCAN_SLOW_HITCOUNT}/${ANTISCAN_SLOW_WINDOW}s (wolny) → DROP"
}

# Drop NOWYCH połączeń WWW control-plane do sieci prywatnych/bogonów.
# `established,related` przepuszczamy (odpowiedzi), wewn. ruch Dockera idzie
# przez interfejsy docker0/br-* (RETURN przy ctstate ESTABLISHED i tak go nie
# rusza, bo to są połączenia inicjowane lokalnie do publicznych API).
apply_bogon_drop() {
  run "iptables -N '$CHAIN_BOGON' 2>/dev/null || iptables -F '$CHAIN_BOGON'"
  run "iptables -C OUTPUT -j '$CHAIN_BOGON' 2>/dev/null || iptables -I OUTPUT 1 -j '$CHAIN_BOGON'"
  run "iptables -A '$CHAIN_BOGON' -m conntrack --ctstate established,related -j RETURN"
  # Nie ruszaj ruchu wychodzącego przez mosty Dockera (kontener→kontener / NAT).
  run "iptables -A '$CHAIN_BOGON' -o docker0 -j RETURN"
  # SEC-04: mostki sieci compose (br-<id>) to 172.18–172.20, czyli W ŚRODKU
  # 172.16.0.0/12 z listy bogonów. Sam docker0 nie wystarczał: host → kontener
  # na 443 przez br-* trafiałby w DROP poniżej.
  run "iptables -A '$CHAIN_BOGON' -o br-+ -j RETURN"
  run "iptables -A '$CHAIN_BOGON' -o lo -j RETURN"
  for net in $BOGON_DESTS; do
    run "iptables -A '$CHAIN_BOGON' -p tcp -m multiport --dports 80,443 -d '$net' -m conntrack --ctstate NEW -j LOG --log-prefix 'VERRIS-BOGON-DROP ' --log-level 4"
    run "iptables -A '$CHAIN_BOGON' -p tcp -m multiport --dports 80,443 -d '$net' -m conntrack --ctstate NEW -j DROP -m comment --comment 'verris-bogon'"
  done
  run "iptables -A '$CHAIN_BOGON' -j RETURN"
  log "Bogon/private egress drop (TCP 80,443) zainstalowany"
}

# X-36 — budowanie zbioru WYDZIELONE z trybu strict.
#
# Wcześniej ipset powstawał wyłącznie przy `--strict`, czyli razem z regułą,
# która ODRZUCA wszystko spoza listy. Kto chciał samego zbioru — na przykład po
# to, żeby zwolnić ghcr.io z licznika anty-skanu — musiał włączyć blokowanie
# całego ruchu web hosta. Wszystko albo nic, i to na produkcji.
#
# Sam zbiór niczego nie blokuje. Dopiero reguła, która się do niego odwołuje.
#
# ODŚWIEŻANIE PRZEZ `ipset swap`, NIE PRZEZ `flush`.
#
# Poprzednia wersja robiła `ipset flush` i dopiero potem dodawała adresy jeden
# po drugim. Przy włączonym `--strict` — a na tym hoście VERRIS_EGRESS_STRICT
# wisi w OUTPUT — między flushem a ostatnim `add` zbiór jest NIEPEŁNY, więc
# reguła `! --match-set … -j DROP` odcina wszystko, czego jeszcze nie zdążył
# dodać. Kilka sekund, ale w tych kilku sekundach padają połączenia, których
# nikt potem nie powiąże z odświeżaniem allowlisty.
#
# Budujemy więc obok, do zbioru tymczasowego, i podmieniamy jednym `swap` —
# to operacja atomowa, bez okna, w którym lista jest krótsza niż powinna.
zbuduj_ipset_allow() {
  command -v ipset >/dev/null 2>&1 || die "ipset wymagany (apt install ipset)"
  local setname="$ALLOW_SET"
  local tmpset="${ALLOW_SET}_new"
  run "ipset create '$setname' hash:net family inet hashsize 4096 maxelem 65536 -exist"
  run "ipset create '$tmpset' hash:net family inet hashsize 4096 maxelem 65536 -exist"
  run "ipset flush '$tmpset'"
  if [ ! -f "$ALLOW_HOSTS" ]; then
    die "Missing $ALLOW_HOSTS — populate before --strict"
  fi
  local added=0
  while IFS= read -r host || [ -n "$host" ]; do
    host="${host%%#*}"
    host="$(echo "$host" | tr -d '[:space:]')"
    [ -z "$host" ] && continue
    local resolved=0
    while read -r ip; do
      [ -z "$ip" ] && continue
      run "ipset add '$tmpset' '$ip' -exist"
      resolved=1
      added=$((added + 1))
    done < <(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | sort -u)
    if [ "$resolved" -eq 0 ]; then
      log "WARN: cannot resolve $host"
    else
      log "allow $host"
    fi
  done <"$ALLOW_HOSTS"

  # Zakresy CIDR — patrz komentarz przy ALLOW_NETS oraz sam plik.
  if [ -f "$ALLOW_NETS" ]; then
    while IFS= read -r net || [ -n "$net" ]; do
      net="${net%%#*}"
      net="$(echo "$net" | tr -d '[:space:]')"
      [ -z "$net" ] && continue
      run "ipset add '$tmpset' '$net' -exist"
      added=$((added + 1))
      log "allow-net $net"
    done <"$ALLOW_NETS"
  else
    log "WARN: brak $ALLOW_NETS — allowlista oparta wylacznie na nazwach."
    log "WARN: przy round-robinie (ghcr.io) to nie wystarcza — patrz X-36."
  fi

  [ "$added" -gt 0 ] || die "Allowlist empty — refusing --strict (would block all web egress)"
  # Podmiana atomowa: od tej chwili $setname ma nową zawartość, bez okna pustki.
  run "ipset swap '$tmpset' '$setname'"
  run "ipset destroy '$tmpset'"
  log "ipset $setname: $added adresów (podmiana atomowa)"
}

# ---------------------------------------------------------------------------
# SEC-01 — strict, który naprawdę odrzuca.
# ---------------------------------------------------------------------------
#
# Do 2026-09-22 tryb --strict był atrapą z trzema wyciszeniami naraz:
#   1. reguła DROP siedziała wewnątrz testu `-m cgroup --path`, niedostępnego
#      na tym jądrze — więc nie powstawała nigdy,
#   2. skrypt kończył się WARN i kodem 0,
#   3. instalator wołał go z `|| true`.
# Panel pokazywał łańcuch z dwoma RETURN i 1,81 mln pakietów przepuszczonych
# ostatnim z nich.
#
# Wyjątek cgroup miał przepuszczać ruch kontenerów — a ten do OUTPUT w ogóle
# nie trafia, idzie przez FORWARD (X-41). Wyjątek chronił przed czymś, co nie
# mogło się zdarzyć, i przy okazji wyłączał całą regułę.
#
# Teraz: DROP bez warunków pobocznych, wyjątki tylko dla ruchu, który nie jest
# egressem (lo, mostki Dockera — SEC-04), a po założeniu łańcucha sprawdzenie,
# że reguła odrzucająca FAKTYCZNIE w nim jest. Brak = kod 1, nie WARN.
#
# Cena: strict przestał być nieszkodliwy. Dlatego warunek wstępny poniżej.

# Cele 80/443 zmierzone na hoście, których nie ma w allowliście. Wypisuje po
# jednym na linię; pusto = allowlista pokrywa wszystko, co host robił.
cele_spoza_allowlisty() {
  local wpis rest proto port ip
  while read -r wpis; do
    [ -z "$wpis" ] && continue
    ip="${wpis%%,*}"
    rest="${wpis#*,}"
    proto="${rest%%:*}"
    port="${rest#*:}"
    [ "$proto" = "tcp" ] || continue
    case "$port" in 80|443) ;; *) continue ;; esac
    ipset test "$ALLOW_SET" "$ip" >/dev/null 2>&1 || echo "$wpis"
  done < <(ipset list "$SEEN_SET" 2>/dev/null | awk '/^Members:/{m=1; next} m && NF {print $1}')
}

sprawdz_pomiar_przed_strict() {
  if [ "$WYMUS_STRICT" -eq 1 ]; then
    log "WARN: --wymus-strict — pomijam warunek pomiaru. Strict może odciąć ruch, którego nikt nie zmierzył."
    return 0
  fi
  if ! ipset list -n 2>/dev/null | grep -x "$SEEN_SET" >/dev/null; then
    die "Brak pomiaru egressu (ipset $SEEN_SET). Najpierw przebieg domyślny, potem ${POMIAR_MIN_DNI} dni obserwacji, potem --pomiar. (SEC-05/SEC-06)"
  fi
  local od teraz dni
  od="$(cat "$POMIAR_OD_PLIK" 2>/dev/null || true)"
  [[ "$od" =~ ^[0-9]+$ ]] || die "Brak daty początku pomiaru ($POMIAR_OD_PLIK) — nie wiem, jak długo trwa obserwacja."
  teraz="$(date +%s)"
  dni=$(( (teraz - od) / 86400 ))
  if [ "$dni" -lt "$POMIAR_MIN_DNI" ]; then
    die "Pomiar trwa ${dni} d, wymagane ${POMIAR_MIN_DNI} d. Pusty zbiór po krótkiej obserwacji nie dowodzi, że host nigdzie więcej nie chodzi."
  fi
  local spoza
  spoza="$(cele_spoza_allowlisty)"
  if [ -n "$spoza" ]; then
    log "Cele 80/443 zmierzone na hoście, których NIE MA w allowliście:"
    printf '%s\n' "$spoza" | while read -r w; do log "  $w"; done
    die "Strict odciąłby powyższe. Dopisz je do allowlisty (albo wyjaśnij, czemu mają zostać odcięte) i uruchom ponownie. (SEC-06)"
  fi
  log "Pomiar: ${dni} d, wszystkie cele 80/443 hosta są w allowliście — strict niczego znanego nie odetnie."
}

apply_strict_allowlist() {
  zbuduj_ipset_allow
  sprawdz_pomiar_przed_strict
  local setname="$ALLOW_SET"
  local chain="VERRIS_EGRESS_STRICT"
  run "iptables -N '$chain' 2>/dev/null || iptables -F '$chain'"
  run "iptables -C OUTPUT -j '$chain' 2>/dev/null || iptables -I OUTPUT 4 -j '$chain'"
  run "iptables -A '$chain' -m conntrack --ctstate established,related -j RETURN"
  # SEC-04: host → kontener (mostki) i pętla zwrotna to nie egress.
  run "iptables -A '$chain' -o lo -j RETURN"
  run "iptables -A '$chain' -o docker0 -j RETURN"
  run "iptables -A '$chain' -o br-+ -j RETURN"
  run "iptables -A '$chain' -p tcp -m multiport --dports 80,443 -m set ! --match-set '$setname' dst -m conntrack --ctstate NEW -m limit --limit 30/min --limit-burst 30 -j LOG --log-prefix 'VERRIS-STRICT-DROP ' --log-level 4"
  run "iptables -A '$chain' -p tcp -m multiport --dports 80,443 -m set ! --match-set '$setname' dst -m conntrack --ctstate NEW -j DROP -m comment --comment 'verris-strict-egress-host'"
  run "iptables -A '$chain' -j RETURN"

  # Kontrola po fakcie: łańcuch, który „powinien" odrzucać, a nie odrzuca, to
  # dokładnie stan sprzed tej poprawki. Tym razem mówimy o tym kodem wyjścia.
  if [ "$DRY_RUN" -eq 0 ] && ! iptables -S "$chain" 2>/dev/null | grep -- 'verris-strict-egress-host' >/dev/null; then
    die "Łańcuch $chain nie zawiera reguły DROP po założeniu — strict NIE działa."
  fi
  log "STRICT egress hosta: NOWE TCP/80,443 poza ipset $setname → DROP (kontenery: FORWARD, nie dotyczy)"
}

# ---------------------------------------------------------------------------
# X-41 — ETAP 1: obserwacja egressu KONTENERÓW. Zero blokad.
# ---------------------------------------------------------------------------
#
# DLACZEGO TO W OGÓLE JEST POTRZEBNE
# ──────────────────────────────────
# Cały hardening z X-36 wisi w łańcuchu OUTPUT, a OUTPUT dotyczy wyłącznie
# pakietów tworzonych LOKALNIE przez host: dockerd, certbot, rspamd,
# unattended-upgrades. Ruch z kontenerów przechodzi przez FORWARD, gdzie
# DOCKER-USER jest pusty, a polityka to ACCEPT.
#
# Zmierzone 2026-08-25 przy diagnozie X-37: wypięcie VERRIS_ANTISCAN z OUTPUT
# nie zmieniło zachowania aplikacji ani o jotę — bo nigdy jej nie dotyczyło.
# Egress całego produktu jest poza zasięgiem zabezpieczenia, które wygląda,
# jakby go obejmowało.
#
# DLACZEGO NAJPIERW OBSERWACJA, A NIE OD RAZU BLOKADA
# ───────────────────────────────────────────────────
# Dwa konkretne miny, obie policzalne dopiero po pomiarze:
#
#  1. `VERRIS_EGRESS_BOGON` odrzuca NOWE połączenia do 172.16.0.0/12 na 80/443.
#     W OUTPUT nieszkodliwe. W DOCKER-USER dotyczyłoby ruchu MIĘDZY
#     KONTENERAMI — nasze sieci Dockera to 172.18–172.20.
#
#  2. Anty-skan ma próg 40 nowych połączeń/60 s. W OUTPUT liczył cały host jako
#     jedno wiadro (`--rsource`, źródłem zawsze host). W FORWARD liczyłby per
#     kontener — semantycznie poprawnie, ale nikt nie zmierzył, ile połączeń
#     API otwiera legalnie w piku. Przeniesienie progu dobranego do innego
#     wiadra to zgadywanie.
#
# Ten łańcuch NIE ZAWIERA ANI JEDNEJ REGUŁY DROP ANI REJECT. Pilnuje tego
# strażnik `obserwacja-nie-blokuje.spec.ts` — gdyby ktoś kiedyś „przy okazji"
# dopisał tu blokadę, test zrobi się czerwony.
apply_forward_observe() {
  if ! iptables -L DOCKER-USER -n >/dev/null 2>&1; then
    log "WARN: brak łańcucha DOCKER-USER (Docker nie działa?) — pomijam obserwację"
    return 0
  fi

  run "iptables -N '$CHAIN_FWD_OBS' 2>/dev/null || iptables -F '$CHAIN_FWD_OBS'"

  # Odpowiedzi na już nawiązane połączenia — nie są nowym egressem.
  run "iptables -A '$CHAIN_FWD_OBS' -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN"

  # Ruch WCHODZĄCY do kontenera: kontener→kontener i host→kontener. To nie jest
  # egress i nie ma prawa trafić do inwentarza. `br-+` obejmuje wszystkie mostki
  # Dockera niezależnie od skrótu w nazwie.
  run "iptables -A '$CHAIN_FWD_OBS' -o docker0 -j RETURN"
  run "iptables -A '$CHAIN_FWD_OBS' -o br-+ -j RETURN"

  # SEC-05: pełny zapis celów kontenerów obok próbkowanego logu. SET nie
  # blokuje niczego — tylko dopisuje cel do zbioru.
  # Bez ipset obserwacja działa jak dotąd (sam log) — nie wywracamy trybu,
  # który ma być nieszkodliwy.
  if command -v ipset >/dev/null 2>&1; then
    zbuduj_zbior_pomiaru "$SEEN_SET_FWD"
    run "iptables -A '$CHAIN_FWD_OBS' -m conntrack --ctstate NEW -p tcp -j SET --add-set '$SEEN_SET_FWD' dst,dst --exist"
    run "iptables -A '$CHAIN_FWD_OBS' -m conntrack --ctstate NEW -p udp -j SET --add-set '$SEEN_SET_FWD' dst,dst --exist"
  else
    log "WARN: brak ipset — obserwacja kontenerów tylko z logu (próbka, SEC-05)"
  fi

  # Cele już uznane za zaufane. Bez tego log tonie w ruchu, o którym wiemy.
  if command -v ipset >/dev/null 2>&1 && ipset list -n 2>/dev/null | grep -qx "$ALLOW_SET"; then
    run "iptables -A '$CHAIN_FWD_OBS' -m set --match-set '$ALLOW_SET' dst -j RETURN"
  else
    log "WARN: brak ipset ${ALLOW_SET} — log obejmie także cele z allowlisty"
  fi

  # Limiter jest po to, żeby obserwacja nie zapchała dysku, gdy coś oszaleje.
  # 5/s z zapasem 100 wystarczy do rozpoznania rozkładu, a nie do policzenia
  # każdego pakietu — i tak interesują nas cele, nie dokładne sumy.
  run "iptables -A '$CHAIN_FWD_OBS' -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -m limit --limit 5/sec --limit-burst 100 -j LOG --log-prefix 'VERRIS-FWD-KANDYDAT ' --log-level 6"

  run "iptables -A '$CHAIN_FWD_OBS' -j RETURN"
  run "iptables -C DOCKER-USER -j '$CHAIN_FWD_OBS' 2>/dev/null || iptables -I DOCKER-USER 1 -j '$CHAIN_FWD_OBS'"
  log "Obserwacja egressu kontenerów włączona (DOCKER-USER, tylko LOG)"
  log "Odczyt po dobie: sudo bash ops/scripts/security-egress-kandydaci.sh"
}

# SEC-05 — patrz komentarz przy SEEN_SET.
zbuduj_zbior_pomiaru() {
  local nazwa="$1"
  command -v ipset >/dev/null 2>&1 || die "ipset wymagany do pomiaru egressu (apt install ipset)"
  run "ipset create '$nazwa' hash:ip,port family inet timeout '$SEEN_TIMEOUT' counters maxelem 65536 -exist"
}

apply_egress_seen() {
  zbuduj_zbior_pomiaru "$SEEN_SET"
  if [ ! -f "$POMIAR_OD_PLIK" ]; then
    run "date +%s > '$POMIAR_OD_PLIK'"
  fi
  run "iptables -N '$CHAIN_SEEN' 2>/dev/null || iptables -F '$CHAIN_SEEN'"
  run "iptables -A '$CHAIN_SEEN' -m conntrack ! --ctstate NEW -j RETURN"
  run "iptables -A '$CHAIN_SEEN' -o lo -j RETURN"
  run "iptables -A '$CHAIN_SEEN' -o docker0 -j RETURN"
  run "iptables -A '$CHAIN_SEEN' -o br-+ -j RETURN"
  # Bez `-m limit` — to jest cały sens tej pozycji.
  run "iptables -A '$CHAIN_SEEN' -p tcp -j SET --add-set '$SEEN_SET' dst,dst --exist"
  run "iptables -A '$CHAIN_SEEN' -p udp -j SET --add-set '$SEEN_SET' dst,dst --exist"
  # Dopasowanie bez celu — tylko po to, żeby liczniki wpisów rosły.
  run "iptables -A '$CHAIN_SEEN' -p tcp -m set --match-set '$SEEN_SET' dst,dst"
  run "iptables -A '$CHAIN_SEEN' -p udp -m set --match-set '$SEEN_SET' dst,dst"
  run "iptables -A '$CHAIN_SEEN' -j RETURN"
  # Pierwszy w OUTPUT: zapisujemy także próby, które dalej odrzuci IOC,
  # anty-skan albo strict — to też jest wiedza o tym, co host robi.
  run "iptables -C OUTPUT -j '$CHAIN_SEEN' 2>/dev/null || iptables -I OUTPUT 1 -j '$CHAIN_SEEN'"
  log "Pomiar egressu hosta: każde NOWE połączenie TCP/UDP → ipset $SEEN_SET (bez próbkowania, okno ${SEEN_TIMEOUT}s)"
}

raport_pomiaru() {
  local zbior tytul wpis ip w_allow rev licz
  for zbior in "$SEEN_SET" "$SEEN_SET_FWD"; do
    if [ "$zbior" = "$SEEN_SET" ]; then tytul="HOST (OUTPUT)"; else tytul="KONTENERY (FORWARD)"; fi
    echo "=== ${tytul}: ${zbior} ==="
    if ! ipset list -n 2>/dev/null | grep -x "$zbior" >/dev/null; then
      echo "  brak zbioru — pomiar nie jest włączony"
      echo
      continue
    fi
    printf '  %-28s %-9s %-10s %s\n' "CEL" "ALLOW" "NOWE_POL." "NAZWA ODWROTNA"
    ipset list "$zbior" 2>/dev/null | awk '/^Members:/{m=1; next} m && NF {p="?"; for(i=2;i<=NF;i++) if($i=="packets") p=$(i+1); print $1, p}' \
      | sort -k2,2nr | while read -r wpis licz; do
          ip="${wpis%%,*}"
          if ipset test "$ALLOW_SET" "$ip" >/dev/null 2>&1; then w_allow="tak"; else w_allow="NIE"; fi
          rev="$( { getent hosts "$ip" 2>/dev/null || true; } | awk 'NR==1{print $2}')"
          printf '  %-28s %-9s %-10s %s\n' "$wpis" "$w_allow" "$licz" "${rev:--}"
        done
    echo
  done
  local od
  od="$(cat "$POMIAR_OD_PLIK" 2>/dev/null || true)"
  if [[ "$od" =~ ^[0-9]+$ ]]; then
    echo "Pomiar od: $(date -u -d "@$od" +%F 2>/dev/null || echo "$od") ($(( ($(date +%s) - od) / 86400 )) d)"
  else
    echo "Pomiar od: nieznane ($POMIAR_OD_PLIK)"
  fi
  echo "Cele 80/443 hosta spoza allowlisty (to odciąłby strict):"
  local spoza
  spoza="$(cele_spoza_allowlisty)"
  if [ -n "$spoza" ]; then printf '  %s\n' $spoza; else echo "  brak"; fi
  echo "=== KONIEC RAPORTU ==="
}

persist_rules() {
  if command -v netfilter-persistent >/dev/null 2>&1; then
    run "netfilter-persistent save"
  elif [ -d /etc/iptables ]; then
    run "iptables-save > /etc/iptables/rules.v4"
  else
    log "WARN: install iptables-persistent / netfilter-persistent to survive reboot"
  fi
}

# SEC-05: raport tylko do odczytu — nic nie zmienia.
if [ "$POMIAR_RAPORT" -eq 1 ]; then
  raport_pomiaru
  exit 0
fi

# X-36: `--allowlist` buduje sam zbiór i kończy. Żadnego łańcucha, żadnej
# blokady — to ma być pierwszy, bezpieczny krok przed przebiegiem domyślnym.
if [ "$ALLOWLIST_ONLY" -eq 1 ]; then
  zbuduj_ipset_allow
  log "ipset ${ALLOW_SET} gotowy. Nic nie zostało zablokowane."
  log "Następny krok: sudo bash $0   (anty-skan zwolni te cele z licznika)"
  exit 0
fi

# X-41: tryb wyłączny. Nie dotyka OUTPUT, nie zmienia niczego poza dopięciem
# łańcucha logującego. Ma być pierwszym krokiem przed jakimkolwiek
# egzekwowaniem na ruchu kontenerów.
if [ "$OBSERWUJ_KONTENERY" -eq 1 ]; then
  apply_forward_observe
  persist_rules
  log "Obserwacja gotowa. NIC nie zostało zablokowane."
  exit 0
fi

apply_ioc_drop
apply_bogon_drop
apply_egress_log
apply_antiscan
apply_egress_seen
if [ "$STRICT" -eq 1 ]; then
  apply_strict_allowlist
fi
persist_rules

log "Control-plane egress hardening applied (strict=${STRICT}, dry_run=${DRY_RUN})"
