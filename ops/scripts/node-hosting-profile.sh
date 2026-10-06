#!/usr/bin/env bash
# Verris — standardowy profil hostingowy na węźle compute (CloudLinux + DA + LiteSpeed).
# Uruchom JEDNORAZOWO jako root PO instalacji DirectAdmin i połączeniu z panelem Verris.
#
# Zawsze (także przy --skip-build): buduje i uruchamia usługi podstawowe hostingu —
# Exim, Dovecot, FTP (CustomBuild), weryfikuje nasłuch :993/:587/:21 i MariaDB.
#
# Opcje:
#   --dry-run         tylko wypisuje plan, bez zmian
#   --yes, -y         bez pytań (CustomBuild build jeśli włączony)
#   --skip-build      pomiń długi CustomBuild rebuild (tylko ustawienia + Governor + restart LS)
#   --preflight-only  tylko weryfikacja stosu (bez zmian)
#   --governor-only   tylko instalacja/konfiguracja MySQL Governor (wymaga CL + działającego MySQL/MariaDB)
#   --cagefs-only     tylko instalacja/inicjalizacja CloudLinux CageFS (izolacja kont + integracja LVE w DA)
set -Eeuo pipefail
# NODE-02 — krok, który przerwał profil przez `set -e`, zostawia w logu (panel widzi jego koniec) co i gdzie;
# wcześniej profil urywał się bez słowa. Tylko powłoka główna: w $(...) `set -e` nie działa, pułapka tak.
# shellcheck disable=SC2154  # _rc przypisywane w samej pułapce
trap '_rc=$?; [ "$BASH_SUBSHELL" != 0 ] || echo "[STOP] Profil przerwany na poleceniu: ${BASH_COMMAND} (kod $_rc, funkcja ${FUNCNAME[0]:-main}, linia $LINENO)" >&2' ERR

# PB-30 — wersje stosu z manifestu floty (API → /etc/verris-stack.env, odświeżany przez
# agenta zadań co minutę). Jeden plik dla wszystkich węzłów = węzły identyczne. Skrypt nie ma
# własnych wersji domyślnych: brak manifestu = przerwanie w miejscu użycia (${VAR:?$BRAK_MANIFESTU}).
if [ -r /etc/verris-stack.env ]; then
  # shellcheck disable=SC1091
  . /etc/verris-stack.env
fi
BRAK_MANIFESTU="brak /etc/verris-stack.env (manifest wersji floty) — uruchom agenta zadań albo onboard"

# Decyzja 2026-09-29 — panel DA (:2222) tylko z control-plane. Linię VERRIS_CONTROL_PLANE_IPS / VERRIS_DA_ADMIN_ALLOW
# podmienia API przy wydaniu skryptu (GET /agent/tasks/hosting-profile/script, env API o tych samych nazwach);
# przy ręcznym uruchomieniu — z env. Lista IPv4/IPv6/CIDR po przecinku. Pusty control-plane = zapora bez zmian.
VERRIS_CONTROL_PLANE_IPS="${VERRIS_CONTROL_PLANE_IPS:-}"
VERRIS_DA_ADMIN_ALLOW="${VERRIS_DA_ADMIN_ALLOW:-}"

GOVERNOR_PY="/usr/share/lve/dbgovernor/mysqlgovernor.py"

DRY_RUN=0
NONINTERACTIVE=0
SKIP_BUILD=0
PREFLIGHT_ONLY=0
GOVERNOR_ONLY=0
CAGEFS_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) NONINTERACTIVE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --preflight-only) PREFLIGHT_ONLY=1 ;;
    --governor-only) GOVERNOR_ONLY=1; NONINTERACTIVE=1 ;;
    --cagefs-only) CAGEFS_ONLY=1; NONINTERACTIVE=1 ;;
  esac
done

PROFILE_OK=0
PROFILE_SKIP=0
PROFILE_WARN=0
PROFILE_FAIL=0
GOVERNOR_REQUIRED=1
CAGEFS_REQUIRED=1

log_ok() { echo "[OK] $*"; PROFILE_OK=$((PROFILE_OK + 1)); }
log_skip() { echo "[SKIP] $*"; PROFILE_SKIP=$((PROFILE_SKIP + 1)); }
log_warn() { echo "[WARN] $*" >&2; PROFILE_WARN=$((PROFILE_WARN + 1)); }
log_fail() { echo "[FAIL] $*" >&2; PROFILE_FAIL=$((PROFILE_FAIL + 1)); }
log_info() { echo "[INFO] $*"; }

strip_ansi() {
  sed 's/\x1B\[[0-9;]*[a-zA-Z]//g'
}

run() {
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    echo "[dry-run] $*"
  else
    echo "[verris-profile] $*"
    eval "$@"
  fi
}

custombuild_bin() {
  local cb="$1"
  if [ -x "$cb/build" ]; then
    echo "$cb/build"
  elif [ -x "$cb/custombuild" ]; then
    echo "$cb/custombuild"
  else
    return 1
  fi
}

detect_lsphp_release() {
  local ver
  ver="$(ls -d /usr/local/lsws/lsphp*/ 2>/dev/null | sed 's|.*/lsphp||;s|/||' | sort -V | tail -1 || true)"
  [ -n "$ver" ] && echo "$ver"
}

require_root() {
  if [ "$(id -u)" != "0" ]; then
    echo "Uruchom jako root." >&2
    exit 1
  fi
}

preflight_stack() {
  echo "--- Preflight: CloudLinux / DirectAdmin / LiteSpeed ---"
  if command -v lveinfo >/dev/null 2>&1 || command -v cloudlinux-statistic >/dev/null 2>&1; then
    log_ok "CloudLinux LVE (lveinfo / cloudlinux-statistic)"
  else
    echo "BRAK: narzędzia CloudLinux LVE. Zainstaluj CL przed profilem." >&2
    exit 1
  fi

  if [ -x /usr/local/directadmin/directadmin ]; then
    log_ok "DirectAdmin (/usr/local/directadmin)"
  else
    log_warn "DirectAdmin nie wykryty — sekcja CustomBuild zostanie pominięta"
  fi

  if [ -x /usr/local/lsws/bin/lswsctrl ]; then
    log_ok "LiteSpeed (lswsctrl)"
  else
    log_warn "LiteSpeed nie wykryty — restart LS zostanie pominięty"
  fi
}

cagefsctl_bin() {
  command -v cagefsctl 2>/dev/null || { [ -x /usr/sbin/cagefsctl ] && echo /usr/sbin/cagefsctl; }
}

# CageFS aktywny? cagefsctl --cagefs-status zwraca "CageFS is enabled" / "... disabled".
cagefs_is_enabled() {
  local bin
  bin="$(cagefsctl_bin)" || return 1
  [ -n "$bin" ] || return 1
  "$bin" --cagefs-status 2>/dev/null | strip_ansi | grep -qi 'enabled'
}

# Instalacja + inicjalizacja CloudLinux CageFS (izolacja kont, wymagana dla pełnej integracji LVE w DA).
# Idempotentne: instaluje pakiet tylko gdy brak, --init tylko gdy brak skeletonu, w przeciwnym razie --force-update.
# Dokumentacja: https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#cagefs
configure_cloudlinux_cagefs() {
  echo "--- CageFS (CloudLinux) ---"
  local bin status

  if [ "$PREFLIGHT_ONLY" = "1" ]; then
    bin="$(cagefsctl_bin)" || true
    if [ -n "$bin" ]; then
      status="$("$bin" --cagefs-status 2>/dev/null | strip_ansi | head -1)"
      if cagefs_is_enabled; then
        log_ok "CageFS aktywny (${status:-cagefsctl})"
      else
        log_skip "CageFS zainstalowany, nieaktywny — uruchom profil z panelu (${status:-?})"
      fi
    else
      log_skip "CageFS niezainstalowany — profil hostingowy zainstaluje automatycznie"
    fi
    return 0
  fi

  # 1) pakiet cagefs
  if [ -z "$(cagefsctl_bin)" ] && ! rpm -q cagefs >/dev/null 2>&1; then
    log_info "Instalacja pakietu cagefs (repozytorium CloudLinux)…"
    if [ "$DRY_RUN" = "1" ]; then
      log_info "dry-run: dnf install -y cagefs"
    elif dnf install -y cagefs 2>&1 | strip_ansi || yum install -y cagefs 2>&1 | strip_ansi; then
      log_ok "Pakiet cagefs zainstalowany"
    else
      log_fail "Instalacja cagefs nie powiodła się — sprawdź licencję CL/trial i repozytoria (cldetect -i)"
      return 0
    fi
  else
    log_ok "Pakiet cagefs już zainstalowany"
  fi

  bin="$(cagefsctl_bin)" || true
  if [ -z "$bin" ]; then
    log_fail "Brak cagefsctl po instalacji — nie można zainicjalizować CageFS"
    return 0
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log_info "dry-run: $bin --init && $bin --enable-all && $bin --force-update"
    return 0
  fi

  # 2) inicjalizacja skeletonu (raz; --init bywa kosztowny, więc tylko gdy brak)
  local did_init=0
  if [ ! -d /usr/share/cagefs-skeleton ] || ! cagefs_is_enabled; then
    log_info "Inicjalizacja CageFS (cagefsctl --init — może potrwać kilka minut)…"
    if "$bin" --init 2>&1 | strip_ansi; then
      log_ok "CageFS zainicjalizowany (cagefsctl --init)"
      did_init=1
    else
      log_fail "cagefsctl --init nie powiódł się — sprawdź /var/log/cagefs.log"
      return 0
    fi
  else
    log_ok "CageFS już zainicjalizowany (skeleton + status enabled)"
  fi

  # 3) włącz CageFS dla wszystkich kont (DA mapuje użytkowników automatycznie)
  log_info "Włączanie CageFS dla wszystkich kont (cagefsctl --enable-all)…"
  if "$bin" --enable-all 2>&1 | strip_ansi; then
    log_ok "CageFS włączony dla wszystkich kont (--enable-all)"
  else
    log_warn "cagefsctl --enable-all zwrócił błąd — sprawdź cagefsctl --list-disabled"
  fi

  # 3b) rsync w CageFS — kopia robocza (staging) kopiuje pliki jako klient, w jego CageFS; bez pakietu
  # w skeletonie: „rsync: command not found” (t1 01.10). Klienci dostają też rsync przez SSH.
  # Dokumentacja: https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#cagefs (cagefsctl --addrpm)
  if ! rpm -q rsync >/dev/null 2>&1; then
    dnf install -y rsync 2>&1 | strip_ansi || log_warn "Instalacja rsync nie powiodła się"
  fi
  if "$bin" --addrpm rsync 2>&1 | strip_ansi; then
    log_ok "rsync dodany do CageFS"
    did_init=0
  else
    log_warn "cagefsctl --addrpm rsync nie powiódł się — kopia robocza (staging) nie zadziała"
  fi

  # 3c) Composer dla klientów przez SSH (C-28; t1 02.10: „composer: command not found”, wp działał).
  # Oficjalny phar z getcomposer.org/download (latest-stable) sprawdzony sumą SHA-256 publikowaną obok;
  # do /usr/local/bin jak wp-cli — skeleton CageFS odświeża krok 4. Bez pakietu composer z EPEL: ciągnie
  # systemowe PHP, które gryzie się z alt-php selektora.
  if [ ! -x /usr/local/bin/composer ]; then
    local ctmp csum
    ctmp="$(mktemp)"
    if curl -fsSL --retry 3 -o "$ctmp" https://getcomposer.org/download/latest-stable/composer.phar \
      && csum="$(curl -fsSL --retry 3 https://getcomposer.org/download/latest-stable/composer.phar.sha256sum | awk '{print $1}')" \
      && [[ "$csum" =~ ^[0-9a-f]{64}$ ]] && echo "$csum  $ctmp" | sha256sum -c --quiet - >/dev/null 2>&1; then
      install -m 0755 -o root -g root "$ctmp" /usr/local/bin/composer && log_ok "Composer zainstalowany (/usr/local/bin/composer, suma SHA-256 zgodna)"
      did_init=0
    else
      log_warn "Composer — pobranie albo suma SHA-256 niezgodna; klient nie ma composera przez SSH"
    fi
    rm -f "$ctmp"
  else
    log_ok "Composer już jest (/usr/local/bin/composer)"
  fi
  # /usr/local/bin nie jest w CageFS z automatu — t1 02.10 po instalacji: w klatce „composer: command not found”.
  # Plik w /etc/cagefs/conf.d wg CloudLinux/cPanel „Add a command or binary to CageFS”; skeleton odświeża krok 4.
  if [ -x /usr/local/bin/composer ] && ! grep -qs '/usr/local/bin/composer' /etc/cagefs/conf.d/verris-composer.cfg; then
    printf '[verris-composer]\ncomment=Composer dla klientów przez SSH (Verris, C-28)\npaths=/usr/local/bin/composer\n' \
      > /etc/cagefs/conf.d/verris-composer.cfg && did_init=0 && log_ok "Composer dodany do CageFS (/etc/cagefs/conf.d/verris-composer.cfg)"
  fi

  # 4) odśwież skeleton po zmianach oprogramowania (gdy nie było świeżego --init albo doszedł pakiet)
  if [ "$did_init" = "0" ]; then
    log_info "Aktualizacja skeletonu CageFS (cagefsctl --force-update)…"
    "$bin" --force-update 2>&1 | strip_ansi || log_warn "cagefsctl --force-update — częściowy błąd"
  fi

  # 5) usługa systemd
  if systemctl list-unit-files cagefs.service >/dev/null 2>&1; then
    systemctl enable cagefs 2>/dev/null || true
  fi

  # 6) walidacja końcowa (wzorzec walidatora Verris: udowodnij efekt)
  status="$("$bin" --cagefs-status 2>/dev/null | strip_ansi | head -1)"
  if cagefs_is_enabled; then
    local enabled_n
    enabled_n="$("$bin" --list-enabled 2>/dev/null | strip_ansi | grep -c . || echo '?')"
    log_ok "Weryfikacja: CageFS aktywny (${status:-enabled}; kont włączonych: ${enabled_n})"
  else
    log_fail "Weryfikacja: CageFS nieaktywny po konfiguracji (${status:-?})"
  fi
}

mysql_client_version_line() {
  if command -v mysql >/dev/null 2>&1; then
    mysql -V 2>/dev/null || true
  elif [ -x /usr/local/mysql/bin/mysql ]; then
    /usr/local/mysql/bin/mysql -V 2>/dev/null || true
  fi
}

# Mapuje mysql -V → słowo kluczowe CloudLinux Governor. Format wg dokumentacji CloudLinux
# (mysqlgovernor.py --mysql-version): mariadb106, mariadb1011, mariadb1104, mysql80.
# Silnika już działającego NIE zmieniamy (upgrade tylko po kolei, osobnym zadaniem node-db-upgrade).
governor_mysql_version_keyword() {
  local line="$1"
  local ver major minor

  if grep -qi mariadb <<<"$line"; then
    # Klient 10.x: „mysql  Ver 15.1 Distrib 10.11.9-MariaDB…”; od 11.x: „mysql from 11.4.5-MariaDB, client 15.2…”.
    # Bez drugiego formatu węzeł na 11.x zawsze dostawał słowo z manifestu, a ostrzeżenie o rozjeździe milczało.
    ver="$(sed -n 's/.*\(Distrib\|from\) \([0-9]\+\.[0-9]\+\).*/\2/p' <<<"$line" | head -1)"
    if [ -n "$ver" ]; then
      major="${ver%%.*}"
      minor="${ver#*.}"
      minor="${minor%%.*}"
      if [ "$major" -ge 11 ]; then
        printf 'mariadb%d%02d\n' "$major" "$minor"
      else
        echo "mariadb${major}${minor}"
      fi
      return 0
    fi
  fi

  if grep -qiE 'mysql|percona' <<<"$line"; then
    ver="$(sed -n 's/.*Distrib \([0-9]\+\.[0-9]\+\).*/\1/p' <<<"$line" | head -1)"
    if [ -n "$ver" ]; then
      major="${ver%%.*}"
      minor="${ver#*.}"
      minor="${minor%%.*}"
      echo "mysql${major}${minor}"
      return 0
    fi
  fi

  # Świeży węzeł bez silnika: wersja docelowa z manifestu floty.
  echo "${VERRIS_GOVERNOR_MYSQL:?$BRAK_MANIFESTU}"
}

governor_is_active() {
  local out
  command -v dbctl >/dev/null 2>&1 || return 1
  out="$(dbctl list 2>&1)" || return 1
  if grep -qiE "can't connect to socket|governor is not started|not responsive" <<<"$out"; then
    return 1
  fi
  return 0
}

mysql_system_user_exists() {
  getent passwd mysql >/dev/null 2>&1
}

mariadb_service_name() {
  if systemctl list-unit-files mariadb.service >/dev/null 2>&1; then
    echo mariadb
  elif systemctl list-unit-files mysqld.service >/dev/null 2>&1; then
    echo mysqld
  else
    echo mariadb
  fi
}

# Pakiety CL MariaDB per keyword Governor (świeży węzeł bez mysql -V / użytkownika mysql).
cl_mariadb_packages_for_keyword() {
  case "$1" in
    mariadb106) echo "cl-MariaDB106 cl-MariaDB106-server" ;;
    mariadb105) echo "cl-MariaDB105 cl-MariaDB105-server" ;;
    mariadb104) echo "cl-MariaDB104 cl-MariaDB104-server" ;;
    mariadb103) echo "cl-MariaDB103 cl-MariaDB103-server" ;;
    *) return 1 ;;
  esac
}

