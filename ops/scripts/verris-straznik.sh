#!/usr/bin/env bash
# =============================================================================
# Verris — strażnik węzła: wykrywa awarię, zapisuje diagnozę, naprawia, raportuje.
#
# Decyzja właściciela 13.10.2026 (po awarii t1: LVE konta d3 zepsute od 20:27, strona 503 od 04:40 do 10:40):
# „mechanizm, który w nocy lub w przypadku awarii sam diagnozuje, zapisuje do logów i naprawia jak najszybciej”.
# Autonomia: bezpieczne kroki sam; restart węzła tylko w ostateczności (stan jądra), najwyżej raz na dobę,
# z alarmem przed i po. Wyłącznik: ustawienie panelu `straznik.restartWezla` (GET /agent/tasks/straznik/config).
#
# Uruchamiany co minutę (verris-straznik.timer). Tryby:
#   (bez argumentu)  pętla: wykryj → zapisz diagnozę → napraw (drabina kroków) → sprawdź → raport do panelu
#   --sprawdz        kontrola stanu bez napraw (np. po aktualizacji floty); kod wyjścia 1 = problem
#
# Objawy i drabiny:
#   lve       — `lscgid … enter LVE (uid) : result: -N` w stderr.log LiteSpeed albo `init_lve … err` / `_lve_enter`
#               w dzienniku jądra: procesy PHP kont nie wchodzą do LVE (CloudLinux) → 503/508 stron.
#               1) restart LiteSpeed  2) odświeżenie CageFS + restart LiteSpeed  3) restart węzła (jądro)
#   strony    — seria „oops! 503” w error.log LiteSpeed dla strony: 1) restart LiteSpeed  2) odświeżenie CageFS
#   usluga:X  — usługa z listy włączona, a nie działa: start (tylko gdy nie działa — reguła D2 jak dla NOC)
#   dysk      — / zapełniony ≥ 95%: tylko alarm (nic nie kasujemy automatycznie)
#   rsyslog   — rsyslog działa, a /var/log/messages milczy ≥ 15 min i wpis kontrolny (logger) nie dociera:
#               restart rsyslog (t1 13.10: /var/log/secure puste od 16:25 — logowania SSH poza plikiem)
#
# Dokumentacja komend:
#   LiteSpeed lswsctrl: https://docs.litespeedtech.com/lsws/cp/directadmin/ (restart serwera)
#   CageFS: https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#cagefs  (cagefsctl --force-update,
#           --remount-all, --check-cagefs-initialized)
#   LVE: https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/#lvectl
#   journald (trwały dziennik, Storage=auto + /var/log/journal): man journald.conf
#
# Pliki: diagnozy /var/log/verris-straznik/zdarzenia/<czas>-<objaw>/ (30 dni), dziennik /var/log/verris-straznik.log,
# stan /var/lib/verris-straznik/.
# Wymaga /etc/verris.conf (VERRIS_API_URL, VERRIS_SERVER_ID, VERRIS_IDENTITY_TOKEN).
# =============================================================================
set -uo pipefail
export LC_ALL=C

TRYB="${1:-petla}"
CONFIG_FILE="${VERRIS_CONFIG_FILE:-/etc/verris.conf}"
STAN="${VERRIS_STRAZNIK_STAN:-/var/lib/verris-straznik}"
LOGDIR="${VERRIS_STRAZNIK_LOGDIR:-/var/log/verris-straznik}"
LOG="${VERRIS_STRAZNIK_LOG:-/var/log/verris-straznik.log}"
LSWS="${VERRIS_LSWS_DIR:-/usr/local/lsws}"
DA_USERS="${VERRIS_DA_USERS:-/usr/local/directadmin/data/users}"
PROG_503="${VERRIS_STRAZNIK_PROG_503:-5}"         # tyle 503 jednej strony w jednym przebiegu = objaw
PROG_LVE="${VERRIS_STRAZNIK_PROG_LVE:-2}"         # tyle błędów wejścia do LVE w jednym przebiegu = objaw
ODSTEP_NAPRAW_S="${VERRIS_STRAZNIK_ODSTEP:-1800}" # ta sama drabina najwyżej co 30 min (bez pętli napraw)
ODSTEP_RESTARTU_S=86400                          # restart węzła najwyżej raz na dobę
CZEKAJ_S="${VERRIS_STRAZNIK_CZEKAJ:-20}"          # ile czekać po kroku przed sprawdzeniem
PROC_UPTIME="${VERRIS_PROC_UPTIME:-/proc/uptime}"
JOURNAL_DIR="${VERRIS_JOURNAL_DIR:-/var/log/journal}"
SYSLOG_PLIK="${VERRIS_SYSLOG_PLIK:-/var/log/messages}"
CISZA_RSYSLOG_S="${VERRIS_STRAZNIK_CISZA_RSYSLOG:-900}" # tyle bez wpisu w messages = sprawdź, czy rsyslog pisze

