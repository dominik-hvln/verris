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

log_ok() { echo "[OK] $*"; PROFILE_OK=$((PROFILE_OK + 1)); }
log_skip() { echo "[SKIP] $*"; PROFILE_SKIP=$((PROFILE_SKIP + 1)); }
log_warn() { echo "[WARN] $*" >&2; PROFILE_WARN=$((PROFILE_WARN + 1)); }
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
  command -v dbctl >/dev/null 2>&1 && dbctl list >/dev/null 2>&1
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
  local out rc=0
  if [ "$DRY_RUN" = "1" ] || [ "$PREFLIGHT_ONLY" = "1" ]; then
    log_info "dry-run: $GOVERNOR_PY $*"
    return 0
  fi
  echo "[verris-profile] $GOVERNOR_PY $*"
  out="$("$GOVERNOR_PY" "$@" 2>&1)" || rc=$?
  printf '%s\n' "$out" | strip_ansi
  if [ "$rc" -eq 0 ]; then
    return 0
  fi
  local clean
  clean="$(printf '%s' "$out" | strip_ansi)"
  if grep -qiE 'already|completed|nothing to do' <<<"$clean"; then
    return 0
  fi
  log_warn "$desc (rc=$rc)"
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

  run_governor_py "Ustawienie wersji MySQL/MariaDB dla Governor" --mysql-version="$gov_ver" || true
  if run_governor_py "Instalacja MySQL Governor" --install; then
    if governor_is_active; then
      log_ok "MySQL Governor aktywny (dbctl list)"
    else
      log_ok "MySQL Governor — instalator zakończony (sprawdź: dbctl list)"
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
  echo ""
  echo "=== Podsumowanie profilu ==="
  echo "OK=$PROFILE_OK  SKIP=$PROFILE_SKIP  WARN=$PROFILE_WARN"
  if [ "$PROFILE_WARN" -gt 0 ]; then
    echo "Profil zakończony z ostrzeżeniami (patrz [WARN] powyżej)."
  else
    echo "=== Profil zakończony ==="
  fi
  echo "Następnie: panel admin → węzeł → Test DirectAdmin → status probes → smoke provisioning."
}

require_root

echo "=== Verris hosting profile ==="
echo "Data: $(date -u +%FT%TZ)"
echo ""

preflight_stack
configure_cloudlinux_governor

if [ "$GOVERNOR_ONLY" = "1" ]; then
  print_summary
  exit 0
fi

configure_directadmin_custombuild
configure_litespeed
print_lve_info
print_summary

# Ostrzeżenia nie blokują sukcesu; błędy krytyczne (custombuild set) kończą skrypt wcześniej przez set -e.
exit 0