ensure_mariadb_before_governor() {
  local gov_ver="$1"
  local pkgs svc

  if mysql_system_user_exists && mysql_client_version_line | grep -q .; then
    svc="$(mariadb_service_name)"
    systemctl enable "$svc" 2>/dev/null || true
    systemctl start "$svc" 2>/dev/null || true
    return 0
  fi

  pkgs="$(cl_mariadb_packages_for_keyword "$gov_ver" || true)"
  if [ -z "$pkgs" ]; then
    log_warn "Brak mapowania pakietów CL dla $gov_ver — Governor zainstaluje silnik samodzielnie"
    return 0
  fi

  log_info "Brak użytkownika mysql / mysql -V — instalacja $pkgs przed Governor (wymagane na świeżym węźle)"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: dnf install -y $pkgs"
    return 0
  fi

  if ! dnf install -y $pkgs 2>&1 | strip_ansi; then
    log_warn "dnf install $pkgs nie powiódł się — kontynuuję z mysqlgovernor.py --install"
    return 0
  fi

  svc="$(mariadb_service_name)"
  systemctl enable "$svc" 2>/dev/null || true
  systemctl start "$svc" 2>/dev/null || true

  if mysql_system_user_exists && mysql -e "SELECT 1" >/dev/null 2>&1; then
    log_ok "MariaDB $gov_ver działa (mysql -e SELECT 1)"
  elif mysql_system_user_exists; then
    log_warn "Użytkownik mysql istnieje, ale mysql -e SELECT 1 nie działa — sprawdź journalctl -u $svc"
  else
    log_warn "Po dnf install nadal brak użytkownika mysql — Governor może paść na getpwnam('mysql')"
  fi
}

prepare_governor_install() {
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    return 0
  fi
  log_info "Przygotowanie Governor (reset modułu mariadb, czyszczenie cache instalatora)"
  remove_cl_mariadb_meta_packages
  dnf module reset mariadb -y 2>/dev/null || true
  # Strumień modułu znamy tylko dla 10.6 (węzły sprzed manifestu); nowsze wersje instaluje Governor.
  if [ "${1:-}" = "mariadb106" ]; then
    dnf module enable mariadb:cl-MariaDB106 -y 2>/dev/null || true
  fi
  rm -rf /usr/share/lve/dbgovernor/tmp/governor-tmp/* 2>/dev/null || true
  find /usr/share/lve/dbgovernor/tmp -type f \( -name '*meta*11.8*' -o -name '*MariaDB1108*' -o -name '*meta-devel*' \) -delete 2>/dev/null || true
  if [ -f /var/lve/dbgovernor-shm/governor_bad_users_list ]; then
    mv /var/lve/dbgovernor-shm/governor_bad_users_list \
      "/var/lve/dbgovernor-shm/governor_bad_users_list.bak.$(date +%s)" 2>/dev/null || true
  fi
}

remove_cl_mariadb_meta_packages() {
  local pkgs
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    return 0
  fi
  pkgs=$(rpm -qa | grep -iE '^cl-MariaDB-meta' || true)
  if [ -n "$pkgs" ]; then
    log_info "Usuwanie konfliktowych pakietów cl-MariaDB-meta (EL10 / mariadb106)"
    # shellcheck disable=SC2086
    dnf remove -y $pkgs 2>&1 | strip_ansi || log_warn "dnf remove cl-MariaDB-meta — częściowy błąd"
  fi
}

wait_for_mariadb_ready() {
  local svc="$1"
  local i
  for i in $(seq 1 45); do
    if mysql -e "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    systemctl start "$svc" 2>/dev/null || true
    sleep 2
  done
  return 1
}

ensure_mariadb_server_running() {
  local svc pkgs gov_ver="${1:?}"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    return 0
  fi
  if mysql -e "SELECT 1" >/dev/null 2>&1; then
    return 0
  fi
  if [ "$gov_ver" != "mariadb106" ]; then
    log_warn "MariaDB nie odpowiada — silnik $gov_ver zainstaluje Governor (mysqlgovernor.py --install)"
    return 0
  fi

  pkgs="cl-MariaDB106 cl-MariaDB106-server"
  if ! rpm -q cl-MariaDB106-server >/dev/null 2>&1; then
    log_info "Instalacja $pkgs (wymagane przed Governor na świeżym węźle)"
    if ! dnf install -y $pkgs 2>&1 | strip_ansi; then
      log_fail "dnf install $pkgs nie powiódł się"
      return 1
    fi
  fi

  svc="$(mariadb_service_name)"
  systemctl enable "$svc" 2>/dev/null || true
  systemctl start "$svc" 2>/dev/null || true

  if wait_for_mariadb_ready "$svc"; then
    log_ok "MariaDB działa (mysql -e SELECT 1)"
    return 0
  fi

  log_fail "MariaDB nie odpowiada po 90 s — journalctl -u $svc"
  return 1
}

recover_governor_after_install() {
  local svc gov_ver="${1:?}"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    return 0
  fi

  if governor_is_active; then
    return 0
  fi

  log_info "Governor nieaktywny po instalacji — odzyskiwanie (MariaDB + db_governor)"
  ensure_mariadb_server_running "$gov_ver" || true
  svc="$(mariadb_service_name)"
  systemctl restart "$svc" 2>/dev/null || true
  sleep 3

  run_governor_py "Ponowne ustawienie wersji Governor" --mysql-version="$gov_ver" || true
  run_governor_py "Ponowny hook Governor" --install --yes || true
  restart_db_governor_service
}

restart_db_governor_service() {
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    return 0
  fi
  if systemctl list-unit-files db_governor.service >/dev/null 2>&1; then
    systemctl enable db_governor 2>/dev/null || true
    systemctl restart db_governor 2>/dev/null || true
    sleep 2
  fi
}

governor_output_indicates_failure() {
  local out="$1"
  grep -qiE 'traceback|keyerror|error:|problem [0-9]+:|conflicting requests|installation of mysql packages will not be completed' <<<"$out"
}

install_governor_mysql_package() {
  if [ -x "$GOVERNOR_PY" ]; then
    return 0
  fi
  log_info "Instalacja pakietu governor-mysql (repozytorium CloudLinux)…"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: dnf install -y governor-mysql"
    return 0
  fi
  if dnf install -y governor-mysql 2>/dev/null || yum install -y governor-mysql 2>/dev/null; then
    log_ok "Pakiet governor-mysql zainstalowany"
    return 0
  fi
  return 1
}

run_governor_py() {
  local desc="$1"
  shift
  local out rc=0 clean
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: $GOVERNOR_PY $*"
    return 0
  fi
  echo "[verris-profile] $GOVERNOR_PY $*"
  out="$("$GOVERNOR_PY" "$@" 2>&1)" || rc=$?
  clean="$(printf '%s' "$out" | strip_ansi)"
  printf '%s\n' "$clean"

  if governor_output_indicates_failure "$clean"; then
    log_fail "$desc — wyjście Governor wskazuje na błąd (patrz Traceback/Error powyżej)"
    return 1
  fi

  if [ "$rc" -eq 0 ]; then
    return 0
  fi

  # Tylko komunikaty samego Governor — NIE traktuj dnf „already installed” jako sukcesu.
  if grep -qiE 'governor.*already|db governor.*already|nothing to do.*governor|already installed.*governor' <<<"$clean"; then
    return 0
  fi

  log_fail "$desc (rc=$rc)"
  return "$rc"
}

configure_cloudlinux_governor() {
  echo "--- MySQL Governor (CloudLinux) ---"

  if [ "$PREFLIGHT_ONLY" = "1" ]; then
    if governor_is_active; then
      log_ok "MySQL Governor aktywny (dbctl list)"
    elif [ -x "$GOVERNOR_PY" ]; then
      log_skip "mysqlgovernor.py obecny, Governor nieaktywny — uruchom profil z panelu"
    else
      log_skip "governor-mysql niezainstalowany — profil hostingowy zainstaluje automatycznie"
    fi
    mysql_client_version_line | grep -q . && log_ok "mysql client: $(mysql_client_version_line | head -c 80)"
    return 0
  fi

  if governor_is_active; then
    log_ok "MySQL Governor już aktywny (dbctl)"
    return 0
  fi

  if ! install_governor_mysql_package; then
    log_warn "Nie udało się zainstalować governor-mysql — sprawdź licencję CL/trial i repozytoria (cldetect -i)"
    return 0
  fi

  if [ ! -x "$GOVERNOR_PY" ]; then
    log_warn "Brak $GOVERNOR_PY po instalacji governor-mysql"
    return 0
  fi

  local mysql_line gov_ver
  mysql_line="$(mysql_client_version_line)"
  gov_ver="$(governor_mysql_version_keyword "$mysql_line")"
  if [ -n "$mysql_line" ]; then
    log_info "Wykryto silnik DB: $(echo "$mysql_line" | head -c 100)"
  else
    log_warn "Brak mysql -V — Governor użyje domyślnego keyword: $gov_ver"
  fi
  log_info "Governor --mysql-version=$gov_ver"

  if [ -n "${VERRIS_GOVERNOR_MYSQL:-}" ] && [ "$gov_ver" != "$VERRIS_GOVERNOR_MYSQL" ]; then
    log_warn "Silnik $gov_ver ≠ manifest floty $VERRIS_GOVERNOR_MYSQL — zostawiam działający; upgrade po kolei zadaniem node-db-upgrade"
  fi

  remove_cl_mariadb_meta_packages
  ensure_mariadb_server_running "$gov_ver" || true
  ensure_mariadb_before_governor "$gov_ver"
  prepare_governor_install "$gov_ver"

  run_governor_py "Ustawienie wersji MySQL/MariaDB dla Governor" --mysql-version="$gov_ver" || true

  local install_args=(--install)
  if [ "$NONINTERACTIVE" = "1" ]; then
    install_args+=(--yes)
  fi

  if run_governor_py "Instalacja MySQL Governor" "${install_args[@]}"; then
    restart_db_governor_service
    if governor_is_active; then
      log_ok "MySQL Governor aktywny (dbctl list)"
    else
      recover_governor_after_install "$gov_ver"
      if governor_is_active; then
        log_ok "MySQL Governor aktywny po odzyskaniu (dbctl list)"
      else
        log_fail "MySQL Governor — dbctl nadal nie działa (journalctl -u db_governor -u mariadb)"
      fi
    fi
  else
    recover_governor_after_install "$gov_ver"
    if governor_is_active; then
      log_ok "MySQL Governor aktywny po odzyskaniu (dbctl list)"
    else
      log_fail "Instalacja MySQL Governor nie powiodła się"
    fi
  fi
}

# Źródło prawdy o opcjach CustomBuild to options.conf (key=value, dokumentacja DA). Wyjście
# `./build options` jest dla człowieka (kolory, format bez gwarancji) — tylko awaryjnie.
cb_options_raw() {
  if [ -r "$CB/options.conf" ]; then
    sed -n 's/^\([A-Za-z0-9_]*\)=\(.*\)$/\1: \2/p' "$CB/options.conf"
  else
    (cd "$CB" && "$BUILD" options 2>/dev/null) | strip_ansi
  fi
}

cb_option_value() {
  local key="$1"
  cb_options_raw | sed -n "s/^${key}:[[:space:]]*//p" | head -1 | tr -d '[:space:]'
}

cb_option_supported() {
  local key="$1"
  cb_options_raw | grep -qE "^${key}:"
}

# Idempotent CustomBuild set — nie kończy profilu na "already set" ani brakującej opcji (Apache vs LiteSpeed).
cb_set_option() {
  local key="$1"
  local val="$2"

  if ! cb_option_supported "$key"; then
    log_skip "custombuild $key=$val (opcja niedostępna — np. moduły Apache przy webserver=litespeed)"
    return 0
  fi

  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: custombuild set $key $val (obecnie: $(cb_option_value "$key" || echo '?'))"
    return 0
  fi

  local out rc=0
  out="$(cd "$CB" && "$BUILD" set "$key" "$val" 2>&1)" || rc=$?
  printf '%s\n' "$out" | strip_ansi

  if [ "$rc" -eq 0 ]; then
    log_ok "custombuild $key=$val"
    return 0
  fi

  local clean
  clean="$(printf '%s' "$out" | strip_ansi)"
  if grep -qi 'already set' <<<"$clean"; then
    log_ok "custombuild $key=$val (już ustawione)"
    return 0
  fi
  if grep -qi 'not a valid' <<<"$clean"; then
    log_skip "custombuild $key=$val ($clean)"
    return 0
  fi

  echo "BŁĄD: custombuild set $key $val (rc=$rc)" >&2
  printf '%s\n' "$clean" >&2
  return "$rc"
}

configure_directadmin_custombuild() {
  if [ ! -x /usr/local/directadmin/directadmin ]; then
    log_skip "DirectAdmin — brak binarki, pomijam CustomBuild"
    return 0
  fi

  echo "--- DirectAdmin CustomBuild (LiteSpeed + LSPHP) ---"
  CB="/usr/local/directadmin/custombuild"
  BUILD="$(custombuild_bin "$CB" || true)"
  if [ -z "$BUILD" ]; then
    log_skip "brak ./build w $CB"
    return 0
  fi

  export CB BUILD

  local webserver php_release
  webserver="$(cb_option_value webserver)"
  [ -n "$webserver" ] && log_info "CustomBuild webserver=$webserver"

  cb_set_option webserver "${VERRIS_WEBSERVER:?$BRAK_MANIFESTU}"

  php_release="$(cb_option_value php1_release)"
  if [ -z "$php_release" ]; then
    php_release="$(detect_lsphp_release || true)"
  fi
  if [ -z "$php_release" ]; then
    php_release="${VERRIS_PHP1_RELEASE:?$BRAK_MANIFESTU}"
    log_warn "php1_release nieczytelne w custombuild options — używam wersji z manifestu floty $php_release"
  fi
  cb_set_option php1_release "$php_release"
  cb_set_option redis yes

  # Moduły Apache — tylko gdy CustomBuild je eksponuje (przy LiteSpeed zwykle brak mod_suexec).
  cb_set_option mod_ruid2 no
  cb_set_option mod_suexec no
  cb_set_option exim yes
  cb_set_option dovecot yes

  if [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "preflight: pominięto custombuild build"
    return 0
  fi

  if [ "$SKIP_BUILD" = "1" ]; then
    log_skip "CustomBuild rebuild (--skip-build)"
    return 0
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log_info "dry-run: custombuild build clean && build php n && build litespeed"
    return 0
  fi

  echo "INFO: pełny CustomBuild build (30–90 min, możliwy restart usług)."
  local run_build=0
  if [ "$NONINTERACTIVE" = "1" ]; then
    run_build=1
  else
    read -r -p "Uruchomić custombuild build teraz? [y/N] " ans
    if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
      run_build=1
    fi
  fi

  if [ "$run_build" = "1" ]; then
    # Składnia CustomBuild 2 wg dokumentacji DA: ./build clean, ./build php, ./build litespeed.
    run "cd $CB && $BUILD clean"
    run "cd $CB && $BUILD php"
    run "cd $CB && $BUILD litespeed"
    log_ok "CustomBuild build zakończony"
  else
    log_skip "CustomBuild build — pominięty przez operatora"
  fi
}

port_is_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE ":${port}\$"
    return $?
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | grep -qE ":${port}[[:space:]]"
    return $?
  fi
  return 1
}

systemd_unit_exists() {
  local unit="$1"
  systemctl list-unit-files "$unit" >/dev/null 2>&1
}

enable_and_restart_unit() {
  local unit="$1"
  if ! systemd_unit_exists "$unit"; then
    return 1
  fi
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: systemctl enable --now $unit"
    return 0
  fi
  systemctl enable "$unit" 2>/dev/null || true
  if systemctl restart "$unit" 2>/dev/null; then
    log_ok "systemctl restart $unit"
    return 0
  fi
  if systemctl start "$unit" 2>/dev/null; then
    log_ok "systemctl start $unit"
    return 0
  fi
  return 1
}

# DirectAdmin: `./build list` i `build <komponent>` — tylko binarka `build`.
# Wrapper `custombuild` ma inną listę (bez pureftpd) — nie używać do FTP/poczty.
resolve_custombuild_build_bin() {
  CB="${CB:-/usr/local/directadmin/custombuild}"
  if [ -x "$CB/build" ]; then
    BUILD="$CB/build"
  elif [ -n "${BUILD:-}" ] && [ -x "$BUILD" ]; then
    :
  elif [ -x "$CB/custombuild" ]; then
    BUILD="$CB/custombuild"
    log_warn "Używam custombuild zamiast build — lista komponentów może być niepełna"
  else
    BUILD=""
  fi
  export CB BUILD
}

custombuild_component_available() {
  local component="$1"
  resolve_custombuild_build_bin
  [ -n "$BUILD" ] || return 1
  (cd "$CB" && "$BUILD" list 2>/dev/null) | strip_ansi | grep -qw "$component"
}

custombuild_build_component() {
  local component="$1"
  resolve_custombuild_build_bin
  [ -n "$BUILD" ] || return 1

  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: custombuild build $component"
    return 0
  fi

  if ! custombuild_component_available "$component"; then
    log_warn "CustomBuild list: brak $component — próbuję build mimo to"
  fi

  log_info "CustomBuild build $component (może potrwać kilka–kilkanaście min)…"
  local out rc=0
  # DA: komponenty (exim, dovecot, pureftpd) → `./build <name>`; meta (clean, php n) → `./build build …`
  out="$(cd "$CB" && "$BUILD" "$component" 2>&1)" || rc=$?
  if [ "$rc" -ne 0 ] && grep -qiE 'usage|help|unknown|invalid' <<<"$(printf '%s' "$out" | strip_ansi | head -20)"; then
    out="$(cd "$CB" && "$BUILD" build "$component" 2>&1)" || rc=$?
  fi
  printf '%s\n' "$out" | strip_ansi | tail -n 20
  if [ "$rc" -eq 0 ]; then
    log_ok "CustomBuild build $component"
    return 0
  fi
  log_fail "CustomBuild build $component (rc=$rc)"
  return "$rc"
}

cb_ftp_build_component() {
  local ftpserver
  ftpserver="$(cb_option_value ftpserver 2>/dev/null || true)"
  case "$ftpserver" in
    proftpd) echo proftpd ;;
    pureftpd|pure-ftpd|"") echo pureftpd ;;
    *) echo pureftpd ;;
  esac
}