mkdir -p "$STAN" "$LOGDIR/zdarzenia" 2>/dev/null || true
log() { echo "[$(date -u +%FT%TZ)] $*" >> "$LOG"; }
teraz() { date +%s; }

if [ -r "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

if [ "$TRYB" = "petla" ]; then
  exec 9>"$STAN/.lock"
  flock -n 9 || exit 0
fi

# --- dziennik systemowy trwały (raz) ---------------------------------------------------------------
# t1 13.10: restart wyczyścił dmesg i nie dało się ustalić przyczyny. journald przy Storage=auto zapisuje na dysk,
# gdy istnieje /var/log/journal (man journald.conf).
if [ "$TRYB" = "petla" ] && [ ! -e "$STAN/.dziennik-trwaly" ] && command -v journalctl >/dev/null 2>&1; then
  if mkdir -p "$JOURNAL_DIR" 2>/dev/null; then
    systemd-tmpfiles --create --prefix "$JOURNAL_DIR" >/dev/null 2>&1 || true
    journalctl --flush >/dev/null 2>&1 || true
    # t1 13.10 16:25: po przeniesieniu dziennika z /run na dysk rsyslog (imjournal) przestał zapisywać
    # /var/log/messages i /var/log/secure — do restartu rsyslog. try-restart: tylko gdy rsyslog działa.
    systemctl try-restart rsyslog.service >/dev/null 2>&1 || true
    touch "$STAN/.dziennik-trwaly"
    log "dziennik systemowy: trwały (/var/log/journal), rsyslog odświeżony"
  fi
fi

# --- nowe linie pliku od ostatniego przebiegu (offset + inode; rotacja = od początku) ------------------
nowe_linie() {
  local plik="$1" klucz="$2" stan_f inode rozmiar s_inode s_off
  stan_f="$STAN/off-$klucz"
  [ -r "$plik" ] || return 0
  inode=$(stat -c %i "$plik" 2>/dev/null || echo 0)
  rozmiar=$(stat -c %s "$plik" 2>/dev/null || echo 0)
  s_inode=0; s_off=-1
  [ -r "$stan_f" ] && read -r s_inode s_off < "$stan_f"
  echo "$inode $rozmiar" > "$stan_f"
  # Pierwszy przebieg: nie czytamy historii (stare błędy nie są nową awarią).
  [ "$s_off" = "-1" ] && return 0
  if [ "$s_inode" != "$inode" ] || [ "$s_off" -gt "$rozmiar" ]; then s_off=0; fi
  [ "$rozmiar" -gt "$s_off" ] || return 0
  # Najwyżej 5 MB naraz — burza błędów nie zatrzyma strażnika.
  tail -c +"$((s_off + 1))" "$plik" 2>/dev/null | head -c 5242880
}

# Nowe linie dziennika jądra pasujące do wzorca LVE — licznik z bieżącego rozruchu (dmesg nie filtruje po czasie).
nowe_bledy_jadra_lve() {
  local boot licznik s_boot="" s_licznik=0 stan_f="$STAN/jadro-lve"
  boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo x)
  licznik=$(dmesg 2>/dev/null | grep -cE "init_lve: .* err|_lve_enter: Can't alloc|lve_first_init: res init -" || true)
  [ -r "$stan_f" ] && read -r s_boot s_licznik < "$stan_f"
  echo "$boot $licznik" > "$stan_f"
  if [ "$s_boot" != "$boot" ]; then
    # Nowy rozruch: pierwszy przebieg po starcie liczy wszystko od zera (błąd od razu po starcie też jest awarią).
    [ -n "$s_boot" ] && echo "$licznik" || echo 0
    return 0
  fi
  echo $(( licznik > s_licznik ? licznik - s_licznik : 0 ))
}

