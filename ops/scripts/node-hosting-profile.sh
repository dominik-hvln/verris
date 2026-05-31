#!/usr/bin/env bash
# Verris — standardowy profil hostingowy na węźle compute (CloudLinux + DA + LiteSpeed).
# Uruchom JEDNORAZOWO jako root PO instalacji DirectAdmin i połączeniu z panelem Verris.
#
# Opcje:
#   --dry-run         tylko wypisuje plan, bez zmian
#   --yes, -y         bez pytań (CustomBuild build jeśli włączony)
#   --skip-build      pomiń długi CustomBuild rebuild (tylko ustawienia + Governor + restart LS)
#   --preflight-only  tylko weryfikacja stosu (bez zmian)
#   --governor-only   tylko instalacja/konfiguracja MySQL Governor (wymaga CL + działającego MySQL/MariaDB)
set -Eeuo pipefail

GOVERNOR_PY="/usr/share/lve/dbgovernor/mysqlgovernor.py"

DRY_RUN=0
NONINTERACTIVE=0
SKIP_BUILD=0
PREFLIGHT_ONLY=0
GOVERNOR_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) NONINTERACTIVE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --preflight-only) PREFLIGHT_ONLY=1 ;;
    --governor-only) GOVERNOR_ONLY=1; NONINTERACTIVE=1 ;;
  esac
done

PROFILE_OK=0
PROFILE_SKIP=0
PROFILE_WARN=0
PROFILE_FAIL=0
GOVERNOR_REQUIRED=1

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
  echo "--- LVE ---"
  log_info "Limity EP/NPROC per konto ustawia Verris przy provisioning (plan → DA)"
  log_info "Sprawdź: lvectl list, cagefsctl --list-enabled"
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
  if [ "$GOVERNOR_REQUIRED" = "1" ] && [ "$PREFLIGHT_ONLY" != "1" ] && [ "$DRY_RUN" != "1" ] && ! governor_is_active; then
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
configure_cloudlinux_governor

if [ "$GOVERNOR_ONLY" = "1" ]; then
  print_summary
  exit $?
fi

configure_directadmin_custombuild
configure_litespeed
print_lve_info
print_summary
exit $?
