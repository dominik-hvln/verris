#!/usr/bin/env bash
# Verris — pełna gotowość węzła compute pod LIVE (A→Z).
#
# Uruchom JEDNORAZOWO jako root na węźle PO bootstrapie Verris (/etc/verris.conf)
# i instalacji DirectAdmin + CloudLinux + LiteSpeed.
#
# Co robi (kolejno):
#   1. Preflight stosu (CL, DA, LS, verris.conf)
#   2. Agent zadań Verris (agent-3): timer, systemd template, skrypty z shebang
#   3. Profil hostingowy: Governor/MariaDB 10.6, CustomBuild (skip rebuild), LiteSpeed
#   4. Strona domyślna Verris (szablon DA dla nowych domen)
#   5. Weryfikacja końcowa LIVE (Governor, MariaDB, agent, API)
#
# Użycie:
#   scp -r ops/hosting-default-page ops/scripts/{node-live-readiness,node-hosting-profile,node-verris-tasks-install,install-verris-default-page,verris-tasks,verris-task-run}.sh root@WĘZEŁ:/root/verris/
#   ssh root@WĘZEŁ 'bash /root/verris/node-live-readiness.sh'
#
# Opcje:
#   --dry-run          tylko plan (deleguje do profilu)
#   --skip-agent       pomiń instalację agenta zadań
#   --skip-profile     pomiń profil hostingowy (tylko agent)
#   --governor-only    tylko Governor + weryfikacja
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="/var/log/verris-live-readiness.log"
TS="$(date -u +%FT%TZ)"

DRY_RUN=0
SKIP_AGENT=0
SKIP_PROFILE=0
GOVERNOR_ONLY=0
FAIL=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-agent) SKIP_AGENT=1 ;;
    --skip-profile) SKIP_PROFILE=1 ;;
    --governor-only) GOVERNOR_ONLY=1; SKIP_AGENT=1 ;;
  esac
done

exec > >(tee -a "$LOG") 2>&1

log_ok()   { echo "[OK] $*"; }
log_fail() { echo "[FAIL] $*" >&2; FAIL=1; }
log_warn() { echo "[WARN] $*" >&2; }
log_info() { echo "[INFO] $*"; }
log_step() { echo ""; echo "========== $* =========="; }

require_root() {
  [ "$(id -u)" = "0" ] || { log_fail "Uruchom jako root"; exit 1; }
}

require_verris_conf() {
  [ -r /etc/verris.conf ] || { log_fail "Brak /etc/verris.conf — najpierw bootstrap Verris z panelu"; exit 1; }
  # shellcheck disable=SC1090
  source /etc/verris.conf
  : "${VERRIS_API_URL:?}"
  : "${VERRIS_SERVER_ID:?}"
  : "${VERRIS_IDENTITY_TOKEN:?}"
  log_ok "/etc/verris.conf (server $VERRIS_SERVER_ID)"
}

require_scripts() {
  local missing=0
  for f in node-hosting-profile.sh node-verris-tasks-install.sh verris-tasks.sh verris-task-run.sh; do
    if [ ! -f "$SCRIPT_DIR/$f" ]; then
      log_fail "Brak $SCRIPT_DIR/$f — skopiuj cały katalog ops/scripts/verris na węzeł"
      missing=1
    fi
  done
  [ "$missing" -eq 0 ] || exit 1
  chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true
  log_ok "Skrypty w $SCRIPT_DIR"
}

preflight_stack() {
  log_step "1/4 Preflight"
  if ! command -v lveinfo >/dev/null 2>&1 && ! command -v cloudlinux-statistic >/dev/null 2>&1; then
    log_fail "Brak CloudLinux LVE"
    return 1
  fi
  log_ok "CloudLinux LVE"

  if [ -x /usr/local/directadmin/directadmin ]; then
    log_ok "DirectAdmin"
  else
    log_warn "DirectAdmin nie wykryty"
  fi

  if [ -x /usr/local/lsws/bin/lswsctrl ]; then
    log_ok "LiteSpeed"
  else
    log_warn "LiteSpeed nie wykryty"
  fi

  if command -v python3 >/dev/null 2>&1; then
    log_ok "python3"
  else
    log_fail "python3 wymagany przez agenta zadań"
  fi

  if command -v curl >/dev/null 2>&1; then
    log_ok "curl"
  else
    log_fail "curl wymagany"
  fi
}