# Domena konta po uid (do sprawdzenia strony po naprawie).
domena_uid() {
  local u
  u=$(getent passwd "$1" | cut -d: -f1)
  [ -n "$u" ] && [ -r "$DA_USERS/$u/domains.list" ] && head -1 "$DA_USERS/$u/domains.list"
}

# Kod HTTP strony obsługiwanej przez ten węzeł (bez DNS: --resolve na 127.0.0.1).
kod_strony() {
  curl -sk -o /dev/null --max-time 15 -w '%{http_code}' --resolve "$1:443:127.0.0.1" "https://$1/" 2>/dev/null || echo 000
}
kod_awarii() { case "$1" in 000|502|503|504|508) return 0 ;; *) return 1 ;; esac; }

# Kilka aktywnych stron do kontroli (konta niezawieszone) — używane przez --sprawdz i po restarcie węzła.
strony_kontrolne() {
  local n=0 d u
  for u in "$DA_USERS"/*/; do
    u=$(basename "$u")
    grep -qs '^suspended=yes' "$DA_USERS/$u/user.conf" && continue
    d=$(head -1 "$DA_USERS/$u/domains.list" 2>/dev/null)
    [ -n "$d" ] || continue
    echo "$d"; n=$((n + 1)); [ "$n" -ge 5 ] && break
  done
}

lsws_dziala() { "$LSWS/bin/lswsctrl" status 2>/dev/null | grep -q "is running"; }

# --- diagnoza (zanim cokolwiek zmienimy — INCIDENT_RESPONSE: najpierw zabezpiecz ślady) ----------------
zbierz_diagnoze() {
  echo "== czas: $(date -Is)  węzeł: $(hostname)  uptime: $(uptime -p 2>/dev/null)"
  echo "== obciążenie / pamięć / dysk"; uptime; free -m; df -h / /home 2>/dev/null
  echo "== usługi w stanie failed"; systemctl --failed --no-legend 2>/dev/null | head -20
  echo "== LiteSpeed"; "$LSWS/bin/lswsctrl" status 2>&1 | head -3
  echo "== LiteSpeed stderr (ostatnie 40)"; tail -40 "$LSWS/logs/stderr.log" 2>/dev/null
  echo "== LiteSpeed error.log: 503/508/LVE (ostatnie 40)"; tail -2000 "$LSWS/logs/error.log" 2>/dev/null | grep -E "oops! 50[38]|LVE|lsphp|extapp" | tail -40
  echo "== jądro: LVE / OOM (ostatnie 40)"; dmesg -T 2>/dev/null | grep -iE "lve|oom|cagefs|segfault" | tail -40
  echo "== /proc/lve/list (początek)"; head -15 /proc/lve/list 2>&1
  echo "== lvectl list (początek)"; lvectl list 2>&1 | head -15
  echo "== CageFS"; cagefsctl --check-cagefs-initialized 2>&1 | tail -2
  echo "== procesy (CPU)"; ps -eo pid,user,pcpu,pmem,etime,comm --sort=-pcpu 2>/dev/null | head -12
  echo "== ostatnie zadania agenta"; ls -t /var/log/verris-tasks/*.log 2>/dev/null | head -3
}

# --- konfiguracja z panelu (wyłącznik restartu węzła), cache 10 min -----------------------------------
restart_dozwolony() {
  local plik="$STAN/config.json" wiek
  wiek=$(( $(teraz) - $(stat -c %Y "$plik" 2>/dev/null || echo 0) ))
  if [ "$wiek" -gt 600 ] && [ -n "${VERRIS_API_URL:-}" ]; then
    curl -fsS --max-time 10 -H "X-Server-Id: ${VERRIS_SERVER_ID:-}" -H "X-Server-Token: ${VERRIS_IDENTITY_TOKEN:-}" \
      "$VERRIS_API_URL/agent/tasks/straznik/config" -o "$plik.tmp" 2>/dev/null && mv -f "$plik.tmp" "$plik"
  fi
  # Brak odpowiedzi panelu i brak kopii = bez restartu (bezpieczniej).
  grep -qs '"restartWezla":true' "$plik"
}

# --- raport do panelu ---------------------------------------------------------------------------------
# $1 id, $2 rodzaj, $3 stan, $4 katalog zdarzenia (diagnoza.txt, kroki.txt, objaw.txt, wykryto)
raportuj() {
  local id="$1" rodzaj="$2" stan="$3" kat="$4"
  [ -n "${VERRIS_API_URL:-}" ] || return 0
  python3 - "$id" "$rodzaj" "$stan" "$kat" > "$kat/raport.json" <<'PYEOF' || return 0
import json, sys, os
idz, rodzaj, stan, kat = sys.argv[1:5]
def czytaj(n, limit):
    try:
        with open(os.path.join(kat, n), encoding="utf-8", errors="replace") as f:
            return f.read()[-limit:]
    except OSError:
        return ""
kroki = []
for linia in czytaj("kroki.txt", 20000).splitlines():
    czesci = linia.split("|", 2)
    if len(czesci) == 3:
        kroki.append({"at": czesci[0], "krok": czesci[1][:200], "wynik": czesci[2][:500]})
print(json.dumps({
    "id": idz, "rodzaj": rodzaj, "stan": stan,
    "objaw": czytaj("objaw.txt", 2000).strip(),
    "kroki": kroki[-30:],
    "diagnoza": czytaj("diagnoza.txt", 60000),
    "wykrytoAt": czytaj("wykryto", 40).strip(),
    "katalog": kat,
}))
PYEOF
  curl -fsS --max-time 20 -X POST -H "Content-Type: application/json" \
    -H "X-Server-Id: ${VERRIS_SERVER_ID:-}" -H "X-Server-Token: ${VERRIS_IDENTITY_TOKEN:-}" \
    --data @"$kat/raport.json" "$VERRIS_API_URL/agent/tasks/straznik/zdarzenie" >/dev/null 2>&1 \
    || log "raport $id ($stan) nie dotarł do panelu — zostaje na dysku: $kat"
}

krok() { echo "$(date -Is)|$2|$3" >> "$1/kroki.txt"; log "zdarzenie $(basename "$1"): $2 → $3"; }

# Czy po kroku strony z objawu działają (i w logu LiteSpeed nie przybyło błędów LVE).
po_kroku_dziala() {
  local kat="$1" d k zle=0
  sleep "$CZEKAJ_S"
  lsws_dziala || { krok "$kat" "sprawdzenie" "LiteSpeed nie działa"; return 1; }
  while read -r d; do
    [ -n "$d" ] || continue
    k=$(kod_strony "$d")
    if kod_awarii "$k"; then zle=$((zle + 1)); krok "$kat" "sprawdzenie $d" "HTTP $k"; else krok "$kat" "sprawdzenie $d" "HTTP $k — OK"; fi
  done < "$kat/strony.txt"
  [ "$zle" -eq 0 ]
}

nowe_zdarzenie() {
  local rodzaj="$1" kat
  kat="$LOGDIR/zdarzenia/$(date +%Y%m%d-%H%M%S)-${rodzaj//[^a-z0-9_-]/_}"
  mkdir -p "$kat"
  cat /proc/sys/kernel/random/uuid > "$kat/id"
  date -Is > "$kat/wykryto"
  : > "$kat/kroki.txt"; : > "$kat/strony.txt"
  echo "$kat"
}

w_odstepie() { # czy drabina $1 była niedawno (bez pętli napraw)
  local f="$STAN/ostatnio-$1"
  [ -r "$f" ] && [ $(( $(teraz) - $(cat "$f") )) -lt "$ODSTEP_NAPRAW_S" ]
}
oznacz() { teraz > "$STAN/ostatnio-$1"; }

# --- drabina: strony PHP / LVE -------------------------------------------------------------------------
napraw_strony() {
  local rodzaj="$1" kat="$2" jadro="$3" id
  id=$(cat "$kat/id")
  zbierz_diagnoze > "$kat/diagnoza.txt" 2>&1
  krok "$kat" "diagnoza" "zapisana ($(wc -c < "$kat/diagnoza.txt") B)"
  raportuj "$id" "$rodzaj" "naprawa" "$kat"

  "$LSWS/bin/lswsctrl" restart >/dev/null 2>&1; krok "$kat" "1. restart LiteSpeed" "wykonany"
  if po_kroku_dziala "$kat"; then raportuj "$id" "$rodzaj" "naprawiono" "$kat"; return 0; fi

  { cagefsctl --force-update 2>&1 | tail -3; cagefsctl --remount-all 2>&1 | tail -2; } > "$kat/cagefs.txt"
  "$LSWS/bin/lswsctrl" restart >/dev/null 2>&1
  krok "$kat" "2. odświeżenie CageFS + restart LiteSpeed" "$(tr '\n' ' ' < "$kat/cagefs.txt" | head -c 300)"
  if po_kroku_dziala "$kat"; then raportuj "$id" "$rodzaj" "naprawiono" "$kat"; return 0; fi

  # 3. Restart węzła — tylko stan jądra (LVE), za zgodą panelu, raz na dobę, nie tuż po starcie.
  local ostatni up
  ostatni=$(cat "$STAN/ostatni-restart" 2>/dev/null || echo 0)
  up=$(cut -d. -f1 "$PROC_UPTIME")
  if [ "$jadro" -gt 0 ] && restart_dozwolony && [ $(( $(teraz) - ostatni )) -ge "$ODSTEP_RESTARTU_S" ] && [ "$up" -ge 1800 ]; then
    krok "$kat" "3. restart węzła" "stan LVE w jądrze ($jadro błędów) — restart za 60 s"
    echo "$kat" > "$STAN/po-restarcie"
    teraz > "$STAN/ostatni-restart"
    raportuj "$id" "$rodzaj" "restart" "$kat"
    sync; sleep 60; systemctl reboot
    exit 0
  fi
  local powod="brak zgody panelu na restart"
  [ "$jadro" -gt 0 ] || powod="brak błędów jądra — restart węzła nic by nie dał"
  [ $(( $(teraz) - ostatni )) -ge "$ODSTEP_RESTARTU_S" ] || powod="restart węzła był w ostatniej dobie"
  [ "$up" -ge 1800 ] || powod="węzeł działa krócej niż 30 min"
  krok "$kat" "3. restart węzła" "pominięty: $powod"
  raportuj "$id" "$rodzaj" "nie_naprawiono" "$kat"
  return 1
}

# --- po restarcie zrobionym przez strażnika: czy pomógł -----------------------------------------------
if [ "$TRYB" = "petla" ] && [ -r "$STAN/po-restarcie" ]; then
  kat=$(cat "$STAN/po-restarcie"); rm -f "$STAN/po-restarcie"
  if [ -d "$kat" ]; then
    sleep 30  # usługi po starcie
    if po_kroku_dziala "$kat"; then
      krok "$kat" "po restarcie węzła" "strony działają"; raportuj "$(cat "$kat/id")" "lve" "naprawiono" "$kat"
    else
      krok "$kat" "po restarcie węzła" "nadal awaria"; raportuj "$(cat "$kat/id")" "lve" "nie_naprawiono" "$kat"
    fi
  fi
fi

# =====================================================================================================
# --sprawdz: kontrola bez napraw (po aktualizacji floty). Wypisuje VERRIS_STRAZNIK_SPRAWDZ=ok|blad …
# =====================================================================================================
if [ "$TRYB" = "--sprawdz" ]; then
  bledy=()
  lsws_dziala || bledy+=("LiteSpeed nie działa")
  if [ -r /proc/lve/list ] || command -v lvectl >/dev/null 2>&1; then
    lvectl list >/dev/null 2>&1 || bledy+=("lvectl list zwraca błąd")
  fi
  # Błędy LVE w jądrze z ostatnich 30 min (journalctl -k), a bez dziennika — z całego rozruchu.
  if journalctl -k --since "-30min" -q --no-pager >/dev/null 2>&1; then
    n=$(journalctl -k --since "-30min" -q --no-pager 2>/dev/null | grep -cE "init_lve: .* err|_lve_enter: Can't alloc" || true)
  else
    n=$(dmesg 2>/dev/null | grep -cE "init_lve: .* err|_lve_enter: Can't alloc" || true)
  fi
  [ "${n:-0}" -gt 0 ] && bledy+=("LVE: $n błędów w jądrze")
  while read -r d; do
    [ -n "$d" ] || continue
    k=$(kod_strony "$d")
    kod_awarii "$k" && bledy+=("strona $d: HTTP $k")
  done < <(strony_kontrolne)
  if [ "${#bledy[@]}" -eq 0 ]; then
    echo "VERRIS_STRAZNIK_SPRAWDZ=ok"; exit 0
  fi
  echo "VERRIS_STRAZNIK_SPRAWDZ=blad $(IFS='; '; echo "${bledy[*]}")"; exit 1
fi

# =====================================================================================================
# Pętla: wykrywanie
# =====================================================================================================
[ "$TRYB" = "petla" ] || { echo "Użycie: $0 [--sprawdz]" >&2; exit 2; }

# 1) LVE: błędy wejścia procesów kont (stderr LiteSpeed) + stan jądra.
STDERR_NOWE=$(nowe_linie "$LSWS/logs/stderr.log" stderr)
LVE_UIDS=$(printf '%s\n' "$STDERR_NOWE" | grep -oE 'enter LVE \(([0-9]+)\) : result: -[0-9]+' | grep -oE '\(([0-9]+)\)' | tr -d '()' | sort | uniq -c | sort -rn)
LVE_ILE=$(printf '%s\n' "$STDERR_NOWE" | grep -cE 'enter LVE \([0-9]+\) : result: -' || true)
JADRO=$(nowe_bledy_jadra_lve)

# 2) 503 per strona (error.log LiteSpeed: [ip:port#APVH_domena:443] oops! 503).
ERR_NOWE=$(nowe_linie "$LSWS/logs/error.log" errorlog)
STRONY_503=$(printf '%s\n' "$ERR_NOWE" | grep -E 'oops! 503' | grep -oE 'APVH_[^:]+' | sed 's/^APVH_//; s/^www\.//' | sort | uniq -c | awk -v p="$PROG_503" '$1 >= p {print $2}')

if [ "${LVE_ILE:-0}" -ge "$PROG_LVE" ] || [ "${JADRO:-0}" -gt 0 ]; then
  if ! w_odstepie lve; then
    oznacz lve
    KAT=$(nowe_zdarzenie lve)
    {
      echo "Procesy kont nie wchodzą do LVE: ${LVE_ILE:-0} błędów w logu LiteSpeed, ${JADRO:-0} w jądrze."
      [ -n "$LVE_UIDS" ] && echo "Konta (liczba, uid): $(echo "$LVE_UIDS" | tr '\n' ' ')"
    } > "$KAT/objaw.txt"
    printf '%s\n' "$LVE_UIDS" | awk '{print $2}' | while read -r u; do [ -n "$u" ] && domena_uid "$u"; done | sort -u | head -5 > "$KAT/strony.txt"
    [ -s "$KAT/strony.txt" ] || strony_kontrolne > "$KAT/strony.txt"
    log "OBJAW lve: $(head -1 "$KAT/objaw.txt")"
    napraw_strony lve "$KAT" "${JADRO:-0}"
  fi
elif [ -n "$STRONY_503" ]; then
  if ! w_odstepie strony; then
    oznacz strony
    KAT=$(nowe_zdarzenie strony)
    echo "Seria błędów 503 (≥ $PROG_503 w minutę) dla: $(echo "$STRONY_503" | tr '\n' ' ')" > "$KAT/objaw.txt"
    echo "$STRONY_503" | head -5 > "$KAT/strony.txt"
    log "OBJAW strony: $(cat "$KAT/objaw.txt")"
    napraw_strony strony "$KAT" 0
  fi
fi

# 3) Usługi: włączona, a nie działa → start (tylko gdy nie działa).
for jednostka in lsws litespeed mariadb mysqld exim dovecot directadmin named pure-ftpd proftpd; do
  systemctl list-unit-files "$jednostka.service" --no-legend 2>/dev/null | grep -q "$jednostka.service" || continue
  [ "$(systemctl is-enabled "$jednostka" 2>/dev/null)" = "enabled" ] || continue
  stan=$(systemctl is-active "$jednostka" 2>/dev/null)
  [ "$stan" = "active" ] || [ "$stan" = "activating" ] || [ "$stan" = "reloading" ] && continue
  w_odstepie "usluga-$jednostka" && continue
  oznacz "usluga-$jednostka"
  KAT=$(nowe_zdarzenie "usluga-$jednostka")
  echo "Usługa $jednostka włączona, a w stanie: $stan." > "$KAT/objaw.txt"
  zbierz_diagnoze > "$KAT/diagnoza.txt" 2>&1
  journalctl -u "$jednostka" -n 60 --no-pager >> "$KAT/diagnoza.txt" 2>&1 || true
  krok "$KAT" "diagnoza" "zapisana"
  systemctl start "$jednostka" >/dev/null 2>&1
  sleep 10
  if [ "$(systemctl is-active "$jednostka" 2>/dev/null)" = "active" ]; then
    krok "$KAT" "start $jednostka" "działa"; raportuj "$(cat "$KAT/id")" "usluga:$jednostka" "naprawiono" "$KAT"
  else
    krok "$KAT" "start $jednostka" "nie wstała ($(systemctl is-active "$jednostka" 2>/dev/null))"
    raportuj "$(cat "$KAT/id")" "usluga:$jednostka" "nie_naprawiono" "$KAT"
  fi
done

# 4) Dysk: tylko alarm.
ZAJETE=$(df -P / 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ "${ZAJETE:-0}" -ge 95 ] && ! w_odstepie dysk; then
  oznacz dysk
  KAT=$(nowe_zdarzenie dysk)
  echo "Dysk / zajęty w ${ZAJETE}%." > "$KAT/objaw.txt"
  { zbierz_diagnoze; echo "== największe katalogi /var/log"; du -sh /var/log/* 2>/dev/null | sort -rh | head -10; } > "$KAT/diagnoza.txt" 2>&1
  krok "$KAT" "alarm" "bez automatycznego czyszczenia"
  raportuj "$(cat "$KAT/id")" "dysk" "tylko_alarm" "$KAT"
fi

# 5) rsyslog: działa, ale nie zapisuje (wpis kontrolny przez logger nie dociera do pliku) → restart rsyslog.
rsyslog_zapisuje() {
  local znak
  znak="verris-straznik-kontrola-$(teraz)-$$"
  logger -t verris-straznik "$znak" >/dev/null 2>&1 || return 0  # bez loggera nie oceniamy
  sleep 3
  tail -c 65536 "$SYSLOG_PLIK" 2>/dev/null | grep -qF "$znak"
}
if [ -r "$SYSLOG_PLIK" ] && [ "$(systemctl is-active rsyslog 2>/dev/null)" = "active" ]; then
  CISZA=$(( $(teraz) - $(stat -c %Y "$SYSLOG_PLIK" 2>/dev/null || teraz) ))
  if [ "$CISZA" -ge "$CISZA_RSYSLOG_S" ] && ! w_odstepie rsyslog && ! rsyslog_zapisuje; then
    oznacz rsyslog
    KAT=$(nowe_zdarzenie rsyslog)
    echo "rsyslog działa, ale nie zapisuje do $SYSLOG_PLIK (ostatni wpis $((CISZA / 60)) min temu, wpis kontrolny nie dotarł)." > "$KAT/objaw.txt"
    {
      zbierz_diagnoze
      echo "== rsyslog"; systemctl status rsyslog --no-pager -n 20 2>&1 | head -30
      echo "== otwarte pliki rsyslogd"; ls -l /proc/"$(pidof rsyslogd 2>/dev/null | cut -d' ' -f1)"/fd 2>/dev/null | grep -E '/var/log|journal'
    } > "$KAT/diagnoza.txt" 2>&1
    krok "$KAT" "diagnoza" "zapisana"
    log "OBJAW rsyslog: $(cat "$KAT/objaw.txt")"
    PRZED=$(stat -c %s "$SYSLOG_PLIK" 2>/dev/null || echo 0)
    systemctl restart rsyslog >/dev/null 2>&1
    # t1 14.10: po restarcie rsyslog najpierw dopisuje zaległe wpisy z dziennika (ze starymi datami), a wpis
    # kontrolny dociera dopiero po nich — miarą naprawy jest przyrost pliku, nie sam wpis kontrolny.
    logger -t verris-straznik "verris-straznik-po-restarcie-rsyslog" >/dev/null 2>&1 || true
    ROSNIE=0
    for _ in 1 2 3 4 5 6; do
      sleep 5
      [ "$(stat -c %s "$SYSLOG_PLIK" 2>/dev/null || echo 0)" -gt "$PRZED" ] && { ROSNIE=1; break; }
    done
    if [ "$ROSNIE" = 1 ]; then
      krok "$KAT" "restart rsyslog" "plik znów rośnie"; raportuj "$(cat "$KAT/id")" "rsyslog" "naprawiono" "$KAT"
    else
      krok "$KAT" "restart rsyslog" "plik nadal nie rośnie"; raportuj "$(cat "$KAT/id")" "rsyslog" "nie_naprawiono" "$KAT"
    fi
  fi
fi

# Sprzątanie diagnoz starszych niż 30 dni.
find "$LOGDIR/zdarzenia" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
exit 0
