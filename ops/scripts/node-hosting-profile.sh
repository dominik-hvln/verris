#!/usr/bin/env bash
# Verris — standardowy profil hostingowy na węźle compute (CloudLinux + DA + LiteSpeed).
# Uruchom JEDNORAZOWO jako root PO instalacji DirectAdmin i połączeniu z panelem Verris.
#
# Opcje:
#   --dry-run       tylko wypisuje plan, bez zmian
#   --yes, -y       bez pytań (CustomBuild build jeśli włączony)
#   --skip-build    pomiń długi CustomBuild rebuild (tylko ustawienia + Governor + restart LS)
set -Eeuo pipefail

DRY_RUN=0
NONINTERACTIVE=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) NONINTERACTIVE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

run() {
  if [ "$DRY_RUN" = "1" ]; then
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

require_root() {
  if [ "$(id -u)" != "0" ]; then
    echo "Uruchom jako root." >&2
    exit 1
  fi
}

require_root

echo "=== Verris hosting profile ==="
echo "Data: $(date -u +%FT%TZ)"
echo ""

# --- CloudLinux / LVE ---------------------------------------------------------
if ! command -v lveinfo >/dev/null 2>&1 && ! command -v cloudlinux-statistic >/dev/null 2>&1; then
  echo "BRAK: narzędzia CloudLinux LVE (lveinfo / cloudlinux-statistic). Zainstaluj CL przed profilem." >&2
  exit 1
fi

echo "--- MySQL Governor (CloudLinux) ---"
if command -v dbctl >/dev/null 2>&1 || [ -d /usr/share/db-governor ]; then
  run "cloudlinux-selector set --current-version mysql --version default 2>/dev/null || true"
  if [ -x /usr/share/lve/dbgovernor/mysqlgovernor.py ]; then
    run "/usr/share/lve/dbgovernor/mysqlgovernor.py install 2>/dev/null || true"
  elif command -v governor-mysql >/dev/null 2>&1; then
    run "yum install -y governor-mysql 2>/dev/null || dnf install -y governor-mysql 2>/dev/null || true"
  else
    echo "INFO: MySQL Governor — użyj cl-wizard / dokumentacja CL dla Twojej wersji OS."
  fi
else
  echo "INFO: pakiet Governor nie wykryty — doinstaluj z repozytorium CloudLinux (trial/production)."
fi

# --- DirectAdmin CustomBuild (LiteSpeed, PHP, cache) --------------------------
if [ ! -x /usr/local/directadmin/directadmin ]; then
  echo "BRAK: DirectAdmin (/usr/local/directadmin). Profil DA pominięty." >&2
else
  echo "--- DirectAdmin CustomBuild (LiteSpeed + LSPHP) ---"
  CB="/usr/local/directadmin/custombuild"
  BUILD=$(custombuild_bin "$CB" || true)
  if [ -n "$BUILD" ]; then
    run "cd $CB && $BUILD set webserver litespeed"
    php1_release="$($BUILD options 2>/dev/null | sed -n 's/^php1_release:[[:space:]]*//p' | head -1 | tr -d '[:space:]')"
    if [ -z "$php1_release" ]; then
      php1_release="8.3"
      echo "INFO: php1_release nieczytelne w custombuild options — używam domyślnie $php1_release"
    fi
    run "cd $CB && $BUILD set php1_release $php1_release"
    run "cd $CB && $BUILD set redis yes"
    run "cd $CB && $BUILD set mod_ruid2 no"
    run "cd $CB && $BUILD set mod_suexec no"
    if [ "$SKIP_BUILD" = "1" ]; then
      echo "INFO: pominięto CustomBuild rebuild (--skip-build)."
    elif [ "$DRY_RUN" = "1" ]; then
      echo "[dry-run] cd $CB && $BUILD build clean && $BUILD build php n && $BUILD build litespeed"
    else
      echo "INFO: pełny CustomBuild build (30–90 min, możliwy restart usług)."
      RUN_BUILD=0
      if [ "$NONINTERACTIVE" = "1" ]; then
        RUN_BUILD=1
      else
        read -r -p "Uruchomić custombuild build teraz? [y/N] " ans
        if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
          RUN_BUILD=1
        fi
      fi
      if [ "$RUN_BUILD" = "1" ]; then
        run "cd $CB && $BUILD build clean"
        run "cd $CB && $BUILD build php n"
        run "cd $CB && $BUILD build litespeed"
      fi
    fi
  else
    echo "INFO: brak ./build w $CB — pomiń CustomBuild."
  fi
fi

# --- LiteSpeed — cache / bezpieczeństwo ---------------------------------------
if [ -x /usr/local/lsws/bin/lswsctrl ]; then
  echo "--- LiteSpeed — podstawowy cache (public_html/.htaccess per konto w DA) ---"
  echo "INFO: globalnie włącz cache w WebAdmin → Cache, lub szablon vhost w DA."
  run "/usr/local/lsws/bin/lswsctrl restart 2>/dev/null || true"
else
  echo "INFO: LiteSpeed nie wykryty — pomiń lub doinstaluj przed profilem."
fi

# --- LVE domyślne (platforma ustawia per plan w Verris API → DA) ---------------
echo "--- LVE ---"
echo "INFO: limity EP/NPROC per konto ustawia Verris przy provisioning (plan → DA)."
echo "      Sprawdź: lvectl list, cagefsctl --list-enabled"

echo ""
echo "=== Profil zakończony ==="
echo "Następnie: panel admin → węzeł → Test DirectAdmin → status probes → smoke provisioning."