ensure_hosting_core_services() {
  echo "--- Usługi podstawowe (poczta, FTP, baza) ---"

  if [ ! -x /usr/local/directadmin/directadmin ]; then
    log_skip "DirectAdmin — brak binarki, pomijam pocztę/FTP CustomBuild"
  else
    resolve_custombuild_build_bin

    if [ -n "$BUILD" ]; then
      cb_set_option exim yes
      cb_set_option dovecot yes

      if port_is_listening 993 || port_is_listening 587; then
        log_ok "Poczta — port IMAP/SMTP już nasłuchuje"
      else
        custombuild_build_component exim || true
        custombuild_build_component dovecot || true
        enable_and_restart_unit exim.service || enable_and_restart_unit exim || true
        enable_and_restart_unit dovecot.service || enable_and_restart_unit dovecot || true
      fi

      if port_is_listening 21; then
        log_ok "FTP — port 21 już nasłuchuje"
      else
        local ftp_component ftp_built=0
        ftp_component="$(cb_ftp_build_component)"
        if custombuild_build_component "$ftp_component"; then
          ftp_built=1
        elif [ "$ftp_component" != "pureftpd" ] && custombuild_build_component pureftpd; then
          ftp_built=1
        elif custombuild_build_component proftpd; then
          ftp_built=1
        fi
        if [ "$ftp_built" = "1" ]; then
          enable_and_restart_unit pure-ftpd.service || enable_and_restart_unit pureftpd.service \
            || enable_and_restart_unit proftpd.service || enable_and_restart_unit proftpd || true
        fi
      fi
    else
      log_warn "CustomBuild niedostępny — nie można zbudować exim/dovecot/FTP"
    fi
  fi

  # MariaDB — Governor instaluje silnik; tu tylko upewniamy się, że usługa działa.
  local db_unit="mariadb"
  if systemd_unit_exists mysqld.service; then
    db_unit="mysqld"
  fi
  if [ "$PREFLIGHT_ONLY" = "1" ] || [ "$DRY_RUN" = "1" ]; then
    log_info "dry-run: weryfikacja $db_unit + mysql SELECT 1"
  elif mysql -e "SELECT 1" >/dev/null 2>&1; then
    log_ok "MariaDB/MySQL odpowiada (SELECT 1)"
  else
    enable_and_restart_unit "${db_unit}.service" || true
    if mysql -e "SELECT 1" >/dev/null 2>&1; then
      log_ok "MariaDB/MySQL odpowiada po restarcie $db_unit"
    else
      log_fail "MariaDB/MySQL nie odpowiada — uruchom sekcję Governor lub sprawdź journalctl -u $db_unit"
    fi
  fi

  if [ "$PREFLIGHT_ONLY" = "1" ] || [ "$DRY_RUN" = "1" ]; then
    if port_is_listening 993; then
      log_ok "preflight: IMAPS :993"
    elif port_is_listening 587; then
      log_ok "preflight: SMTP submission :587"
    else
      log_warn "preflight: brak nasłuchu na :993/:587 (po profilu uruchom build exim/dovecot)"
    fi
    if port_is_listening 21; then
      log_ok "preflight: FTP :21"
    else
      log_warn "preflight: brak nasłuchu na :21"
    fi
    return 0
  fi

  if port_is_listening 993 || port_is_listening 587; then
    log_ok "Poczta — IMAP/SMTP nasłuchuje (:993 lub :587)"
  else
    log_fail "Poczta — brak nasłuchu na :993 i :587 po build exim/dovecot"
  fi

  if port_is_listening 21; then
    log_ok "FTP — port 21 nasłuchuje"
  else
    log_warn "FTP — port 21 nie nasłuchuje (sprawdź pure-ftpd/proftpd w CustomBuild)"
  fi
}

configure_litespeed() {
  echo "--- LiteSpeed ---"
  if [ ! -x /usr/local/lsws/bin/lswsctrl ]; then
    log_skip "LiteSpeed nie wykryty"
    return 0
  fi

  log_info "Cache per konto: public_html/.htaccess lub szablon vhost w DA"
  if [ "$PREFLIGHT_ONLY" = "1" ] || [ "$DRY_RUN" = "1" ]; then
    log_info "dry-run: lswsctrl restart"
    return 0
  fi

  if /usr/local/lsws/bin/lswsctrl restart 2>/dev/null; then
    log_ok "LiteSpeed restart"
  else
    log_warn "LiteSpeed restart zwrócił błąd (sprawdź lswsctrl status)"
  fi
}

# G-21 — ochrona L7 stron klientów: LiteSpeed Per-Client Throttling (dokumentacja LiteSpeed „DDoS Attack Protection”,
# WebAdmin → Configuration → Server → Security → Per-Client Throttling = <security><perClientConnLimit> w
# httpd_config.xml). Wartości przykładowe z dokumentacji (2 dyn./s, 15/20 połączeń) dokumentacja sama opisuje jako
# ryzyko fałszywych blokad przy wspólnym IP (biuro za NAT, CDN) — na hostingu współdzielonym luźniej: PHP 20/s z jednego
# IP (zalew z jednego adresu i tak tnie z tysięcy do 20), pliki statyczne bez limitu, połączenia 100/150, blokada 60 s.
# Pokrętła: VERRIS_LSWS_DYN_RPS, _STATIC_RPS, _SOFT, _HARD, _GRACE, _BAN (decyzja D3 02.10, ops/docs/DDOS.md).
configure_litespeed_throttling() {
  local conf=/usr/local/lsws/conf/httpd_config.xml
  [ -x /usr/local/lsws/bin/lswsctrl ] && [ -f "$conf" ] || { log_skip "LiteSpeed throttling — brak LSWS"; return 0; }
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then log_info "dry-run: Per-Client Throttling w LSWS"; return 0; fi
  local zmiana bak="/root/httpd_config.xml.verris-$(date +%Y%m%d%H%M%S)"
  cp -p "$conf" "$bak" 2>/dev/null || true
  zmiana="$(STATIC="${VERRIS_LSWS_STATIC_RPS:-0}" DYN="${VERRIS_LSWS_DYN_RPS:-20}" SOFT="${VERRIS_LSWS_SOFT:-100}" \
    HARD="${VERRIS_LSWS_HARD:-150}" GRACE="${VERRIS_LSWS_GRACE:-15}" BAN="${VERRIS_LSWS_BAN:-60}" \
    python3 - "$conf" "$conf.cagefs" <<'PY_THROTTLE'
import os, re, sys
chce = {"staticReqPerSec": os.environ["STATIC"], "dynReqPerSec": os.environ["DYN"], "softLimit": os.environ["SOFT"],
        "hardLimit": os.environ["HARD"], "gracePeriod": os.environ["GRACE"], "banPeriod": os.environ["BAN"]}
for k, v in chce.items():
    if not re.fullmatch(r"\d{1,6}", v):
        sys.exit("nieprawidłowa wartość %s=%r" % (k, v))
zmienione = 0
brak = []
for plik in sys.argv[1:]:
    if not os.path.isfile(plik):
        continue
    t = open(plik, encoding="utf-8").read()
    m = re.search(r"<perClientConnLimit>.*?</perClientConnLimit>", t, re.S)
    if not m:
        brak.append(plik)
        continue
    blok = m.group(0)
    for k, v in chce.items():
        if re.search(r"<%s>[^<]*</%s>" % (k, k), blok):
            blok = re.sub(r"<%s>[^<]*</%s>" % (k, k), "<%s>%s</%s>" % (k, v, k), blok)
        else:
            blok = blok.replace("</perClientConnLimit>", "  <%s>%s</%s>\n    </perClientConnLimit>" % (k, v, k))
    if blok == m.group(0):
        continue
    tmp = plik + ".verris-tmp"
    st = os.stat(plik)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(t[:m.start()] + blok + t[m.end():])
    os.chown(tmp, st.st_uid, st.st_gid)
    os.chmod(tmp, st.st_mode & 0o7777)
    os.replace(tmp, plik)
    zmienione += 1
if brak and not zmienione and len(brak) == len([p for p in sys.argv[1:] if os.path.isfile(p)]):
    sys.exit("brak <perClientConnLimit> w " + ", ".join(brak))
print(zmienione)
PY_THROTTLE
)" || { log_fail "LiteSpeed throttling — nie udało się ustawić Per-Client Throttling w $conf"; return 0; }
  if [ "${zmiana:-0}" = "0" ]; then
    rm -f "$bak"
  else
    /usr/local/lsws/bin/lswsctrl restart >/dev/null 2>&1 || log_warn "LiteSpeed restart po zmianie Per-Client Throttling zwrócił błąd"
  fi
  if grep -q "<dynReqPerSec>${VERRIS_LSWS_DYN_RPS:-20}</dynReqPerSec>" "$conf"; then
    log_ok "LiteSpeed Per-Client Throttling: PHP ${VERRIS_LSWS_DYN_RPS:-20}/s z IP, połączenia ${VERRIS_LSWS_SOFT:-100}/${VERRIS_LSWS_HARD:-150}, blokada ${VERRIS_LSWS_BAN:-60} s"
  else
    log_fail "LiteSpeed Per-Client Throttling nie ustawiony"
  fi
}

# E-21 — przenoszenie poczty: worker migracji (node-migration-worker.sh, run_imap) pisze do skrzynki klienta
# przez IMAP na 127.0.0.1 jako użytkownik master Dovecota (SASL PLAIN z authzid = skrzynka), więc nie potrzebuje
# hasła skrzynki. Do 03.10 nic tego konta nie zakładało — każde zlecenie poczty kończyło się rc=2 („dovecot master
# credentials not configured”, test t1 03.10). Konfiguracja wg doc.dovecot.org (2.4) „Master Users/Passwords”:
# osobna passdb passwd-file z master = yes i result_success = continue (sprawdza, że skrzynka docelowa istnieje);
# nazwana inaczej niż passdb DirectAdmina, żeby bloki się nie scaliły. Plik w conf.d jak przy Radicale (E-23).
# Logowanie mastera tylko z localhost: pole allow_nets w pliku passwd-file (doc.dovecot.org → passdb extra fields).
# Hasło losowe, raz; trafia do /etc/verris.conf (root, 0600), skąd czyta je worker. Hash SHA512-CRYPT przez openssl
# ze stdin — hasło nie pojawia się w argv.
configure_dovecot_migration_master() {
  local dd="${VERRIS_DOVECOT_DIR:-/etc/dovecot}" vconf="${VERRIS_CONF_FILE:-/etc/verris.conf}"
  local plik="$dd/verris-master-users" conf="$dd/conf.d/91-verris-migracja.conf" uzytk=verris-migracja
  command -v doveconf >/dev/null 2>&1 || { log_skip "Dovecot master (migracja poczty) — brak Dovecota"; return 0; }
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then log_info "dry-run: konto master Dovecota dla migracji poczty"; return 0; fi
  [ -f "$vconf" ] || { log_warn "Dovecot master — brak $vconf (najpierw bootstrap węzła)"; return 0; }
  local haslo
  haslo="$(sed -n "s/^VERRIS_DOVECOT_MASTER_PASS='\(.*\)'$/\1/p" "$vconf" | tail -1)"
  if [ -z "$haslo" ]; then
    haslo="$(openssl rand -hex 24)" || { log_fail "Dovecot master — nie udało się wylosować hasła"; return 0; }
    { printf "VERRIS_DOVECOT_MASTER_USER='%s'\n" "$uzytk"; printf "VERRIS_DOVECOT_MASTER_PASS='%s'\n" "$haslo"; } >>"$vconf"
  fi
  chmod 600 "$vconf"
  local hash
  hash="$(printf '%s\n' "$haslo" | openssl passwd -6 -stdin)" || { log_fail "Dovecot master — nie udało się policzyć skrótu hasła"; return 0; }
  ( umask 027; printf '%s:{SHA512-CRYPT}%s::::::allow_nets=127.0.0.1/32,::1/128\n' "$uzytk" "$hash" >"$plik.tmp" )
  getent group dovecot >/dev/null 2>&1 && chgrp dovecot "$plik.tmp"
  mv -f "$plik.tmp" "$plik"
  local nowy=0
  if [ ! -f "$conf" ]; then
    nowy=1
    cat >"$conf" <<DCONF
# Zarządzane przez Verris (E-21) — konto master tylko dla migracji poczty (logowanie wyłącznie z localhost).
passdb verris-migracja {
  driver = passwd-file
  passwd_file_path = $plik
  master = yes
  result_success = continue
}
DCONF
  fi
  if doveconf -n >/dev/null 2>&1 && doveconf -n 2>/dev/null | grep -q 'verris-master-users'; then
    [ "$nowy" = "1" ] && { systemctl reload dovecot >/dev/null 2>&1 || doveadm reload >/dev/null 2>&1 || true; }
    log_ok "Dovecot: konto master migracji poczty ($uzytk, tylko localhost)"
  else
    rm -f "$conf"
    log_fail "Dovecot nie przyjął konfiguracji konta master migracji — konfiguracja Dovecota bez zmian"
  fi
}

# B-02/B-03 — PHP domeny i katalogu: `AddHandler application/x-httpd-alt-phpXX` w .htaccess działa
# w LiteSpeed dopiero, gdy serwer zna handler o id `alt-phpXX` (<phpConfig><phpHandler>). Bez niego
# LSWS odpowiada 403 „MIME type … does not allow serving as static file” (test D3 na t1, 28.09).
# Dopisujemy handler dla każdej zainstalowanej wersji alt-php i restartujemy LSWS (łagodnie).
configure_litespeed_alt_php() {
  local conf=/usr/local/lsws/conf/httpd_config.xml
  [ -x /usr/local/lsws/bin/lswsctrl ] && [ -f "$conf" ] || { log_skip "LiteSpeed alt-php — brak LSWS"; return 0; }
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then log_info "dry-run: handlery alt-php w LSWS"; return 0; fi
  local wersje="" v
  for v in ${VERRIS_PHP_VERSIONS:?$BRAK_MANIFESTU}; do
    [ -x "/opt/alt/php${v/./}/usr/bin/lsphp" ] && wersje="$wersje ${v/./}"
  done
  [ -n "$wersje" ] || { log_warn "LiteSpeed alt-php — brak /opt/alt/phpXX/usr/bin/lsphp"; return 0; }
  local zmiana bak="/root/httpd_config.xml.verris-$(date +%Y%m%d%H%M%S)"
  cp -p "$conf" "$bak" 2>/dev/null || true
  zmiana="$(WERSJE="$wersje" python3 - "$conf" "$conf.cagefs" <<'PY'
import os, re, sys
wersje = os.environ["WERSJE"].split()
zmienione = 0
for plik in sys.argv[1:]:
    if not os.path.isfile(plik):
        continue
    t = open(plik, encoding="utf-8").read()
    if "</phpConfig>" not in t:
        continue
    nowe = ""
    for v in wersje:
        if "<id>alt-php%s</id>" % v in t:
            continue
        nowe += "    <phpHandler>\n      <id>alt-php%s</id>\n      <command>/opt/alt/php%s/usr/bin/lsphp</command>\n    </phpHandler>\n" % (v, v)
    if not nowe:
        continue
    # za ostatnim istniejącym <phpHandler> albo na początku <phpConfig>
    m = list(re.finditer(r"</phpHandler>\n", t))
    at = m[-1].end() if m else t.index("<phpConfig>") + len("<phpConfig>\n")
    tmp = plik + ".verris-tmp"
    st = os.stat(plik)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(t[:at] + nowe + t[at:])
    os.chown(tmp, st.st_uid, st.st_gid)
    os.chmod(tmp, st.st_mode & 0o7777)
    os.replace(tmp, plik)
    zmienione += 1
print(zmienione)
PY
)" || { log_fail "LiteSpeed alt-php — nie udało się zapisać $conf"; return 0; }
  if [ "${zmiana:-0}" = "0" ]; then
    rm -f "$bak"
  else
    /usr/local/lsws/bin/lswsctrl restart >/dev/null 2>&1 || log_warn "LiteSpeed restart po dodaniu handlerów alt-php zwrócił błąd"
  fi
  local brak=""
  for v in $wersje; do grep -q "<id>alt-php$v</id>" "$conf" || brak="$brak $v"; done
  if [ -z "$brak" ]; then
    log_ok "LiteSpeed: handlery alt-php dla$(printf ' %s' $wersje) (PHP domeny/katalogu w .htaccess)"
  else
    log_fail "LiteSpeed: brak handlerów alt-php dla:$brak"
  fi
}

print_lve_info() {
  echo "--- LVE / CageFS ---"
  log_info "Limity EP/NPROC per konto ustawia Verris przy provisioning (plan → DA) + agent verris-lve.sh"
  if cagefs_is_enabled; then
    log_info "CageFS aktywny — konta izolowane, integracja LVE w DirectAdmin działa (limity pakietów egzekwowane)"
  else
    log_warn "CageFS nieaktywny — DA spada na limity systemd-cgroup zamiast pełnej integracji LVE"
  fi
  log_info "Sprawdź: lvectl list, cagefsctl --cagefs-status, cagefsctl --list-enabled"
}

