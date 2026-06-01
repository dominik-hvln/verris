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

  # 4) odśwież skeleton po zmianach oprogramowania (gdy nie było świeżego --init)
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

# Mapuje mysql -V → słowo kluczowe CloudLinux Governor (np. mariadb106, mysql80).
governor_mysql_version_keyword() {
  local line="$1"
  local ver major minor

  if grep -qi mariadb <<<"$line"; then
    ver="$(sed -n 's/.*Distrib \([0-9]\+\.[0-9]\+\).*/\1/p' <<<"$line" | head -1)"
    if [ -n "$ver" ]; then
      major="${ver%%.*}"
      minor="${ver#*.}"
      minor="${minor%%.*}"
      echo "mariadb${major}${minor}"
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

  # DirectAdmin + CL — typowo MariaDB 10.6+; bezpieczny fallback gdy mysql -V niedostępne przed pierwszym startem.
  echo "mariadb106"
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
  dnf module enable mariadb:cl-MariaDB106 -y 2>/dev/null || true
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

ensure_mariadb106_server_running() {
  local svc pkgs
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
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
    log_ok "MariaDB 10.6 działa (mysql -e SELECT 1)"
    return 0
  fi

  log_fail "MariaDB nie odpowiada po 90 s — journalctl -u $svc"
  return 1
}

recover_governor_after_install() {
  local svc gov_ver="${1:-mariadb106}"
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    return 0
  fi

  if governor_is_active; then
    return 0
  fi

  log_info "Governor nieaktywny po instalacji — odzyskiwanie (MariaDB + db_governor)"
  ensure_mariadb106_server_running || true
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

  remove_cl_mariadb_meta_packages
  ensure_mariadb106_server_running || true
  ensure_mariadb_before_governor "$gov_ver"
  prepare_governor_install

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

cb_options_raw() {
  (cd "$CB" && "$BUILD" options 2>/dev/null) | strip_ansi
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

  cb_set_option webserver litespeed

  php_release="$(cb_option_value php1_release)"
  if [ -z "$php_release" ]; then
    php_release="$(detect_lsphp_release || true)"
  fi
  if [ -z "$php_release" ]; then
    php_release="8.3"
    log_warn "php1_release nieczytelne w custombuild options — używam domyślnie $php_release"
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
    run "cd $CB && $BUILD build clean"
    run "cd $CB && $BUILD build php n"
    run "cd $CB && $BUILD build litespeed"
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
  echo "Następnie: panel admin → węzeł → Test DirectAdmin → status probes → smoke provisioning."
  return "$exit_code"
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
  print_summary
  exit $?
fi

configure_cloudlinux_governor

if [ "$GOVERNOR_ONLY" = "1" ]; then
  print_summary
  exit $?
fi

configure_directadmin_custombuild
ensure_hosting_core_services
configure_litespeed
print_lve_info
print_summary
exit $?