install_task_agent() {
  log_step "2/4 Agent zadań Verris (agent-3)"
  if [ "$SKIP_AGENT" = "1" ]; then
    log_info "Pominięto (--skip-agent / --governor-only)"
    return 0
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log_info "dry-run: bash $SCRIPT_DIR/node-verris-tasks-install.sh"
    return 0
  fi
  bash "$SCRIPT_DIR/node-verris-tasks-install.sh"
}

run_hosting_profile() {
  log_step "3/4 Profil hostingowy"
  if [ "$SKIP_PROFILE" = "1" ]; then
    log_info "Pominięto (--skip-profile)"
    return 0
  fi

  local profile_args=(--yes --skip-build)
  if [ "$DRY_RUN" = "1" ]; then
    profile_args=(--dry-run)
  fi
  if [ "$GOVERNOR_ONLY" = "1" ]; then
    profile_args=(--governor-only --yes)
  fi

  install -m 755 "$SCRIPT_DIR/node-hosting-profile.sh" /usr/local/bin/verris-hosting-profile.sh
  log_ok "Profil → /usr/local/bin/verris-hosting-profile.sh"

  if bash "$SCRIPT_DIR/node-hosting-profile.sh" "${profile_args[@]}"; then
    log_ok "Profil hostingowy zakończony"
  else
    log_fail "Profil hostingowy zakończony błędem (rc=$?)"
    return 1
  fi
}

install_default_hosting_page() {
  log_step "4/5 Strona domyślna Verris (DA template)"
  if [ "$SKIP_PROFILE" = "1" ] || [ "$GOVERNOR_ONLY" = "1" ]; then
    log_info "Pominięto (profil hostingowy wyłączony)"
    return 0
  fi
  if [ ! -x "$SCRIPT_DIR/install-verris-default-page.sh" ]; then
    log_fail "Brak $SCRIPT_DIR/install-verris-default-page.sh — dołącz do bundle onboard"
    return 1
  fi
  if [ ! -f "$SCRIPT_DIR/hosting-default-page/index.html" ]; then
    log_fail "Brak $SCRIPT_DIR/hosting-default-page/ — scp -r ops/hosting-default-page na węzeł"
    return 1
  fi
  local args=()
  [ "$DRY_RUN" = "1" ] && args+=(--dry-run)
  if bash "$SCRIPT_DIR/install-verris-default-page.sh" "${args[@]}"; then
    log_ok "Szablon domyślnej strony Verris zainstalowany"
  else
    log_fail "install-verris-default-page.sh zakończony błędem (rc=$?)"
    return 1
  fi
}

governor_is_live() {
  local out
  command -v dbctl >/dev/null 2>&1 || return 1
  out="$(dbctl list 2>&1)" || return 1
  grep -qiE "can't connect to socket|governor is not started|not responsive" <<<"$out" && return 1
  return 0
}