# Po udanym profilu z panelu admin: pobierz szablon strony domyślnej z API i zainstaluj w DA.
install_verris_default_page_from_api() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[VERRIS_DEFAULT_PAGE] status=skipped reason=dry_run"
    return 0
  fi
  if [ "$GOVERNOR_ONLY" = "1" ] || [ "$CAGEFS_ONLY" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    echo "[VERRIS_DEFAULT_PAGE] status=skipped reason=partial_profile"
    return 0
  fi
  if [ ! -r /etc/verris.conf ]; then
    echo "[VERRIS_DEFAULT_PAGE] status=skipped reason=no_verris_conf"
    return 0
  fi

  # shellcheck disable=SC1090
  source /etc/verris.conf
  : "${VERRIS_API_URL:?missing VERRIS_API_URL}"
  : "${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
  : "${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

  local dest="/var/lib/verris/hosting-default-page"
  local install_bin="/usr/local/bin/verris-install-default-page.sh"
  local bundle="/tmp/verris-default-page-bundle.tar.gz"

  echo ""
  echo "=== Verris — strona domyślna hostingu ==="

  # PB-36 — pobrania z control-plane tylko z ważnym podpisem (verris-fetch)
  if ! verris-fetch /agent/tasks/hosting-profile/default-page/script "$install_bin" 120; then
    echo "[VERRIS_DEFAULT_PAGE] status=fail reason=script_download" >&2
    return 1
  fi
  chmod 755 "$install_bin"

  if ! verris-fetch /agent/tasks/hosting-profile/default-page/bundle "$bundle" 180; then
    echo "[VERRIS_DEFAULT_PAGE] status=fail reason=bundle_download" >&2
    return 1
  fi

  rm -rf "$dest"
  mkdir -p "$dest"
  if ! tar -xzf "$bundle" -C "$dest"; then
    echo "[VERRIS_DEFAULT_PAGE] status=fail reason=extract" >&2
    return 1
  fi

  local src="$dest"
  if [ ! -f "$src/index.html" ] && [ -f "$src/hosting-default-page/index.html" ]; then
    src="$src/hosting-default-page"
  fi
  if [ ! -f "$src/index.html" ]; then
    echo "[VERRIS_DEFAULT_PAGE] status=fail reason=missing_index" >&2
    return 1
  fi

  if VERRIS_DEFAULT_PAGE_SRC="$src" bash "$install_bin"; then
    return 0
  fi
  echo "[VERRIS_DEFAULT_PAGE] status=fail reason=install_script" >&2
  return 1
}

