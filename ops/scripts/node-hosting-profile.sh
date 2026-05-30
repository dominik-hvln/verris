#!/usr/bin/env bash
# Verris — standardowy profil hostingowy na węźle compute (CloudLinux + DA + LiteSpeed).
# Uruchom JEDNORAZOWO jako root PO instalacji DirectAdmin i połączeniu z panelem Verris.
#
# Nie jest częścią bootstrapu (handshake/agent). Cel: spójna konfiguracja floty.
#
#   scp ops/scripts/node-hosting-profile.sh root@WĘZEŁ:/root/
#   ssh root@WĘZŁ 'bash /root/node-hosting-profile.sh'
#
# Opcje:
#   --dry-run   tylko wypisuje plan, bez zmian
set -Eeuo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] $*"
  else
    echo "[verris-profile] $*"
    eval "$@"
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
  if [ -x "$CB/custombuild" ]; then
    run "cd $CB && ./custombuild set webserver litespeed"
    run "cd $CB && ./custombuild set php1_release $(./custombuild options | awk -F= '/^php1_release:/{print $2}' | tr -d ' ' || echo 8.3)"
    run "cd $CB && ./custombuild set redis yes"
    run "cd $CB && ./custombuild set mod_ruid2 no"
    run "cd $CB && ./custombuild set mod_suexec no"
    echo "INFO: uruchom pełny build (30–90 min, możliwy restart usług):"
    echo "  cd $CB && ./custombuild build clean && ./custombuild build php n && ./custombuild build litespeed"
    if [ "$DRY_RUN" = "0" ]; then
      read -r -p "Uruchomić custombuild build teraz? [y/N] " ans
      if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
        run "cd $CB && ./custombuild build clean"
        run "cd $CB && ./custombuild build php n"
        run "cd $CB && ./custombuild build litespeed"
      fi
    fi
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