verify_live_readiness() {
  log_step "5/5 Weryfikacja LIVE"

  # MariaDB
  if getent passwd mysql >/dev/null 2>&1; then
    log_ok "użytkownik mysql"
  else
    log_fail "brak użytkownika mysql"
  fi

  if mysql -e "SELECT 1" >/dev/null 2>&1; then
    log_ok "mysql -e SELECT 1"
  else
    log_fail "MariaDB nie odpowiada"
  fi

  local svc="mariadb"
  systemctl list-unit-files mysqld.service >/dev/null 2>&1 && svc="mysqld"
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    log_ok "systemctl is-active $svc"
  else
    log_fail "$svc nieaktywny"
  fi

  # Governor
  if governor_is_live; then
    log_ok "dbctl list (Governor aktywny)"
  else
    log_fail "Governor nieaktywny — dbctl list"
  fi

  if systemctl is-active --quiet db_governor 2>/dev/null; then
    log_ok "db_governor active"
  else
    log_warn "db_governor nieaktywny (możliwe na niektórych buildach CL)"
  fi

  # LiteSpeed
  if [ -x /usr/local/lsws/bin/lswsctrl ]; then
    if /usr/local/lsws/bin/lswsctrl status 2>/dev/null | grep -qi 'running\|online'; then
      log_ok "LiteSpeed running"
    else
      log_warn "LiteSpeed — sprawdź lswsctrl status"
    fi
  fi

  # Agent (jeśli instalowany)
  if [ "$SKIP_AGENT" != "1" ] && [ "$DRY_RUN" != "1" ]; then
    for f in /usr/local/bin/verris-tasks.sh /usr/local/bin/verris-task-run.sh; do
      if [ -x "$f" ] && head -1 "$f" | grep -q '^#!/'; then
        log_ok "$(basename "$f") + shebang"
      else
        log_fail "$f brak lub bez shebang"
      fi
    done

    if systemctl is-active --quiet verris-tasks.timer 2>/dev/null; then
      log_ok "verris-tasks.timer"
    else
      log_fail "verris-tasks.timer nieaktywny"
    fi

    if systemctl cat verris-task@.service >/dev/null 2>&1; then
      log_ok "verris-task@.service"
    else
      log_fail "brak verris-task@.service"
    fi

    # shellcheck disable=SC1090
    source /etc/verris.conf
    if curl -fsS --max-time 15 \
      -H "X-Server-Id: $VERRIS_SERVER_ID" \
      -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
      "$VERRIS_API_URL/agent/tasks/lease" >/dev/null 2>&1; then
      log_ok "API lease"
    else
      log_warn "API lease — brak QUEUED OK, ale sprawdź token jeśli agent nie poll'uje"
    fi
  fi

  # CloudLinux LVE
  if command -v lvectl >/dev/null 2>&1; then
    log_ok "lvectl"
  else
    log_warn "lvectl niedostępny"
  fi

  # Poczta / FTP (wymagane dla hostingu współdzielonego)
  if command -v ss >/dev/null 2>&1; then
    if ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE ':993$|:587$'; then
      log_ok "poczta — IMAP/SMTP (:993 lub :587)"
    else
      log_fail "poczta — brak nasłuchu :993/:587 (profil: exim + dovecot)"
    fi
    if ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE ':21$'; then
      log_ok "FTP — :21"
    else
      log_warn "FTP — brak :21 (pure-ftpd/proftpd)"
    fi
  fi
}

print_final_summary() {
  echo ""
  echo "============================================"
  echo " Verris LIVE readiness — $TS"
  echo " Log: $LOG"
  echo "============================================"
  if [ "$FAIL" -eq 0 ]; then
    echo ""
    echo "[OK] Węzeł gotowy pod LIVE provisioning."
    echo ""
    echo "Następne kroki w panelu admin:"
    echo "  1. Test DirectAdmin"
    echo "  2. Sprawdź status probes"
    echo "  3. Smoke provisioning (konto testowe)"
    echo ""
    echo "Profil z panelu (opcjonalnie, idempotentny):"
    echo "  Admin → węzeł → Profil hostingowy → Uruchom"
    return 0
  fi
  echo ""
  echo "[FAIL] Węzeł NIE jest gotowy — napraw pozycje [FAIL] powyżej."
  echo "Diagnostyka:"
  echo "  journalctl -u mariadb -u db_governor -n 50"
  echo "  dbctl list"
  echo "  tail -100 $LOG"
  return 1
}

main() {
  echo "=== Verris node LIVE readiness ==="
  echo "Start: $TS"
  echo "Script dir: $SCRIPT_DIR"
  echo "Log: $LOG"

  require_root
  require_verris_conf
  require_scripts
  preflight_stack
  install_task_agent
  run_hosting_profile
  install_default_hosting_page
  verify_live_readiness
  print_final_summary
}

main "$@"