print_summary() {
  local exit_code=0
  echo ""
  echo "=== Podsumowanie profilu ==="
  echo "OK=$PROFILE_OK  SKIP=$PROFILE_SKIP  WARN=$PROFILE_WARN  FAIL=$PROFILE_FAIL"
  if [ "$PROFILE_FAIL" -gt 0 ]; then
    echo "Profil zakończony BŁĘDEM — napraw [FAIL] powyżej przed provisioningiem."
    exit_code=1
  elif [ "$PROFILE_WARN" -gt 0 ]; then
    echo "Profil zakończony z ostrzeżeniami (patrz [WARN] powyżej)."
  else
    echo "=== Profil zakończony ==="
  fi
  if [ "$CAGEFS_REQUIRED" = "1" ] && [ "$GOVERNOR_ONLY" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && [ "$DRY_RUN" != "1" ] && ! cagefs_is_enabled; then
    echo "BŁĄD: CageFS nieaktywny — wymagany dla izolacji kont i integracji LVE w DirectAdmin." >&2
    exit_code=1
  fi
  if [ "$GOVERNOR_REQUIRED" = "1" ] && [ "$CAGEFS_ONLY" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && [ "$DRY_RUN" != "1" ] && ! governor_is_active; then
    echo "BŁĄD: MySQL Governor nieaktywny — wymagany przed LIVE provisioning." >&2
    exit_code=1
  fi

  if [ "$exit_code" -eq 0 ]; then
    if ! install_verris_default_page_from_api; then
      echo "BŁĄD: instalacja strony domyślnej Verris nie powiodła się." >&2
      exit_code=1
    fi
  fi

  # Jedna linia na końcu logu — panel Verris obcina log do ~120 KB (zostaje koniec);
  # bez tego Governor/CageFS z początku profilu nie są widoczne w diagnostyce API.
  emit_verris_profile_summary

  echo "Następnie: panel admin → węzeł → Test DirectAdmin → status probes → smoke provisioning."
  echo "Pakiety DA (starter/pro/business): ten skrypt ich NIE zmienia. Po profilu API może zsynchronizować limity z planów."
  echo "Jeśli edytor DA pokazuje «Bez ograniczeń» przy poprawnych limitach w API — użyj «Napraw pakiety DA» w panelu admin."
  return "$exit_code"
}

# -----------------------------------------------------------------------------
# Możliwości hostingu (A1 SSL, A2 PHP Selector, A3 LSCache/QUIC, A5 DKIM, A6 Redis)
# -----------------------------------------------------------------------------
DA_CONF="/usr/local/directadmin/conf/directadmin.conf"

# Idempotentne ustawienie klucza w directadmin.conf (DA czyta przy restarcie).
da_set_conf() {
  local key="$1" val="$2"
  [ -f "$DA_CONF" ] || { log_skip "directadmin.conf brak — pomijam $key=$val"; return 0; }
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: directadmin.conf $key=$val"
    return 0
  fi
  if grep -qE "^${key}=" "$DA_CONF"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$DA_CONF"
  else
    echo "${key}=${val}" >> "$DA_CONF"
  fi
  log_ok "directadmin.conf ${key}=${val}"
}

configure_hosting_capabilities() {
  echo ""; echo "=== Możliwości hostingu (SSL / DKIM / LSCache / PHP Selector / Redis) ==="

  # A1 — Let's Encrypt domyślnie dla nowych kont + wymuszone przekierowanie HTTPS.
  da_set_conf letsencrypt 1
  # A5 — DKIM auto-generowany przy tworzeniu domeny + podpisywanie poczty wychodzącej.
  da_set_conf dkim 1
  # dns_ttl to przełącznik edycji TTL per rekord; domyślny TTL strefy to default_ttl (oficjalna lista directadmin.conf).
  da_set_conf default_ttl 3600
  # F-06 — DNSSEC: panel podpisuje strefy przez CMD_API_DNS_ADMIN action=dnssec (poziom admina,
  # user_dnssec_control zostaje 0). Oficjalnie: „Make sure you have dnssec=1 in the directadmin.conf”
  # (docs.directadmin.com → Maintaining DNS records → DNSSEC); restart DA niżej.
  da_set_conf dnssec 1
  # E-12 — filtry poczty po stronie serwera (Sieve): wtyczka Dovecot Pigeonhole. DirectAdmin 1.710 (Dovecot
  # 2.4) nie ma już `da build dovecot_pigeonhole` („This command is no longer supported. Please use command
  # 'da build dovecot' instead” — retest D3 29.09): Pigeonhole buduje się razem z Dovecotem po
  # `da build set pigeonhole yes` (forum DA, wątek „pigeonhole and dovecot 2.4”; dokumentacja DA „Filtering
  # incoming spam” → Dovecot 2.4.x). Potem dovecot_conf i Roundcube (managesieve). Reguły klient ustawia
  # w webmailu (Roundcube → Ustawienia → Filtry). Budowa tylko, gdy Dovecot jeszcze nie ma sieve.
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && command -v da >/dev/null 2>&1; then
    if ! doveconf -n 2>/dev/null | grep -qi 'sieve'; then
      { da build set pigeonhole yes && da build dovecot && da build dovecot_conf && da build roundcube; } \
        >/var/log/verris-pigeonhole.log 2>&1 || true
    fi
    if doveconf -n 2>/dev/null | grep -qi 'sieve'; then
      log_ok "Dovecot Pigeonhole (Sieve) aktywny — filtry w webmailu (log budowy: /var/log/verris-pigeonhole.log)"
    else
      log_warn "Pigeonhole — Dovecot bez sieve po budowie (log: /var/log/verris-pigeonhole.log); filtry w webmailu niedostępne"
    fi
  fi
  # PANEL-9 — filtr antyspam klienta (CMD_API_SPAMASSASSIN) wymaga działającego spamd. Sonda API DA na t1
  # (29.09): „Spamd nie jest uruchomiony w systemie” — profil nigdy go nie instalował, a panel pokazywał
  # filtr jako włączony. Rspamd wg dokumentacji DA („Filtering incoming spam”): ustawienia użytkownika
  # działają jak dla SpamAssassin (te same pliki w katalogu użytkownika).
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && command -v da >/dev/null 2>&1; then
    if systemctl is-active --quiet rspamd 2>/dev/null || systemctl is-active --quiet spamassassin 2>/dev/null; then
      log_ok "Antyspam: spamd działa ($(cb_option_value spamd))"
    else
      { da build set easy_spam_fighter yes && da build set spamd rspamd && da build easy_spam_fighter \
          && da build rspamd && da build exim_conf; } >>/var/log/verris-rspamd.log 2>&1 || true
      if systemctl is-active --quiet rspamd 2>/dev/null; then
        log_ok "Antyspam: rspamd zainstalowany i uruchomiony (log: /var/log/verris-rspamd.log)"
      else
        log_fail "Antyspam: rspamd nie działa po instalacji — /var/log/verris-rspamd.log (filtr w panelu klienta nie zadziała)"
      fi
    fi
  fi
  # BlockCracking (CustomBuild, Exim): blokuje wysyłkę ze skrzynki, której hasło przejęto i która zaczyna
  # rozsyłać spam — jedna taka skrzynka na wspólnym IP węzła psuje dostarczalność wszystkim klientom.
  # Decyzja właściciela 01.10; opcja z `da build opt_help`: blockcracking: yes, no (domyślnie no).
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && command -v da >/dev/null 2>&1; then
    if [ "$(cb_option_value blockcracking)" = "yes" ]; then
      log_ok "Exim BlockCracking włączony"
    elif { da build set blockcracking yes && da build blockcracking; } >>/var/log/verris-blockcracking.log 2>&1; then
      log_ok "Exim BlockCracking zainstalowany (log: /var/log/verris-blockcracking.log)"
    else
      log_warn "Exim BlockCracking — budowa nie powiodła się (log: /var/log/verris-blockcracking.log)"
    fi
  fi
  # Webmail i phpMyAdmin jednym kliknięciem z panelu klienta (SSO → lista skrzynek w DA). Test D3 na t1
  # (29.09): przy skrzynkach nie było logowania do webmaila — profil nie włączał one_click_webmail_login
  # ani nie budował Roundcube z modułem direct_login (changelog DA 1.58.2: set + dovecot_conf, exim_conf,
  # roundcube). one_click_pma_login — SSO phpMyAdmin (/CMD_PMA/), z którego korzysta panel.
  da_set_conf one_click_webmail_login 1
  da_set_conf one_click_pma_login 1
  # Webmail Verris: po polsku i w marce (logo Verris Poczta, kolory, czcionka). Próba bety 06.10: Roundcube
  # 1.7.4 z CustomBuild otwierał się po angielsku (mimo przeglądarki pl-PL) i z logo Roundcube.
  # Wg dokumentacji DA (https://docs.directadmin.com/other-hosting-services/webmail/) pliki z custom/roundcube
  # zastępują odpowiedniki z configure/roundcube przy `da build roundcube`; do config.inc.php CustomBuild
  # dopisuje bazę i klucze (na t1: szablon 615 B → wynikowy config 852 B). Marka to plugin verris_marka
  # (ops/roundcube, podpisany pakiet z control-plane), a opcje Roundcube (language, product_name, skin_logo,
  # blankpage_url — config/defaults.inc.php) stoją w bloku między znacznikami, odtwarzanym przy każdym przebiegu.
  # Język dotyczy nowych skrzynek — Roundcube zapamiętuje go użytkownikowi przy pierwszym logowaniu.
  # ponytail: kopia szablonu DA zamraża jego treść; po nowej wersji DA porównać z configure/ i odświeżyć.
  RC_DA="${RC_DA:-/usr/local/directadmin/custombuild}"
  RC_LOG="${RC_LOG:-/var/log/verris-roundcube.log}"
  RC_CUSTOM_DIR="$RC_DA/custom/roundcube"
  RC_CUSTOM="$RC_CUSTOM_DIR/config.inc.php"
  RC_SZABLON="$RC_DA/configure/roundcube/config.inc.php"
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && command -v da >/dev/null 2>&1 && [ -f "$RC_SZABLON" ]; then
    rc_przebuduj=0
    rc_marka=0
    if command -v verris-fetch >/dev/null 2>&1; then
      rc_tmp="$(mktemp -d)"
      if verris-fetch /agent/tasks/hosting-profile/webmail/bundle "$rc_tmp/marka.tgz" 120 \
        && mkdir -p "$rc_tmp/x" && tar -xzf "$rc_tmp/marka.tgz" -C "$rc_tmp/x" --no-same-owner; then
        # custom/roundcube/plugins zastępuje configure/roundcube/plugins w całości — zaczynamy od kopii DA.
        [ -d "$RC_CUSTOM_DIR/plugins" ] || { mkdir -p "$RC_CUSTOM_DIR"; cp -a "$RC_DA/configure/roundcube/plugins" "$RC_CUSTOM_DIR/plugins" 2>/dev/null || mkdir -p "$RC_CUSTOM_DIR/plugins"; }
        if ! diff -rq "$rc_tmp/x" "$RC_CUSTOM_DIR/plugins/verris_marka" >/dev/null 2>&1; then
          rm -rf "$RC_CUSTOM_DIR/plugins/verris_marka"
          cp -r "$rc_tmp/x" "$RC_CUSTOM_DIR/plugins/verris_marka"
          rc_przebuduj=1
        fi
      else
        log_warn "Webmail: nie pobrano marki Verris (logo, kolory) — zostaje wygląd Roundcube"
      fi
      rm -rf "$rc_tmp"
    fi
    [ -f "$RC_CUSTOM_DIR/plugins/verris_marka/verris_marka.php" ] && rc_marka=1
    rc_host="$(hostname -f 2>/dev/null || hostname)"
    rc_p="plugins/verris_marka"
    rc_blok="// >>> Verris (node-hosting-profile.sh) — blok odtwarzany przy każdym przebiegu profilu
\$config['language'] = 'pl_PL';"
    if [ "$rc_marka" = 1 ]; then
      rc_blok="$rc_blok
\$config['product_name'] = 'Verris Poczta';
\$config['plugins'][] = 'verris_marka';
\$config['skin_logo'] = [
  'elastic:login' => '$rc_p/logo.svg',
  'elastic:login[dark]' => '$rc_p/logo-dark.svg',
  'elastic:*' => '$rc_p/znak.svg',
  'elastic:*[dark]' => '$rc_p/znak.svg',
  'elastic:*[small]' => '$rc_p/logo-dark.svg',
  'elastic:*[small-dark]' => '$rc_p/logo-dark.svg',
  '[favicon]' => '$rc_p/favicon.svg',
];
\$config['blankpage_url'] = 'https://$rc_host/roundcube/static.php/$rc_p/watermark.html';"
    fi
    rc_blok="$rc_blok
// <<< Verris"
    mkdir -p "$RC_CUSTOM_DIR"
    [ -f "$RC_CUSTOM" ] || cp "$RC_SZABLON" "$RC_CUSTOM"
    rc_nowy="$(sed '/^\/\/ >>> Verris/,/^\/\/ <<< Verris/d' "$RC_CUSTOM")
$rc_blok"
    if [ "$rc_nowy" != "$(cat "$RC_CUSTOM")" ]; then
      printf '%s\n' "$rc_nowy" > "$RC_CUSTOM"
      rc_przebuduj=1
    fi
    # Ścieżkę liczymy po budowie: katalog z losowym sufiksem (t1: /var/www/webapps/roundcubemail-1.7.4-ehlr)
    # wskazuje, że CustomBuild instaluje do nowego katalogu i przestawia dowiązanie — stara ścieżka kłamie.
    rc_konf() { printf '%s/../config/config.inc.php' "$(readlink -f "${RC_WWW:-/var/www/html/roundcube}" 2>/dev/null)"; }
    grep -q "'language'.*pl_PL" "$(rc_konf)" 2>/dev/null || rc_przebuduj=1
    if [ "$rc_przebuduj" = 1 ]; then
      da build roundcube >>"$RC_LOG" 2>&1 || true
    fi
    RC_KONF="$(rc_konf)"
    if grep -q "'language'.*pl_PL" "$RC_KONF" 2>/dev/null; then
      log_ok "Webmail po polsku (Roundcube: language pl_PL)"
    else
      log_fail "Webmail: brak language pl_PL w $RC_KONF — koniec $RC_LOG poniżej"
      tail -n 15 "$RC_LOG" 2>/dev/null | sed 's/^/    /'
    fi
    if [ "$rc_marka" = 1 ]; then
      if grep -q "Verris Poczta" "$RC_KONF" 2>/dev/null; then
        log_ok "Webmail w marce Verris Poczta (plugin verris_marka)"
      else
        log_warn "Webmail: marka Verris w custom/, ale nie w konfiguracji Roundcube — $RC_LOG"
      fi
    fi
  fi
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && command -v da >/dev/null 2>&1; then
    if [ ! -d /var/www/html/roundcube/direct_login ]; then
      { da build dovecot_conf && da build exim_conf && da build roundcube; } >>/var/log/verris-roundcube.log 2>&1 || true
    fi
    if [ -d /var/www/html/roundcube/direct_login ]; then
      log_ok "Webmail: Roundcube z logowaniem jednym kliknięciem (direct_login)"
    else
      log_fail "Webmail: brak Roundcube/direct_login po budowie — /var/log/verris-roundcube.log"
    fi
  fi
  # White-label: DirectAdmin nie mailuje klientów bezpośrednio. Test D3 na t1 (29.09): przy każdym
  # logowaniu z panelu klient dostawał angielski mail „Message System” z adresem :2222 węzła i IP
  # control-plane'u (tworzenie klucza logowania). Wiadomości zostają w DA, klientom pisze Verris.
  # Adres kont DA → lokalny alias bez doręczenia; poprzedni adres zostaje w user.conf (verris_email_klienta).
  DA_SINK_LOCAL="verris-da-powiadomienia"
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && [ -d /usr/local/directadmin/data/users ]; then
    DA_SINK="${DA_SINK_LOCAL}@$(hostname -f 2>/dev/null || hostname)"
    grep -q "^${DA_SINK_LOCAL}:" /etc/aliases 2>/dev/null || printf '%s: :blackhole:\n' "$DA_SINK_LOCAL" >> /etc/aliases
    newaliases >/dev/null 2>&1 || true
    zmienione=0
    for uc in /usr/local/directadmin/data/users/*/user.conf; do
      [ -f "$uc" ] || continue
      grep -q '^usertype=user$' "$uc" || continue
      # „Message System” wysyła kopię na adres z ticket.conf (ustawienia wiadomości użytkownika),
      # nie z user.conf — retest D3 29.09: po zmianie user.conf maile SSO dalej szły do klienta.
      tc="${uc%/user.conf}/ticket.conf"
      if [ -f "$tc" ] && grep -q '^email=' "$tc"; then
        grep -qx "email=${DA_SINK}" "$tc" || sed -i "s|^email=.*|email=${DA_SINK}|" "$tc"
      else
        printf 'email=%s\n' "$DA_SINK" >> "$tc"
        chown diradmin:diradmin "$tc" 2>/dev/null || true
      fi
      obecny="$(sed -n 's/^email=//p' "$uc" | head -n1)"
      [ "$obecny" = "$DA_SINK" ] && continue
      grep -q '^verris_email_klienta=' "$uc" || printf 'verris_email_klienta=%s\n' "$obecny" >> "$uc"
      if grep -q '^email=' "$uc"; then
        sed -i "s|^email=.*|email=${DA_SINK}|" "$uc"
      else
        printf 'email=%s\n' "$DA_SINK" >> "$uc"
      fi
      zmienione=$((zmienione + 1))
    done
    zle_tc="$(da_zle_ticket_conf /usr/local/directadmin/data/users "$DA_SINK")"
    if [ "$zle_tc" -gt 0 ]; then
      log_fail "Maile DA do klientów: ${zle_tc} kont ma w ticket.conf adres inny niż ${DA_SINK}"
    elif command -v exim >/dev/null 2>&1 && exim -bt "$DA_SINK" 2>/dev/null | grep -qi 'discarded'; then
      log_ok "Maile DA do klientów wyłączone: konta DA → ${DA_SINK} (zmieniono ${zmienione})"
    else
      log_fail "Maile DA do klientów: exim nie odrzuca ${DA_SINK} (sprawdź /etc/aliases i czy $(hostname -f) jest domeną lokalną)"
    fi
  fi
  # E-20 — dobowy limit wysyłki per konto (exim DirectAdmina czyta /etc/virtual/limit).
  # Ta sama liczba stoi w panelu klienta (libs/contracts: HOSTING_MAIL_DAILY_SEND_LIMIT);
  # zgodność pilnuje apps/api/src/test/limit-wysylki.spec.ts. Bez nadpisywania z env —
  # inna wartość na węźle niż w panelu to limit ukryty przed klientem.
  MAIL_DAILY_SEND_LIMIT=1000
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && [ -d /etc/virtual ]; then
    printf '%s\n' "$MAIL_DAILY_SEND_LIMIT" > /etc/virtual/limit \
      && log_ok "Limit wysyłki: ${MAIL_DAILY_SEND_LIMIT}/dobę na konto (/etc/virtual/limit)" \
      || log_warn "Nie udało się zapisać /etc/virtual/limit"
  fi
  # Po zmianach DA — odśwież (bez przerwy w usługach).
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && [ -x /usr/local/directadmin/directadmin ]; then
    systemctl restart directadmin 2>/dev/null || service directadmin restart 2>/dev/null || true
  fi

  # A3 — LiteSpeed Enterprise na DirectAdmin czyta konfigurację w stylu Apache wygenerowaną przez DA.
  # Katalog cache według oficjalnej dokumentacji LiteSpeed (docs.litespeedtech.com/lsws/cp/directadmin/configuration/):
  #   serwer: /etc/httpd/conf/extra/httpd-includes.conf → <IfModule Litespeed> CacheRoot /home/lscache </IfModule>
  #   vhost:  data/templates/custom/cust_httpd.CUSTOM.2.pre → CacheRoot lscache (względem katalogu konta)
  # potem custombuild rewrite_confs (restartuje serwer WWW). Poprzednia wersja sprawdzała
  # /usr/local/lsws/conf/httpd_config.conf — plik OpenLiteSpeed, którego LSWS Enterprise nie ma,
  # więc blok nigdy się nie wykonywał.
  if [ -x /usr/local/lsws/bin/lswsctrl ] && [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
    local INC="/etc/httpd/conf/extra/httpd-includes.conf"
    local VH="/usr/local/directadmin/data/templates/custom/cust_httpd.CUSTOM.2.pre"
    local zmiana=0
    if [ -f "$INC" ] && ! grep -q "verris-lscache" "$INC"; then
      printf '\n# verris-lscache (A3)\n<IfModule Litespeed>\n  CacheRoot /home/lscache\n</IfModule>\n' >> "$INC" && zmiana=1
    fi
    mkdir -p "$(dirname "$VH")"
    if ! grep -q "verris-lscache" "$VH" 2>/dev/null; then
      printf '# verris-lscache (A3)\n<IfModule Litespeed>\n  CacheRoot lscache\n</IfModule>\n' >> "$VH" && zmiana=1
    fi
    if [ "$zmiana" = "1" ] && [ -n "${BUILD:-}" ]; then
      (cd "$CB" && "$BUILD" rewrite_confs) >/dev/null 2>&1 \
        && log_ok "LiteSpeed: CacheRoot serwera i vhostów ustawiony (rewrite_confs)" \
        || log_warn "LiteSpeed: rewrite_confs zwrócił błąd — sprawdź custombuild"
    else
      log_ok "LiteSpeed: CacheRoot już ustawiony"
    fi
  fi
  # A3 — wtyczka LSCache w nowych instalacjach WP (flaga dla instalatora A4).
  cb_set_option redis yes  # A6 — Redis dostępny serwerowo (per-konto włącza pakiet planu)

  # B2 — ModSecurity WAF (OWASP CRS) na LiteSpeed. CustomBuild ma moduł
  # `modsecurity` + zestaw reguł `modsecurity_ruleset` (comodo/owasp).
  if cb_option_supported modsecurity; then
    cb_set_option modsecurity yes
    cb_set_option modsecurity_ruleset "${VERRIS_MODSECURITY_RULESET:?$BRAK_MANIFESTU}"
    # Oficjalna dokumentacja DA (ModSecurity): da build set modsecurity yes; da build set modsecurity_ruleset owasp;
    # da build modsecurity. Samo „set” niczego nie instaluje — wcześniej log mówił „włączony” bez budowy,
    # a klucz modsecurity_enabled w directadmin.conf nie istnieje w dokumentacji. Znacznik: budujemy raz.
    local znacznik="$CB/.verris-modsecurity-$VERRIS_MODSECURITY_RULESET"
    if [ -f "$znacznik" ]; then
      log_ok "ModSecurity WAF ($VERRIS_MODSECURITY_RULESET) — zbudowany wcześniej"
    elif [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
      log_info "dry-run: da build modsecurity"
    elif (cd "$CB" && "$BUILD" modsecurity) >/tmp/verris-modsecurity.log 2>&1; then
      touch "$znacznik"
      log_ok "ModSecurity WAF ($VERRIS_MODSECURITY_RULESET) zbudowany (build modsecurity)"
    else
      log_fail "ModSecurity: build modsecurity nie powiódł się — /tmp/verris-modsecurity.log"
    fi
  else
    log_skip "ModSecurity — opcja niedostępna w tym CustomBuild (sprawdź webserver/litespeed)"
  fi

  # SEC — wymuszenie FTP przez TLS (FTPS). DirectAdmin CustomBuild:
  # `ftpd_tls=yes` (pure-ftpd/proftpd budowane z TLS) + dla pure-ftpd opcja
  # TLS=2 (tylko szyfrowane sesje) tam, gdzie config jest dostępny.
  if cb_option_supported ftpd_tls; then
    cb_set_option ftpd_tls yes
    log_ok "FTP TLS (FTPS) wymuszony w CustomBuild"
  else
    log_skip "ftpd_tls — opcja niedostępna w tym CustomBuild"
  fi
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
    local pf_conf="/etc/pure-ftpd.conf"
    [ -f "$pf_conf" ] || pf_conf="/usr/local/etc/pure-ftpd.conf"
    if [ -f "$pf_conf" ]; then
      if grep -qiE '^[#[:space:]]*TLS' "$pf_conf"; then
        sed -i 's/^[#[:space:]]*TLS.*/TLS 2/I' "$pf_conf"
      else
        echo "TLS 2" >> "$pf_conf"
      fi
      systemctl restart pure-ftpd 2>/dev/null || service pure-ftpd restart 2>/dev/null || true
      log_ok "pure-ftpd: wymuszone tylko sesje TLS (TLS 2)"
    fi
  fi

  # A2 — PHP Selector (CloudLinux): lvemanager + pakiety alt-php. Wersje = VERRIS_PHP_VERSIONS
  # z manifestu floty (stos-wezla.ts phpAlt — z niego też domyślna lista php.availableVersions). Na CloudLinux 10 alt-php
  # są w repo php-els (KB CloudLinux „Install alt-php on CloudLinux 10”: els-php-release, potem
  # groupinstall alt-phpXX). Bez tego selektor nie zna żadnej wersji i każda zmiana PHP z panelu
  # kończy się błędem „wersja nie jest zainstalowana” (test D3 na t1, 28.09).
  if command -v cloudlinux-config >/dev/null 2>&1 || [ -d /opt/alt ]; then
    if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
      dnf install -y lvemanager alt-php-config >/dev/null 2>&1 || log_warn "lvemanager/alt-php-config — instalacja nie powiodła się"
      rpm -q els-php-release >/dev/null 2>&1 || dnf install -y els-php-release >/dev/null 2>&1 || true
      local php_brak=""
      for v in ${VERRIS_PHP_VERSIONS:?$BRAK_MANIFESTU}; do
        selectorctl --list --interpreter=php 2>/dev/null | awk '{print $1}' | grep -qx "$v" && continue
        dnf groupinstall -y "alt-php${v/./}" >>/var/log/verris-alt-php.log 2>&1 || true
        selectorctl --list --interpreter=php 2>/dev/null | awk '{print $1}' | grep -qx "$v" || php_brak="$php_brak $v"
      done
      cldiag --check-php-selector >/dev/null 2>&1 || true
      # OPcache domyślnie dla każdej wersji (selectorctl bez --user = ustawienie wersji; konta z własnym
      # wyborem rozszerzeń zachowują swój). Retest D3 29.09: strony działały bez OPcache
      # (opcache.enable = brak w odczycie PHP). --list-extensions: „+” włączone, „~” wbudowane.
      local opc_brak=""
      for v in ${VERRIS_PHP_VERSIONS:?$BRAK_MANIFESTU}; do
        selectorctl --list-extensions --version="$v" 2>/dev/null | grep -qE '^[+~] opcache$' && continue
        selectorctl --enable-extensions=opcache --version="$v" >/dev/null 2>&1 || true
        selectorctl --list-extensions --version="$v" 2>/dev/null | grep -qE '^[+~] opcache$' || opc_brak="$opc_brak $v"
      done
      if [ -z "$opc_brak" ]; then
        log_ok "PHP Selector: OPcache domyślnie włączony ($VERRIS_PHP_VERSIONS)"
      else
        log_warn "PHP Selector: OPcache nie jest domyślny dla:$opc_brak (selectorctl --enable-extensions=opcache --version=<wersja>)"
      fi
      if [ -z "$php_brak" ]; then
        log_ok "PHP Selector (CloudLinux): wersje $VERRIS_PHP_VERSIONS dostępne"
      else
        log_fail "PHP Selector: brak wersji$php_brak po groupinstall — /var/log/verris-alt-php.log"
      fi
    fi
  else
    log_skip "PHP Selector — brak CloudLinux lvemanager (węzeł bez CL?)"
  fi

  # K-14 — slow query log MariaDB (dokumentacja MariaDB: Slow Query Log Overview): włączony na stałe
  # w [mysqld], próg 2 s, zapis do pliku; teraz od razu przez SET GLOBAL (bez restartu bazy).
  # Panel pokazuje klientowi tylko zapytania jego baz, znormalizowane (node-slow-sql.sh).
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && command -v mysql >/dev/null 2>&1; then
    local mycnf=/etc/my.cnf
    if [ -f "$mycnf" ] && ! grep -q '^# verris-slow-log' "$mycnf"; then
      printf '\n# verris-slow-log (K-14)\n[mysqld]\nslow_query_log=1\nlong_query_time=2\nlog_output=FILE\n' >> "$mycnf"
    fi
    local myopts=()
    mysql -Nse 'SELECT 1' >/dev/null 2>&1 || myopts=(--defaults-extra-file=/usr/local/directadmin/conf/my.cnf)
    if mysql "${myopts[@]}" -e "SET GLOBAL long_query_time=2; SET GLOBAL log_output='FILE'; SET GLOBAL slow_query_log=1" 2>/dev/null; then
      log_ok "MariaDB: slow query log włączony (próg 2 s)"
    else
      log_warn "MariaDB: nie udało się włączyć slow query log (zadziała po restarcie bazy z /etc/my.cnf)"
    fi
    cat > /etc/logrotate.d/verris-mariadb-slow <<'ROT'
/var/lib/mysql/*-slow.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    copytruncate
}
ROT
  fi

  # D-16 — memcached dla kont (instancje per konto z node-memcached.sh, tylko gniazda UNIX).
  # Domyślna usługa pakietu słucha na 11211 — wyłączona, żeby nie było wspólnej instancji po TCP.
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
    if command -v memcached >/dev/null 2>&1 || dnf install -y memcached >/dev/null 2>&1; then
      systemctl disable --now memcached.service >/dev/null 2>&1 || true
      log_ok "memcached zainstalowany (instancje per konto, bez usługi TCP)"
    else
      log_warn "memcached — instalacja nie powiodła się; Memcached w panelu zgłosi brak"
    fi
  fi

  # D-14 — PostgreSQL dla kont (bazy zakłada node-pgsql.sh). Serwer z AppStream systemu (moduł postgresql:16,
  # bez obcych repozytoriów) wg postgresql.org → Download → Red Hat family: postgresql-setup --initdb,
  # systemctl enable postgresql. Tylko localhost, hasła scram-sha-256; superużytkownik postgres tylko przez peer.
  # PHP: rozszerzenia pgsql / pdo_pgsql klient włącza w PHP Selectorze (alt-php); natywne PHP z CustomBuild
  # wg docs.directadmin.com → PHP extensions: da build set php_pgsql yes && da build php_pgsql.
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
    if ! command -v postgresql-setup >/dev/null 2>&1; then
      dnf module reset -y postgresql >/dev/null 2>&1 || true
      dnf module enable -y postgresql:16 >/dev/null 2>&1 || true
      dnf install -y postgresql-server >/var/log/verris-pgsql.log 2>&1 || log_warn "PostgreSQL — instalacja nie powiodła się (log: /var/log/verris-pgsql.log)"
    fi
    if command -v postgresql-setup >/dev/null 2>&1; then
      local pgdata=/var/lib/pgsql/data
      [ -f "$pgdata/PG_VERSION" ] || postgresql-setup --initdb >>/var/log/verris-pgsql.log 2>&1 || log_warn "PostgreSQL — initdb nie powiódł się"
      if [ -f "$pgdata/PG_VERSION" ]; then
        if ! grep -q '^# verris (D-14)' "$pgdata/postgresql.conf"; then
          printf "\n# verris (D-14)\nlisten_addresses = 'localhost'\npassword_encryption = scram-sha-256\n" >> "$pgdata/postgresql.conf"
        fi
        cat > "$pgdata/pg_hba.conf" <<'HBA'
# Zarządzane przez Verris (D-14) — zmiany ręczne zostaną nadpisane.
local   all   postgres                  peer
local   all   all                       scram-sha-256
host    all   all       127.0.0.1/32    scram-sha-256
host    all   all       ::1/128         scram-sha-256
HBA
        chown postgres:postgres "$pgdata/pg_hba.conf"; chmod 600 "$pgdata/pg_hba.conf"
        systemctl enable postgresql >/dev/null 2>&1 || true
        systemctl restart postgresql >>/var/log/verris-pgsql.log 2>&1 || log_warn "PostgreSQL — restart nie powiódł się"
        runuser -u postgres -- psql -X -q -d postgres -c 'REVOKE CONNECT ON DATABASE postgres FROM PUBLIC' \
          -c 'REVOKE CONNECT ON DATABASE template1 FROM PUBLIC' >/dev/null 2>&1 || true
        log_ok "PostgreSQL działa (localhost, scram-sha-256)"
      fi
    fi
    if command -v da >/dev/null 2>&1; then
      { da build set php_pgsql yes && da build php_pgsql; } >>/var/log/verris-pgsql.log 2>&1 || log_warn "CustomBuild php_pgsql — nie powiodło się (alt-php w PHP Selectorze działa niezależnie)"
    fi
  fi

  # E-23 — kalendarz i kontakty (CalDAV/CardDAV): Radicale 3.8.1 (radicale.org, DOCUMENTATION.md) w venv,
  # logowanie danymi skrzynki przez gniazdo auth Dovecota ([auth] type = dovecot — Dovecot dostaje IP klienta,
  # więc blokady po nieudanych logowaniach działają jak dla IMAP), [rights] owner_only, TLS na porcie 5232
  # z certyfikatem hosta DirectAdmina (kopia w /run przy starcie — oryginał klucza nie zmienia uprawnień). Nowa skrzynka dostaje
  # od razu „Kalendarz” i „Kontakty” (predefined_collections). Bez interfejsu WWW ([web] type = none).
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
    local dav_ver=3.8.1 dav_venv=/opt/verris-radicale dav_sock=/var/run/dovecot/auth-verris-radicale dav_grupa=""
    id radicale >/dev/null 2>&1 || useradd --system -M -d /var/lib/radicale -s /sbin/nologin radicale
    install -d -m 750 -o radicale -g radicale /var/lib/radicale /var/lib/radicale/collections
    if [ ! -x "$dav_venv/bin/radicale" ] || ! "$dav_venv/bin/pip" show radicale 2>/dev/null | grep -q "^Version: $dav_ver$"; then
      { python3 -m venv "$dav_venv" && "$dav_venv/bin/pip" install -q "radicale==$dav_ver"; } >/var/log/verris-dav.log 2>&1 \
        || log_warn "Radicale — instalacja nie powiodła się (log: /var/log/verris-dav.log)"
    fi
    # Osobne gniazdo auth Dovecota tylko dla Radicale (grupa radicale, 0660) zamiast poluzowania auth-client —
    # test D3 29.09: auth-client bez dostępu dla grupy. Dovecot 2.4: unix_listener z `type = auth` obsługuje
    # tylko uwierzytelnianie SASL (doc.dovecot.org → Services). Plik w /etc/dovecot/conf.d jak w dokumentacji
    # DirectAdmin „Customizing Dovecot”; zła składnia → plik usunięty, Dovecot bez zmian.
    local dav_conf=/etc/dovecot/conf.d/90-verris-radicale.conf
    if command -v doveconf >/dev/null 2>&1 && ! doveconf -n 2>/dev/null | grep -q 'auth-verris-radicale'; then
      cat > "$dav_conf" <<'DCONF'
# Zarządzane przez Verris (E-23) — gniazdo logowania dla kalendarza i kontaktów (Radicale).
service auth {
  unix_listener auth-verris-radicale {
    mode = 0660
    user = root
    group = radicale
    type = auth
  }
}
DCONF
      if doveconf -n >/dev/null 2>>/var/log/verris-dav.log && doveconf -n 2>/dev/null | grep -q 'auth-verris-radicale'; then
        systemctl reload dovecot 2>>/var/log/verris-dav.log || doveadm reload 2>>/var/log/verris-dav.log || true
        for _ in 1 2 3 4 5 6 7 8 9 10; do [ -S "$dav_sock" ] && break; sleep 1; done
      else
        rm -f "$dav_conf"
        log_warn "Radicale: Dovecot nie przyjął gniazda auth-verris-radicale (log: /var/log/verris-dav.log) — konfiguracja Dovecota bez zmian"
      fi
    fi
    if [ -S "$dav_sock" ]; then
      dav_grupa="$(stat -c %G "$dav_sock")"
      [ $(( 0$(stat -c %a "$dav_sock") & 060 )) -eq 48 ] || { log_warn "Radicale: gniazdo $dav_sock bez dostępu dla grupy — logowanie do kalendarza nie zadziała"; dav_grupa=""; }
    else
      log_warn "Radicale: brak gniazda $dav_sock (Dovecot)"
    fi
    install -d -m 750 -o root -g radicale /etc/verris-radicale
    cat > /etc/verris-radicale/config <<'RCONF'
# Zarządzane przez Verris (E-23) — zmiany ręczne zostaną nadpisane.
[server]
hosts = 0.0.0.0:5232, [::]:5232
ssl = True
max_connections = 50
max_content_length = 20000000
timeout = 30
[auth]
type = dovecot
dovecot_socket = /var/run/dovecot/auth-verris-radicale
lc_username = True
delay = 1
cache_logins = True
[rights]
type = owner_only
[storage]
filesystem_folder = /var/lib/radicale/collections
predefined_collections = {"kalendarz": {"D:displayname": "Kalendarz", "tag": "VCALENDAR", "C:supported-calendar-component-set": "VEVENT,VTODO"}, "kontakty": {"D:displayname": "Kontakty", "tag": "VADDRESSBOOK"}}
[web]
type = none
RCONF
    chown root:radicale /etc/verris-radicale/config; chmod 640 /etc/verris-radicale/config
    cat > /etc/systemd/system/verris-radicale.service <<UNITF
[Unit]
Description=Verris — kalendarz i kontakty (CalDAV/CardDAV)
After=network.target dovecot.service

[Service]
User=radicale
Group=radicale
${dav_grupa:+SupplementaryGroups=$dav_grupa}
# Certyfikat hosta kopiowany przy starcie (ExecStartPre z „+” działa jako root poza piaskownicą) do
# RuntimeDirectory, czytelny tylko dla grupy radicale. Wcześniej LoadCredential= — na t1 (AlmaLinux 10,
# systemd 257) proces nie widział pliku w \$CREDENTIALS_DIRECTORY i usługa padała (03.10).
RuntimeDirectory=verris-radicale
RuntimeDirectoryMode=0750
ExecStartPre=+/usr/bin/install -m 0640 -o root -g radicale /usr/local/directadmin/conf/cacert.pem /run/verris-radicale/cert.pem
ExecStartPre=+/usr/bin/install -m 0640 -o root -g radicale /usr/local/directadmin/conf/cakey.pem /run/verris-radicale/key.pem
ExecStart=$dav_venv/bin/radicale --config /etc/verris-radicale/config --server-certificate=/run/verris-radicale/cert.pem --server-key=/run/verris-radicale/key.pem
UMask=0027
Restart=on-failure
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/radicale

[Install]
WantedBy=multi-user.target
UNITF
    systemctl daemon-reload
    systemctl enable verris-radicale >/dev/null 2>&1 || true
    # is-active po chwili: restart usługi Type=simple „udaje się”, nawet gdy proces pada sekundę później
    # (t1 03.10: brak certyfikatu → failed, a profil raportował [OK]).
    if systemctl restart verris-radicale 2>>/var/log/verris-dav.log && sleep 3 && systemctl is-active --quiet verris-radicale; then
      log_ok "Kalendarz i kontakty (Radicale $dav_ver) na porcie 5232"
    else
      log_warn "Radicale — start nie powiódł się (journalctl -u verris-radicale)"
    fi
    # Certyfikat hosta odnawia control-plane w poniedziałki o 04:00 — Radicale czyta go przy starcie.
    cat > /usr/local/sbin/verris-dav-backup <<'DAVB'
#!/usr/bin/env bash
# Verris (E-23): kopia kalendarzy i kontaktów do katalogu domowego właściciela konta (trafia do kopii
# DirectAdmina) + sprzątanie po usuniętych skrzynkach (odłożone na 30 dni, żeby nowa skrzynka o tym
# samym adresie nie dostała cudzego kalendarza).
set -uo pipefail
ROOT=/var/lib/radicale/collections/collection-root
KOSZ=/var/lib/radicale/usuniete
[ -d "$ROOT" ] || exit 0
[ -s /etc/virtual/domainowners ] || exit 0
install -d -m 700 -o radicale -g radicale "$KOSZ"
for d in "$ROOT"/*/; do
  u="$(basename "$d")"
  [[ "$u" =~ ^[a-z0-9._%+-]+(@[a-z0-9.-]+)?$ ]] || continue
  owner=""; jest=0
  if [[ "$u" == *@* ]]; then
    dom="${u#*@}"; lokal="${u%@*}"
    owner="$(awk -F': *' -v d="$dom" '$1==d{print $2; exit}' /etc/virtual/domainowners)"
    if [ -n "$owner" ]; then
      grep -q "^${lokal}:" "/etc/virtual/$dom/passwd" 2>/dev/null && jest=1
      [ "$lokal" = "$owner" ] && jest=1
    fi
  else
    owner="$u"
    [ -d "/usr/local/directadmin/data/users/$u" ] && jest=1
  fi
  if [ "$jest" != 1 ]; then
    mv -- "${d%/}" "$KOSZ/$u.$(date +%Y%m%d)" 2>/dev/null || true
    continue
  fi
  tar -C "$ROOT" --exclude=.Radicale.cache -czf - "$u" |
    runuser -u "$owner" -- sh -c 'umask 077; mkdir -p "$HOME/.verris-dav" && cat > "$HOME/.verris-dav/$1.tar.gz.tmp" && mv -f "$HOME/.verris-dav/$1.tar.gz.tmp" "$HOME/.verris-dav/$1.tar.gz"' _ "$u" ||
    echo "verris-dav-backup: kopia $u nie powiodła się" >&2
done
find "$KOSZ" -mindepth 1 -maxdepth 1 -mtime +30 -exec rm -rf -- {} +
DAVB
    chmod 700 /usr/local/sbin/verris-dav-backup
    printf '40 3 * * * root /usr/local/sbin/verris-dav-backup\n30 4 * * 1 root systemctl try-restart verris-radicale\n' > /etc/cron.d/verris-dav
    chmod 644 /etc/cron.d/verris-dav
  fi

  # J-06 — optymalizacja obrazów w panelu (node-image-optimize.sh): jpegoptim i optipng z EPEL.
  if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
    if ! command -v jpegoptim >/dev/null 2>&1 || ! command -v optipng >/dev/null 2>&1; then
      { dnf install -y epel-release && dnf install -y jpegoptim optipng; } >/var/log/verris-obrazy.log 2>&1 \
        || log_warn "jpegoptim/optipng — instalacja nie powiodła się; optymalizacja obrazów w panelu zgłosi brak"
    fi
    command -v jpegoptim >/dev/null 2>&1 && command -v optipng >/dev/null 2>&1 && log_ok "Optymalizacja obrazów (jpegoptim, optipng)"
  fi

  # B-08/B-09 — aplikacje Node.js i Python (CloudLinux Selector, node-app-selector.sh). Pakiety wg
  # docs.cloudlinux.com → CloudLinux OS components → Node.js / Python Selector → Installation (DirectAdmin):
  # alt-nodejs / alt-python + lvemanager lve-utils alt-python-virtualenv alt-mod-passenger. Oba selektory są
  # domyślnie wyłączone — włącza je `cloudlinux-selector set --selector-status enabled`. Best-effort.
  if command -v cloudlinux-selector >/dev/null 2>&1 || [ -d /opt/alt ]; then
    if [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
      dnf groupinstall -y alt-nodejs alt-python >/var/log/verris-app-selector.log 2>&1 || \
        log_warn "alt-nodejs/alt-python — instalacja nie powiodła się (log: /var/log/verris-app-selector.log)"
      dnf install -y lvemanager lve-utils alt-python-virtualenv alt-mod-passenger >>/var/log/verris-app-selector.log 2>&1 || \
        log_warn "lvemanager/alt-python-virtualenv/alt-mod-passenger — instalacja nie powiodła się"
      for interp in nodejs python; do
        if cloudlinux-selector set --json --interpreter "$interp" --selector-status enabled >>/var/log/verris-app-selector.log 2>&1; then
          log_ok "Selector $interp włączony"
        else
          log_warn "Selector $interp — nie udało się włączyć (log: /var/log/verris-app-selector.log)"
        fi
      done
      # LiteSpeed uruchamia aplikacje Python przez /opt/alt/pythonXY/bin/lswsgi — bez niego każda aplikacja
      # Python daje 503 („lswsgi_wrapper: … lswsgi: No such file or directory”, t1 01.10). Skrypt producenta:
      # docs.litespeedtech.com/products/lsws/cp/cpanel/cloudlinux/ (enable_ruby_python_selector.sh).
      LSSEL=/usr/local/lsws/admin/misc/enable_ruby_python_selector.sh
      if [ -x /usr/local/lsws/bin/lswsctrl ] && [ -f "$LSSEL" ]; then
        bash "$LSSEL" >>/var/log/verris-app-selector.log 2>&1 || log_warn "enable_ruby_python_selector.sh — błąd (log: /var/log/verris-app-selector.log)"
        # Skrypt LSWS ma listę wersji na sztywno (t1 03.10: kończy się na 313 — python314 bez lswsgi, 503).
        # Dla brakujących: ten sam pakiet CloudLinux, który instaluje skrypt (alt-pythonXY-wsgi-lsapi); gdy go nie ma,
        # wersję wyłączamy w selektorze (`cloudlinux-selector disable-version`, `--help` na t1), żeby klient nie
        # postawił aplikacji, która od razu daje 503. Po pojawieniu się pakietu: `enable-version` ręcznie.
        brak="" wylaczone="" plog="${VERRIS_APP_LOG:-/var/log/verris-app-selector.log}"
        for py in "${VERRIS_ALT_DIR:-/opt/alt}"/python3*/bin/python3; do
          [ -x "$py" ] || continue
          local pdir pnaz pwer
          pdir="$(dirname "$py")"; pnaz="$(basename "$(dirname "$pdir")")"
          [ -x "$pdir/lswsgi" ] && continue
          dnf install -y "alt-${pnaz}-wsgi-lsapi" >>"$plog" 2>&1 || true
          [ -x "$pdir/lswsgi" ] && continue
          pwer="${pnaz#python}"; pwer="${pwer:0:1}.${pwer:1}"   # python314 → 3.14 (nazwy katalogów alt-python)
          if cloudlinux-selector disable-version --json --interpreter python --version "$pwer" >>"$plog" 2>&1; then
            wylaczone="$wylaczone $pwer"
          else
            brak="$brak $pnaz"
          fi
        done
        if [ -n "$brak" ]; then
          log_warn "brak lswsgi dla:$brak — aplikacje Python na tych wersjach dadzą 503 (nie udało się też wyłączyć ich w selektorze)"
        elif [ -n "$wylaczone" ]; then
          log_ok "Python przez LiteSpeed (lswsgi); bez lswsgi wyłączone w selektorze:$wylaczone"
        else
          log_ok "Python przez LiteSpeed (lswsgi)"
        fi
      fi
    fi
  else
    log_skip "Aplikacje Node.js/Python — brak CloudLinux Selectora (węzeł bez CL?)"
  fi

  # G-11 — ImunifyAV: darmowy skaner złośliwego oprogramowania (skan w tle + na żądanie z panelu,
  # node-malware-scan.sh). Czyszczenie to płatne ImunifyAV+/Imunify360 — decyzja 2026-09-24:
  # na start darmowy. Instalator producenta (CloudLinux), best-effort.
  if command -v imunify-antivirus >/dev/null 2>&1; then
    log_ok "ImunifyAV obecny"
  elif [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ]; then
    if curl -fsSL --retry 3 -o /root/imav-deploy.sh https://repo.imunify360.cloudlinux.com/defence360/imav-deploy.sh \
      && bash /root/imav-deploy.sh >/var/log/verris-imav-deploy.log 2>&1; then
      log_ok "ImunifyAV zainstalowany (log: /var/log/verris-imav-deploy.log)"
    else
      log_warn "ImunifyAV — instalacja nie powiodła się (log: /var/log/verris-imav-deploy.log); skaner w panelu pokaże „nie jest zainstalowany”"
    fi
  fi
}

# -----------------------------------------------------------------------------
# expose_php = Off — strony klientów nie ogłaszają wersji PHP w nagłówku X-Powered-By (retest D3
# 29.09: „X-Powered-By: PHP/8.1.34”). alt-php: /etc/cl.selector/global_php.ini, sekcja
# [Global PHP Settings] + selectorctl --apply-global-php-ini (CloudLinux KB — przetrwa aktualizacje
# alt-php). PHP z CustomBuild DA: plik w php.conf.d (katalog skanowany przez PHP DA), tylko gdy istnieje.
# -----------------------------------------------------------------------------
configure_php_expose() {
  echo "--- PHP: expose_php = Off ---"
  local gi=/etc/cl.selector/global_php.ini d zmiana=0
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: expose_php = Off w $gi i /usr/local/php*/lib/php.conf.d/90-verris.ini"
    return 0
  fi
  if [ -d /etc/cl.selector ]; then
    touch "$gi"
    grep -q '^\[Global PHP Settings\]' "$gi" || printf '[Global PHP Settings]\n' >> "$gi"
    if grep -qE '^expose_php *=' "$gi"; then
      grep -qE '^expose_php *= *Off' "$gi" || { sed -i -E 's/^expose_php *=.*/expose_php = Off/' "$gi"; zmiana=1; }
    else
      sed -i '/^\[Global PHP Settings\]/a expose_php = Off' "$gi"; zmiana=1
    fi
    if [ "$zmiana" = "1" ]; then
      selectorctl --apply-global-php-ini >/dev/null 2>&1 || log_warn "selectorctl --apply-global-php-ini zwrócił błąd"
    fi
  fi
  for d in /usr/local/php*/lib/php.conf.d; do
    [ -d "$d" ] || continue
    if ! grep -qx 'expose_php = Off' "$d/90-verris.ini" 2>/dev/null; then
      printf '; Verris: bez wersji PHP w nagłówkach stron klientów\nexpose_php = Off\n' > "$d/90-verris.ini"; zmiana=1
    fi
  done
  if [ "$zmiana" = "1" ] && [ -x /usr/local/lsws/bin/lswsctrl ]; then
    /usr/local/lsws/bin/lswsctrl restart >/dev/null 2>&1 || log_warn "LiteSpeed restart po expose_php zwrócił błąd"
  fi
  local zle=""
  for d in /opt/alt/php[0-9]*/usr/bin/php /usr/local/php[0-9]*/bin/php; do
    [ -x "$d" ] || continue
    "$d" -r 'exit(ini_get("expose_php") ? 1 : 0);' 2>/dev/null || zle="$zle ${d%/bin/php}"
  done
  if [ -n "$zle" ]; then log_fail "expose_php nadal włączone:$zle"; else log_ok "expose_php = Off (alt-php i PHP DA)"; fi
}

# -----------------------------------------------------------------------------
# Panel DA (:2222) tylko z control-plane (decyzja 2026-09-29). Klient ma wszystko w panelu Verris,
# control-plane rozmawia z DA po API na 2222. Zapora z DA to CSF (instalator DA stawia go domyślnie,
# DA_SKIP_CSF go pomija — docs.directadmin.com → Predefined installation options); bez CSF — firewalld
# (security-hardening-baseline.sh). Pusty VERRIS_CONTROL_PLANE_IPS = nic nie zmieniamy: nie zgadujemy
# adresu control-plane, bo pomyłka odcina panel Verris od węzła.
# -----------------------------------------------------------------------------
DA_PANEL_PORT=2222
CSF_DIR="${CSF_DIR:-/etc/csf}"
CSF_LOG="${CSF_LOG:-/var/log/verris-csf.log}"

adresy_da_panelu() {
  printf '%s\n' "$VERRIS_CONTROL_PLANE_IPS" "$VERRIS_DA_ADMIN_ALLOW" | tr ', ' '\n\n' | sed '/^$/d' | sort -u
}

csf_port_panelu_otwarty() {
  grep -qE "^TCP6?_IN *= *\"([^\"]*,)?${DA_PANEL_PORT}(,[^\"]*)?\"" "$CSF_DIR/csf.conf"
}

# CSF (csf.allow: „tcp/udp|in/out|s/d=port|s/d=ip”, przeładowanie csf -r). Najpierw reguły allow, potem
# usunięcie portu z TCP_IN/TCP6_IN, jedno przeładowanie — control-plane nie traci połączenia.
da_panel_csf() {
  local adresy="$1" lista a nowy zmiana=0
  lista="$(printf '%s\n' "$adresy" | paste -sd, -)"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: CSF — tcp|in|d=${DA_PANEL_PORT}|s=<${lista}> w csf.allow, ${DA_PANEL_PORT} z TCP_IN/TCP6_IN, csf -r"
    csf_port_panelu_otwarty && log_warn "CSF: :${DA_PANEL_PORT} otwarty dla internetu (profil go ograniczy)" || log_ok "CSF: :${DA_PANEL_PORT} poza TCP_IN"
    return 0
  fi
  nowy="$(mktemp)"
  {
    sed '/^# verris-da-panel BEGIN/,/^# verris-da-panel END/d' "$CSF_DIR/csf.allow" 2>/dev/null || true
    echo "# verris-da-panel BEGIN — panel DA tylko z control-plane (zarządza profil Verris, nie edytuj)"
    for a in $adresy; do printf 'tcp|in|d=%s|s=%s\n' "$DA_PANEL_PORT" "$a"; done
    echo "# verris-da-panel END"
  } > "$nowy"
  if ! cmp -s "$nowy" "$CSF_DIR/csf.allow"; then
    cat "$nowy" > "$CSF_DIR/csf.allow" && zmiana=1
  fi
  rm -f "$nowy"
  if csf_port_panelu_otwarty; then
    sed -i -E "/^TCP6?_IN *=/{s/\"${DA_PANEL_PORT},/\"/;s/,${DA_PANEL_PORT}(,|\")/\1/;s/\"${DA_PANEL_PORT}\"/\"\"/}" "$CSF_DIR/csf.conf"
    zmiana=1
  fi
  if [ "$zmiana" = "1" ] && ! csf -r >"$CSF_LOG" 2>&1; then
    log_fail "CSF: csf -r nie powiódł się (log: $CSF_LOG)"
  fi
  if csf_port_panelu_otwarty; then
    log_fail "CSF: ${DA_PANEL_PORT} nadal w TCP_IN/TCP6_IN — panel DA otwarty dla internetu"
  else
    log_ok "CSF: panel DA :${DA_PANEL_PORT} tylko z: ${lista}"
  fi
}

# firewalld (firewalld.richlanguage): reguły z ujemnym priorytetem idą przed zwykłymi portami, więc
# „accept z control-plane” (-110) i „reject :2222” (-100) działają nawet, gdy hardening znów doda port.
da_panel_firewalld() {
  local adresy="$1" lista strefa a r nowe
  lista="$(printf '%s\n' "$adresy" | paste -sd, -)"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: firewalld — accept :${DA_PANEL_PORT} z <${lista}> (priority -110), reject :${DA_PANEL_PORT} (priority -100)"
    return 0
  fi
  strefa="$(firewall-cmd --get-default-zone)"
  nowe="$(for a in $adresy; do
    case "$a" in *:*) r=ipv6 ;; *) r=ipv4 ;; esac
    echo "rule priority=\"-110\" family=\"$r\" source address=\"$a\" port port=\"${DA_PANEL_PORT}\" protocol=\"tcp\" accept"
  done; echo "rule priority=\"-100\" port port=\"${DA_PANEL_PORT}\" protocol=\"tcp\" reject")"
  # Nasze stare reguły (te priorytety + port panelu), których nie ma w nowej liście — usuń.
  firewall-cmd --permanent --zone="$strefa" --list-rich-rules | grep -E "priority=\"-1[01]0\".*port=\"${DA_PANEL_PORT}\"" \
    | grep -vxF -f <(printf '%s\n' "$nowe") | while IFS= read -r r; do
      firewall-cmd --permanent --zone="$strefa" --remove-rich-rule="$r" >/dev/null
    done || true
  while IFS= read -r r; do
    firewall-cmd --permanent --zone="$strefa" --add-rich-rule="$r" >/dev/null 2>&1 || true
  done <<<"$nowe"
  firewall-cmd --permanent --zone="$strefa" --remove-port="${DA_PANEL_PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null || log_fail "firewalld: reload nie powiódł się"
  if firewall-cmd --zone="$strefa" --list-rich-rules | grep -qxF "rule priority=\"-100\" port port=\"${DA_PANEL_PORT}\" protocol=\"tcp\" reject"; then
    log_ok "firewalld: panel DA :${DA_PANEL_PORT} tylko z: ${lista}"
  else
    log_fail "firewalld: brak reguły reject dla :${DA_PANEL_PORT} — panel DA otwarty dla internetu"
  fi
}

configure_da_panel_firewall() {
  echo "--- Panel DA (:${DA_PANEL_PORT}) tylko z control-plane ---"
  if [ -z "$(printf '%s' "$VERRIS_CONTROL_PLANE_IPS" | tr -d ', ')" ]; then
    log_warn "VERRIS_CONTROL_PLANE_IPS pusty — zapory nie zmieniam, :${DA_PANEL_PORT} bez ograniczenia (ustaw VERRIS_CONTROL_PLANE_IPS w env API)"
    return 0
  fi
  local adresy
  adresy="$(adresy_da_panelu)"
  if printf '%s\n' "$adresy" | grep -qvxE '[0-9A-Fa-f:.]+(/[0-9]{1,3})?'; then
    log_fail "Nieprawidłowy adres w VERRIS_CONTROL_PLANE_IPS/VERRIS_DA_ADMIN_ALLOW — zapory nie zmieniam"
    return 0
  fi
  if command -v csf >/dev/null 2>&1 && [ -f "$CSF_DIR/csf.conf" ]; then
    da_panel_csf "$adresy"
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    da_panel_firewalld "$adresy"
  else
    log_warn "Brak CSF i aktywnego firewalld — :${DA_PANEL_PORT} bez ograniczenia"
  fi
}

# -----------------------------------------------------------------------------
# HTTP/3 (J-04). LiteSpeed Enterprise w trybie panelu ma QUIC domyślnie włączony dla vhostów HTTPS —
# wystarczy otworzyć UDP 443 (docs.litespeedtech.com → QUIC and HTTP/3 Support; CSF: 443 w UDP_IN).
# Retest D3 29.09: firewalld przepuszczał tylko 53/udp, strony szły po HTTP/2.
# -----------------------------------------------------------------------------
# Cockpit (panel administracyjny systemu na :9090, logowanie kontami systemowymi) jest w domyślnej strefie
# firewalld AlmaLinux — test D3 na t1 (29.09): „services: cockpit …” w strefie public. Węzeł hostingu go
# nie używa (administracja przez SSH i control-plane), więc zamykamy port; pakietu nie ruszamy.
configure_firewall_cockpit() {
  [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] || return 0
  command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1 || return 0
  if firewall-cmd --permanent --query-service=cockpit >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-service=cockpit >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 || true
  fi
  if firewall-cmd --query-service=cockpit >/dev/null 2>&1; then
    log_warn "firewalld: Cockpit (9090) nadal otwarty w strefie domyślnej"
  else
    log_ok "firewalld: Cockpit (9090) zamknięty z zewnątrz"
  fi
}

configure_http3_firewall() {
  echo "--- HTTP/3: UDP 443 ---"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: UDP 443 w zaporze (firewalld --add-port=443/udp albo CSF UDP_IN/UDP6_IN)"
    return 0
  fi
  if command -v csf >/dev/null 2>&1 && [ -f "$CSF_DIR/csf.conf" ]; then
    local zm=0 k
    for k in UDP_IN UDP6_IN; do
      grep -qE "^${k} *= *\"([^\"]*,)?443(,[^\"]*)?\"" "$CSF_DIR/csf.conf" && continue
      sed -i -E "/^${k} *=/{s/\"\"/\"443\"/;t;s/\"$/,443\"/}" "$CSF_DIR/csf.conf" && zm=1
    done
    [ "$zm" = "1" ] && { csf -r >"$CSF_LOG" 2>&1 || log_warn "CSF: csf -r po dodaniu UDP 443 zwrócił błąd"; }
    grep -qE '^UDP_IN *= *"([^"]*,)?443(,[^"]*)?"' "$CSF_DIR/csf.conf" && log_ok "CSF: UDP 443 otwarty (HTTP/3)" || log_warn "CSF: UDP 443 nie jest w UDP_IN"
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    if ! firewall-cmd --permanent --query-port=443/udp >/dev/null 2>&1; then
      firewall-cmd --permanent --add-port=443/udp >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 || true
    fi
    firewall-cmd --query-port=443/udp >/dev/null 2>&1 && log_ok "firewalld: UDP 443 otwarty (HTTP/3)" || log_warn "firewalld: UDP 443 zamknięty — HTTP/3 niedostępny"
  else
    log_skip "Brak CSF i aktywnego firewalld — UDP 443 bez zmian"
  fi
}

# -----------------------------------------------------------------------------
# Strony błędów 403/404/500/503 dla wszystkich stron klientów (white label). Próba bety 06.10:
# d3.hvln.pl/nieistniejacy-plik pokazywał domyślną stronę serwera z nazwą jego producenta.
# - Ścieżka lokalna, nie URL: przy URL serwer odsyła przekierowanie zamiast kodu 404/500
#   (https://httpd.apache.org/docs/current/mod/core.html#errordocument; kontekst: server config … .htaccess).
# - Alias do wspólnego katalogu w /etc/httpd/conf/extra/httpd-includes.conf — plik „never modified by
#   CustomBuild or DirectAdmin” (https://docs.directadmin.com/webservices/apache/customizing.html);
#   na t1 06.10 Alias z tego pliku działa w vhostach klientów.
# - ErrorDocument NIE w httpd-includes.conf: LiteSpeed Enterprise (t1, 06.10) nie stosuje go w vhostach
#   DirectAdmina — poprzednia wersja pisała go tam i meldowała [OK], a klient dalej widział stronę LiteSpeed.
#   Teraz w globalnym tokenie vhostów data/templates/custom/cust_httpd.CUSTOM.4.pre: wg dokumentacji DA
#   tokeny CUSTOM* są w virtual_host2.conf, _secure, _sub i _secure_sub (HTTP/HTTPS, domeny i poddomeny),
#   „CUSTOM4 token is before the trailing </VirtualHost>”, a katalog templates/custom przetrwa aktualizacje
#   (ten sam dokument, „Custom HTTPD templates: read order”). Plik cust_httpd.CUSTOM.N.pre wczytuje się PRZED
#   własnym httpd domeny z panelu, więc tamten (później w vhoście) wygrywa. LiteSpeed czyta vhosty DA
#   z takich szablonów (https://docs.litespeedtech.com/lsws/cp/directadmin/configuration/ — cust_httpd.CUSTOM.2.pre).
# - Zastosowanie: ./build rewrite_confs („LiteSpeed Web Server will be restarted”, tamże) — tylko gdy zmienił się
#   szablon; sama zmiana Aliasu → restart LiteSpeed.
# - ErrorDocument klienta w .htaccess (także z panelu, node-htaccess.sh) ma pierwszeństwo przed vhostowym.
# - [OK] tylko po sprawdzeniu efektu: lokalne zapytanie o nieistniejącą ścieżkę na domenie hostowanej
#   musi dać 404 ze stroną Verris. Sam zapis plików niczego nie dowodzi.
# -----------------------------------------------------------------------------
verris_error_html() { # KOD TYTUŁ OPIS PRZYCISK HREF
  cat <<VERRIS_BLAD
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>$1 — $2</title>
<!-- verris-error-page -->
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;padding:2rem 1rem;background:#091410 radial-gradient(60rem 30rem at 50% -10%,rgba(52,229,160,.10),transparent 70%);color:#b4c2bb;font:16px/1.65 "Hanken Grotesk",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:34rem;padding:2.5rem 2.25rem;background:#0e1f17;border:1px solid rgba(255,255,255,.08);border-radius:18px}
.kod{display:inline-block;margin-bottom:1.25rem;padding:.3rem .8rem;border:1px solid rgba(52,229,160,.28);border-radius:100px;color:#34e5a0;font:500 .8rem/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em}
h1{margin-bottom:.75rem;color:#f4f4ee;font:800 clamp(1.6rem,4vw,2.1rem)/1.15 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:-.02em}
p{color:#b4c2bb}
.btn{display:inline-block;margin-top:1.75rem;padding:.75rem 1.4rem;border-radius:10px;background:#34e5a0;color:#0c1a14;font-weight:700;text-decoration:none}
.btn:hover{background:#5bffc0}
.btn:focus-visible{outline:2px solid #5bffc0;outline-offset:3px}
header{display:flex;align-items:center;gap:.5rem}
header svg{display:block}
footer{color:#93a29a;font-size:.8rem}
</style>
</head>
<body>
<header>
<svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true"><path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#f4f4ee" fill-rule="evenodd"/><path d="M44 55 L56 55 L50 69 Z" fill="none" stroke="#34e5a0" stroke-width="1.6"/></svg>
<svg height="22" viewBox="0 0 273.11 80.81" role="img" aria-label="Verris"><path fill="#f4f4ee" d="M20.02 79.49 0 26.76H19.14L30.71 66.85H29.44L40.97 26.76H60.11L40.14 79.49ZM86.03 80.81Q78.21 80.81 71.75 77.42Q65.28 74.02 61.42 67.8Q57.56 61.57 57.56 53.03Q57.56 44.58 61.32 38.4Q65.08 32.23 71.53 28.83Q77.97 25.44 86.03 25.44Q90.47 25.44 95.04 26.76Q99.6 28.08 103.46 31.45Q107.32 34.81 109.66 40.89Q112 46.97 112 56.45H68.55V47.46H96.72L95.45 49.85Q95.06 45.26 93.67 42.43Q92.28 39.6 90.2 38.31Q88.13 37.01 85.54 37.01Q81.97 37.01 79.7 39.11Q77.43 41.21 76.36 44.85Q75.29 48.49 75.29 53.12Q75.29 60.11 77.8 64.31Q80.31 68.51 85.88 68.51Q89.3 68.51 91.84 66.72Q94.38 64.94 95.84 61.08L111.08 64.7Q109.22 70.46 105.24 74.02Q101.26 77.59 96.18 79.2Q91.11 80.81 86.03 80.81ZM116.93 79.49V26.76H133.58V38.92L132.85 37.26Q135.43 31.2 139.9 28.32Q144.37 25.44 149.94 25.44Q151.5 25.44 153.16 25.68Q154.82 25.93 156.48 26.51L155.36 40.82Q151.99 39.89 148.96 39.89Q146.22 39.89 143.59 40.8Q140.95 41.7 138.8 43.82Q136.65 45.95 135.36 49.66Q134.07 53.37 134.07 58.98V79.49ZM158.72 79.49V26.76H175.37V38.92L174.63 37.26Q177.22 31.2 181.69 28.32Q186.16 25.44 191.72 25.44Q193.29 25.44 194.95 25.68Q196.61 25.93 198.27 26.51L197.14 40.82Q193.78 39.89 190.75 39.89Q188.01 39.89 185.38 40.8Q182.74 41.7 180.59 43.82Q178.44 45.95 177.15 49.66Q175.86 53.37 175.86 58.98V79.49ZM201.48 79.49V26.76H218.62V79.49ZM210.08 21.48Q205.1 21.48 202.21 18.6Q199.33 15.72 199.33 10.74Q199.33 5.76 202.21 2.88Q205.1 0 210.08 0Q215.06 0 217.94 2.88Q220.82 5.76 220.82 10.74Q220.82 15.72 217.94 18.6Q215.06 21.48 210.08 21.48ZM248.59 80.81Q242.54 80.81 237 79.15Q231.46 77.49 227.65 73.88Q223.84 70.26 222.86 64.4L238.05 61.38Q238.44 65.14 240.78 67.09Q243.12 69.04 247.86 69.04Q252.4 69.04 254.4 67.48Q256.41 65.92 256.41 63.87Q256.41 62.06 254.75 60.52Q253.09 58.98 248.64 58.35L244.44 57.76Q241.56 57.37 238.19 56.64Q234.82 55.91 231.8 54.37Q228.77 52.83 226.87 50.05Q224.96 47.27 224.96 42.77Q224.96 37.5 227.79 33.62Q230.62 29.74 235.8 27.59Q240.98 25.44 247.91 25.44Q253.92 25.44 259.07 27.15Q264.22 28.86 267.76 32.25Q271.3 35.64 272.32 40.72L257.33 43.8Q256.99 42.19 256.16 40.6Q255.33 39.01 253.55 37.96Q251.77 36.91 248.59 36.91Q245.18 36.91 243.37 38.21Q241.56 39.5 241.56 41.5Q241.56 43.21 242.88 44.26Q244.2 45.31 246.35 45.92Q248.5 46.53 250.99 46.92L256.06 47.66Q260.26 48.24 264.17 49.95Q268.08 51.66 270.59 54.88Q273.11 58.11 273.11 63.33Q273.11 69.09 269.88 73Q266.66 76.9 261.09 78.86Q255.53 80.81 248.59 80.81Z"/></svg>
</header>
<main>
<p class="kod">BŁĄD $1</p>
<h1>$2</h1>
<p>$3</p>
<a class="btn" href="$5">$4</a>
</main>
<footer>Strona działa na hostingu Verris.</footer>
</body>
</html>
VERRIS_BLAD
}

configure_error_pages() {
  echo "--- Strony błędów serwera WWW ---"
  local inc="${VERRIS_ERR_INC:-/etc/httpd/conf/extra/httpd-includes.conf}"
  local vh="${VERRIS_ERR_VHOST:-/usr/local/directadmin/data/templates/custom/cust_httpd.CUSTOM.4.pre}"
  local dir="${VERRIS_ERR_DIR:-/var/www/html/verris-bledy}"
  local ctl="${VERRIS_LSWSCTRL:-/usr/local/lsws/bin/lswsctrl}"
  local build="${VERRIS_CB_BUILD:-${BUILD:-/usr/local/directadmin/custombuild/build}}"
  local users="${VERRIS_DA_USERS:-/usr/local/directadmin/data/users}"
  local url=/verris-bledy kod tytul opis blok domena odp i
  local zm_inc=0 zm_vh=0
  if [ ! -f "$inc" ]; then
    log_skip "Brak $inc — pomijam strony błędów"
    return 0
  fi
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: $dir/{403,404,500,503}.html + Alias w $inc + ErrorDocument w $vh"
    return 0
  fi
  mkdir -p "$dir" "$(dirname "$vh")"
  while IFS='|' read -r kod tytul opis przycisk href; do
    verris_error_html "$kod" "$tytul" "$opis" "$przycisk" "$href" > "$dir/$kod.html"
  done <<'VERRIS_BLEDY'
403|Brak dostępu|Nie masz uprawnień do wyświetlenia tej strony.|Przejdź na stronę główną|/
404|Nie znaleziono strony|Strona, której szukasz, nie istnieje albo została przeniesiona. Sprawdź adres albo zacznij od strony głównej.|Przejdź na stronę główną|/
500|Błąd serwera|Wystąpił nieoczekiwany błąd. Spróbuj ponownie za chwilę.|Odśwież stronę|
503|Strona chwilowo niedostępna|Strona jest przeciążona albo trwają prace. Spróbuj ponownie za kilka minut.|Odśwież stronę|
VERRIS_BLEDY
  chmod 0755 "$dir"; chmod 0644 "$dir"/*.html
  blok="# >>> verris-bledy (node-hosting-profile.sh) - blok odtwarzany przy kazdym przebiegu
Alias $url/ \"$dir/\"
<Directory \"$dir\">
  AllowOverride None
  Require all granted
</Directory>
# <<< verris-bledy"
  verris_blok_w_pliku "$inc" "$blok" && zm_inc=1
  blok="# >>> verris-bledy (node-hosting-profile.sh)
ErrorDocument 403 $url/403.html
ErrorDocument 404 $url/404.html
ErrorDocument 500 $url/500.html
ErrorDocument 503 $url/503.html
# <<< verris-bledy"
  verris_blok_w_pliku "$vh" "$blok" && zm_vh=1
  if [ "$zm_vh" = "1" ]; then
    (cd "$(dirname "$build")" && "$build" rewrite_confs) >/dev/null 2>&1 \
      || log_warn "Strony błędów: rewrite_confs zwrócił błąd ($build)"
  elif [ "$zm_inc" = "1" ] && [ -x "$ctl" ]; then
    "$ctl" restart >/dev/null 2>&1 || log_warn "LiteSpeed restart po zmianie stron błędów zwrócił błąd"
  fi
  if grep -qiE 'litespeed|apache|directadmin' "$dir"/*.html; then
    log_fail "Strony błędów: w $dir jest nazwa producenta serwera"
    return 0
  fi
  # Efekt u klienta: domena hostowana z DA (pierwsza z domains.list) na adresie IP jej konta, losowa ścieżka.
  # Vhosty DA są przypięte do IP konta (<VirtualHost |IP|:|PORT_443|> w szablonach,
  # https://docs.directadmin.com/webservices/apache/customizing.html) — zapytanie na 127.0.0.1 trafia
  # w domyślny vhost serwera i daje jego 404 (t1 06.10: fałszywy FAIL, a strona klienta pokazywała Verris).
  local uc ip=""
  domena="${VERRIS_ERR_DOMAIN:-}"
  for uc in "$users"/*/user.conf; do
    [ -f "$uc" ] || continue
    [ -n "$domena" ] || domena="$(awk 'NF { print; exit }' "${uc%/user.conf}/domains.list" 2>/dev/null || true)"
    [ -n "$domena" ] || continue
    grep -qxF "$domena" "${uc%/user.conf}/domains.list" 2>/dev/null || continue
    ip="$(sed -n 's/^ip=//p' "$uc" | head -n1)"
    break
  done
  ip="${ip:-127.0.0.1}"
  if [ -z "$domena" ]; then
    log_warn "Strony błędów: brak domeny hostowanej do sprawdzenia efektu — ErrorDocument w $vh niesprawdzony"
    return 0
  fi
  for i in 1 2 3 4 5; do
    # Po rewrite_confs LiteSpeed się restartuje — kilka prób, zanim uznamy brak efektu.
    odp="$(curl -sk -m 10 --resolve "$domena:443:$ip" -w '\n%{http_code}' \
      "https://$domena/verris-sprawdz-404-$RANDOM$RANDOM" 2>/dev/null || true)"
    if [ "${odp##*$'\n'}" = "404" ] && grep -q 'verris-error-page' <<<"$odp"; then
      log_ok "Strony błędów Verris 403/404/500/503 — https://$domena/<brak> zwraca 404 ze stroną Verris"
      return 0
    fi
    [ "$i" = "5" ] || sleep "${VERRIS_ERR_WAIT:-2}"
  done
  log_fail "Strony błędów: https://$domena/<nieistniejąca ścieżka> zwraca kod ${odp##*$'\n'} bez strony Verris — serwer WWW nie stosuje ErrorDocument z $vh (czy rewrite_confs przebudował vhosty?)"
}

# Podmienia blok „# >>> verris-bledy … # <<< verris-bledy” w pliku, resztę zostawia. 0 = plik zmieniony.
verris_blok_w_pliku() {
  local plik="$1" blok="$2" nowy=""
  [ -f "$plik" ] && nowy="$(sed '/^# >>> verris-bledy/,/^# <<< verris-bledy/d' "$plik")"
  nowy="${nowy:+$nowy
}$blok"
  [ -f "$plik" ] && [ "$nowy" = "$(cat "$plik")" ] && return 1
  printf '%s\n' "$nowy" > "$plik"
}

# -----------------------------------------------------------------------------
# Strona zawieszonego konta (white label). DA serwuje ją jako zwykły katalog (odpowiedź 200, kod
# zostaje jak w DA): pliki domyślne w data/templates/suspended, własne w data/templates/custom/suspended;
# od DA 1.51 kopia w katalogu każdego resellera i admina: /home/<reseller>/domains/suspended/
# (docs.directadmin.com → Customizing Resellers). LiteSpeed Enterprise czyta tę samą konfigurację DA.
# -----------------------------------------------------------------------------
verris_suspended_html() {
  cat <<'VERRIS_SUSPENDED'
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Strona tymczasowo niedostępna</title>
<!-- verris-suspended-page -->
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f6f8;color:#1c2330;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:34rem;margin:1.5rem;padding:2rem 2.25rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.marka{margin:0 0 1.25rem;font-weight:700;font-size:1.1rem;letter-spacing:.02em;color:#2952cc}
h1{margin:0 0 .75rem;font-size:1.35rem;line-height:1.35}
p{margin:0}
a{color:#2952cc}
@media (prefers-color-scheme:dark){body{background:#12161d;color:#e4e7ec}main{background:#1b212b;box-shadow:none}.marka,a{color:#8aa8ff}}
</style>
</head>
<body>
<main>
<p class="marka">Verris</p>
<h1>Ta strona jest tymczasowo niedostępna.</h1>
<p>Jeśli jesteś właścicielem, zaloguj się do panelu Verris (<a href="https://panel.verris.pl" rel="nofollow">panel.verris.pl</a>), aby sprawdzić status usługi.</p>
</main>
</body>
</html>
VERRIS_SUSPENDED
}

# White label phpMyAdmina (test D3 na t1, 29.09): po logowaniu jednym kliknięciem z panelu klient widział
# „Serwer: DA PMA SignOn” w tytule karty i nagłówku — DirectAdmin wpisuje tę nazwę do sesji SSO
# (PMA_single_signon_cfgupdate, napis wkompilowany w binarkę DA). phpMyAdmin z SignonScript nie czyta
# sesji sam (AuthenticationSignon::readCredentials, 5.2) — nasz skrypt bierze z sesji DA tylko login
# i hasło, nazwa serwera zostaje z config.inc.php. Tymczasowych użytkowników MySQL dalej zakłada
# i po 24 h usuwa DirectAdmin. Kopia w custombuild/custom/phpmyadmin przeżywa aktualizację phpMyAdmina
# (CustomBuild kopiuje ją do nowej wersji). Brak skryptu → phpMyAdmin wraca do sesji DA (działa, z napisem).
configure_pma_white_label() {
  local cfg=/var/www/html/phpMyAdmin/config.inc.php dir=/var/www/html/.verris
  local custom=/usr/local/directadmin/custombuild/custom/phpmyadmin/config.inc.php
  [ "$DRY_RUN" != "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] || return 0
  if [ ! -f "$cfg" ]; then
    log_warn "phpMyAdmin: brak $cfg — nazwa serwera w phpMyAdmin bez zmian"
    return 0
  fi
  install -d -m 0755 "$dir"
  printf 'Require all denied\n' >"$dir/.htaccess"
  cat >"$dir/pma-signon.php" <<'PMA_SIGNON'
<?php
/**
 * Verris — odczyt sesji logowania jednym kliknięciem do phpMyAdmina (SignonScript).
 *
 * DirectAdmin zakłada sesję „SignonSession” z tymczasowym użytkownikiem MySQL, ale dopisuje do niej
 * PMA_single_signon_cfgupdate z nazwą serwera „DA PMA SignOn” (widoczna w tytule karty i w nagłówku
 * phpMyAdmina — test D3 na t1, 29.09). phpMyAdmin z ustawionym SignonScript nie czyta sesji sam, tylko
 * woła get_login_credentials() — bierzemy z sesji DA wyłącznie login i hasło, bez nadpisań konfiguracji.
 * Odczyt sesji jak w AuthenticationSignon::readCredentials (phpMyAdmin 5.2), z powrotem do sesji PMA.
 *
 * Plik tylko definiuje funkcję — wywołany bezpośrednio nic nie robi i nic nie wypisuje.
 * Instaluje node-hosting-profile.sh (configure_pma_white_label).
 */

if (! function_exists('get_login_credentials')) {
    function get_login_credentials($user)
    {
        $nazwa = 'SignonSession';
        $id = isset($_COOKIE[$nazwa]) ? (string) $_COOKIE[$nazwa] : '';
        if ($id === '' || ! preg_match('/^[A-Za-z0-9,-]{16,256}$/', $id)) {
            return ['', ''];
        }

        $staraNazwa = session_name();
        $stareId = session_id();
        $staraAktywna = session_status() === PHP_SESSION_ACTIVE;
        $stareCookie = session_get_cookie_params();
        if ($staraAktywna) {
            session_write_close();
        }

        session_name($nazwa);
        session_id($id);
        @session_start();
        $login = isset($_SESSION['PMA_single_signon_user']) ? (string) $_SESSION['PMA_single_signon_user'] : '';
        $haslo = isset($_SESSION['PMA_single_signon_password']) ? (string) $_SESSION['PMA_single_signon_password'] : '';
        session_write_close();

        @session_set_cookie_params($stareCookie);
        if ($staraNazwa !== false) {
            session_name($staraNazwa);
        }
        if ($stareId !== '' && $stareId !== false) {
            session_id($stareId);
        }
        if ($staraAktywna) {
            @session_start();
        }

        return [$login, $haslo];
    }
}
PMA_SIGNON
  chmod 0644 "$dir/pma-signon.php" "$dir/.htaccess"
  if ! grep -q 'VERRIS-PMA' "$cfg"; then
    cp -a "$cfg" "$cfg.verris-przed"
    awk '
      { print }
      /\[.SignonURL.\][[:space:]]*=/ && !s { print "\t// VERRIS-PMA: logowanie z panelu bez nazwy serwera DirectAdmina"; print "\tif (@is_readable(\x27/var/www/html/.verris/pma-signon.php\x27)) { $cfg[\x27Servers\x27][$i][\x27SignonScript\x27] = \x27/var/www/html/.verris/pma-signon.php\x27; }"; s=1 }
      /\[.host.\][[:space:]]*=/ && !h { print "$cfg[\x27Servers\x27][$i][\x27verbose\x27] = \x27Bazy danych\x27; // VERRIS-PMA"; h=1 }
    ' "$cfg.verris-przed" >"$cfg.verris-nowy"
    if grep -q "SignonScript" "$cfg.verris-nowy" && grep -q "'verbose'" "$cfg.verris-nowy" \
      && { ! command -v php >/dev/null 2>&1 || php -l "$cfg.verris-nowy" >/dev/null 2>&1; }; then
      cat "$cfg.verris-nowy" >"$cfg"
    else
      log_fail "phpMyAdmin: nie rozpoznano config.inc.php (brak SignonURL/host) — bez zmian, $cfg.verris-przed"
      rm -f "$cfg.verris-nowy"
      return 0
    fi
    rm -f "$cfg.verris-nowy"
  fi
  install -d -m 0755 "$(dirname "$custom")"
  cp -a "$cfg" "$custom"
  log_ok "phpMyAdmin: logowanie z panelu bez nazwy serwera DirectAdmina (SignonScript, kopia w custombuild/custom)"
}

configure_suspended_page() {
  echo "--- Strona zawieszonego konta ---"
  local tpl=/usr/local/directadmin/data/templates dst u d f n=0
  dst="$tpl/custom/suspended"
  if [ ! -d "$tpl/suspended" ]; then
    log_skip "Brak $tpl/suspended — pomijam stronę zawieszenia"
    return 0
  fi
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: $dst/index.html (Verris) + odświeżenie domains/suspended admina i resellerów"
    return 0
  fi
  mkdir -p "$dst"
  cp -an "$tpl/suspended/." "$dst/" 2>/dev/null || true  # coreutils 9.2 kończy -n kodem 1 przy pominięciu; m.in. .htaccess DA bez cache — po odwieszeniu przeglądarka nie trzyma strony
  verris_suspended_html > "$dst/index.html"
  # Kopie u admina/resellerów: tylko gdy to jeszcze strona domyślna albo nasza; zapis jako właściciel katalogu.
  for u in $(cat /usr/local/directadmin/data/admin/admin.list /usr/local/directadmin/data/admin/reseller.list 2>/dev/null); do
    d="/home/$u/domains/suspended"; f="$d/index.html"
    [ -d "$d" ] && [ ! -L "$d" ] && [ ! -L "$f" ] || continue
    if [ -s "$f" ] && ! grep -qiE 'verris-suspended-page|directadmin' "$f"; then
      log_warn "Strona zawieszenia u $u jest własna — zostawiam ($f)"
      continue
    fi
    runuser -u "$u" -- sh -c 'cat > "$1.verris-new" && mv -f "$1.verris-new" "$1"' _ "$f" < "$dst/index.html" \
      && n=$((n + 1)) || log_warn "Nie udało się zapisać $f jako $u"
  done
  if grep -q 'verris-suspended-page' "$dst/index.html" && ! grep -qi 'directadmin' "$dst/index.html"; then
    log_ok "Strona zawieszenia Verris (custom/suspended; kopii admina/resellerów: $n)"
  else
    log_fail "Strona zawieszenia: $dst/index.html bez treści Verris"
  fi
}

# Liczba kont klientów (usertype=user), których ticket.conf nie wysyła kopii wiadomości DA na adres-zlew.
# Pętla, nie potok: ticket.conf admina nie ma zlewu, a w dawnym `grep -L | while … && echo` ostatnia
# iteracja kończyła się kodem 1 — pipefail + set -e przerywały cały profil bez podsumowania (t1, 29.09).
da_zle_ticket_conf() {
  local tc n=0
  for tc in "$1"/*/ticket.conf; do
    [ -f "$tc" ] || continue
    grep -q '^usertype=user$' "${tc%/ticket.conf}/user.conf" 2>/dev/null || continue
    grep -qx "email=$2" "$tc" || n=$((n + 1))
  done
  echo "$n"
}

# Status możliwości do summary (czytany przez audyt węzła).
capability_status() {
  local ssl="off" dkim="off" redis="off" phpsel="off" dnssec="off" appsel="off"
  grep -qE "^letsencrypt=1" "$DA_CONF" 2>/dev/null && ssl="on"
  grep -qE "^dkim=1" "$DA_CONF" 2>/dev/null && dkim="on"
  grep -qE "^dnssec=1" "$DA_CONF" 2>/dev/null && dnssec="on"
  cb_options_raw 2>/dev/null | grep -qiE "^redis:[[:space:]]*yes" && redis="on"
  { command -v cloudlinux-config >/dev/null 2>&1 || [ -d /opt/alt ]; } && phpsel="on"
  cloudlinux-selector get --json --interpreter nodejs 2>/dev/null | grep -q '"selector_enabled": *true' && appsel="on"
  echo "ssl=${ssl} dkim=${dkim} redis=${redis} php_selector=${phpsel} dnssec=${dnssec} app_selector=${appsel}"
}

emit_verris_profile_summary() {
  local gov="inactive"
  governor_is_active && gov="active"
  local cfs="disabled"
  cagefs_is_enabled && cfs="enabled"
  local mail="fail" ftp="fail" db="fail"
  if port_is_listening 993 || port_is_listening 587; then mail="ok"; fi
  if port_is_listening 21; then ftp="ok"; fi
  if mysql -e "SELECT 1" >/dev/null 2>&1; then db="ok"; fi
  echo "[VERRIS_PROFILE] governor=${gov} cagefs=${cfs} mail_ports=${mail} ftp_port=${ftp} mariadb=${db} $(capability_status) da_packages=unchanged_by_script"
}

require_root

echo "=== Verris hosting profile ==="
echo "Data: $(date -u +%FT%TZ)"
echo ""

preflight_stack

if [ "$GOVERNOR_ONLY" != "1" ]; then
  configure_cloudlinux_cagefs
fi

if [ "$CAGEFS_ONLY" = "1" ]; then
  print_lve_info
  print_summary || exit
  exit $?
fi

configure_cloudlinux_governor

if [ "$GOVERNOR_ONLY" = "1" ]; then
  print_summary || exit
  exit $?
fi

configure_directadmin_custombuild
ensure_hosting_core_services
configure_litespeed
configure_hosting_capabilities
configure_litespeed_alt_php
configure_litespeed_throttling
configure_dovecot_migration_master
configure_php_expose
configure_da_panel_firewall
configure_http3_firewall
configure_firewall_cockpit
configure_suspended_page
configure_error_pages
configure_pma_white_label
print_lve_info
print_summary || exit
exit $?
