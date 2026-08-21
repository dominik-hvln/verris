#!/usr/bin/env bash
# Verris — onboard węzła compute pod LIVE (A→Z, jeden skrypt).
#
# Zastępuje ręczną sekwencję: bootstrap → agent zadań → profil hostingowy →
# przygotowanie DirectAdmin pod provisioning (IP + pakiety planów).
#
# WYMAGANIA (przed uruchomieniem):
#   - AlmaLinux / CloudLinux z LVE (lveinfo lub cloudlinux-statistic)
#   - DirectAdmin zainstalowany i działający (port 2222)
#   - LiteSpeed + LSPHP (bootstrap Verris może doinstalować LS jeśli LITESPEED_SERIAL_NO)
#   - Bootstrap Verris z panelu admin WYKONANY → /etc/verris.conf istnieje
#
# SKRYPTY (w tym samym katalogu co ten plik):
#   node-live-readiness.sh, node-hosting-profile.sh, install-verris-default-page.sh,
#   hosting-default-page/ (katalog), node-verris-tasks-install.sh,
#   node-da-sync-plan-packages.sh, verris-tasks.sh, verris-task-run.sh,
#   node-migration-worker.sh (+ lib/migration-input-guard.sh),
#   security-hardening-baseline.sh, security-egress-lockdown.sh
#
# Użycie:
#   scp -r ops/hosting-default-page \
#     ops/scripts/{node-onboard-live,node-live-readiness,node-hosting-profile,\
#     install-verris-default-page,node-verris-tasks-install,node-da-sync-plan-packages,\
#     verris-tasks,verris-task-run,node-migration-worker,\
#     security-hardening-baseline,security-egress-lockdown}.sh \
#     root@WĘZEŁ:/root/verris/
#   ssh root@WĘZEŁ 'bash /root/verris/node-onboard-live.sh'
#
# Opcje:
#   --dry-run              plan bez zmian (deleguje do pod-skryptów)
#   --skip-da              pomiń rejestrację IP i sync pakietów DA
#   --skip-readiness       tylko kroki DA (gdy profil już OK)
#   --governor-only        tylko Governor/MariaDB (przekazywane do live-readiness)
#   --skip-security        pomiń baseline hardening + egress lockdown (NIEZALECANE)
#   --public-ip IP         wymuszenie publicznego IP (domyślnie: auto-detect)
#
# Zmienne środowiskowe (opcjonalne, krok DirectAdmin):
#   DA_HOST, DA_PORT, DA_USER, DA_KEY  — login key admina (Account Manager → Login Keys)
#   DA_SECURE=yes|no
#
# Po sukcesie — w panelu admin (węzeł Node-XX):
#   1. DirectAdmin → host=publiczne IP, port=2222, login key admina, Test połączenia
#   2. Zatwierdź węzeł (ACTIVE) jeśli jeszcze INIT
#   3. Smoke: utwórz usługę testową w panelu klienta
#
# Log: /var/log/verris-node-onboard.log
# Runbook: ops/docs/NODE_ONBOARD_RUNBOOK.md
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="/var/log/verris-node-onboard.log"
TS="$(date -u +%FT%TZ)"

DRY_RUN=0
SKIP_DA=0
SKIP_READINESS=0
GOVERNOR_ONLY=0
SKIP_SECURITY=0
PUBLIC_IP="${PUBLIC_IP:-}"
FAIL=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-da) SKIP_DA=1 ;;
    --skip-readiness) SKIP_READINESS=1 ;;
    --governor-only) GOVERNOR_ONLY=1 ;;
    --skip-security) SKIP_SECURITY=1 ;;
    --public-ip=*) PUBLIC_IP="${arg#*=}" ;;
    --public-ip) ;; # value in next arg handled below
    -h|--help)
      sed -n '2,35p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

# --public-ip 1.2.3.4 (spacja)
if [ -z "$PUBLIC_IP" ]; then
  prev=""
  for arg in "$@"; do
    if [ "$prev" = "--public-ip" ]; then PUBLIC_IP="$arg"; break; fi
    prev="$arg"
  done
fi

exec > >(tee -a "$LOG") 2>&1

log_ok()   { echo "[OK] $*"; }
log_fail() { echo "[FAIL] $*" >&2; FAIL=1; }
log_warn() { echo "[WARN] $*" >&2; }
log_info() { echo "[INFO] $*"; }
log_step() { echo ""; echo "========== $* =========="; }

require_root() {
  [ "$(id -u)" = "0" ] || { log_fail "Uruchom jako root"; exit 1; }
}

detect_public_ip() {
  if [ -n "$PUBLIC_IP" ]; then
    echo "$PUBLIC_IP" | tr -d '[:space:]'
    return 0
  fi
  curl -fsSL --max-time 10 https://api.ipify.org 2>/dev/null \
    || curl -fsSL --max-time 10 http://checkip.amazonaws.com 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || true
}

require_verris_conf() {
  [ -r /etc/verris.conf ] || {
    log_fail "Brak /etc/verris.conf — najpierw uruchom bootstrap Verris z panelu admin"
    echo "  Admin → Węzły → Init → skopiuj skrypt bootstrap → uruchom na węźle jako root"
    exit 1
  }
  # shellcheck disable=SC1090
  source /etc/verris.conf
  : "${VERRIS_API_URL:?}"
  : "${VERRIS_SERVER_ID:?}"
  : "${VERRIS_IDENTITY_TOKEN:?}"
  log_ok "/etc/verris.conf (server $VERRIS_SERVER_ID, API $VERRIS_API_URL)"
}

require_bundle_scripts() {
  local missing=0
  for f in node-live-readiness.sh node-hosting-profile.sh node-verris-tasks-install.sh \
           node-da-sync-plan-packages.sh verris-tasks.sh verris-task-run.sh \
           node-migration-worker.sh \
           security-hardening-baseline.sh security-egress-lockdown.sh; do
    if [ ! -f "$SCRIPT_DIR/$f" ]; then
      log_fail "Brak $SCRIPT_DIR/$f"
      missing=1
    fi
  done
  # Z-03 — worker migracji startuje fail-closed bez biblioteki walidacji wejścia.
  if [ ! -f "$SCRIPT_DIR/lib/migration-input-guard.sh" ]; then
    log_fail "Brak $SCRIPT_DIR/lib/migration-input-guard.sh (walidacja danych migracji)"
    missing=1
  fi
  [ "$missing" -eq 0 ] || {
    echo "Skopiuj cały katalog (razem z lib/): scp -r ops/scripts/ root@WĘZEŁ:/root/verris/"
    exit 1
  }
  chmod +x "$SCRIPT_DIR"/lib/*.sh 2>/dev/null || true
  chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true
  log_ok "Bundle skryptów w $SCRIPT_DIR"
}

preflight_stack() {
  log_step "0/3 Preflight stosu"

  if ! command -v lveinfo >/dev/null 2>&1 && ! command -v cloudlinux-statistic >/dev/null 2>&1; then
    log_fail "Brak CloudLinux LVE (lveinfo / cloudlinux-statistic)"
    return 1
  fi
  log_ok "CloudLinux LVE"

  if [ -x /usr/local/directadmin/directadmin ]; then
    log_ok "DirectAdmin binary"
  else
    log_fail "DirectAdmin nie zainstalowany (/usr/local/directadmin/directadmin)"
    return 1
  fi

  if ss -lnt 2>/dev/null | grep -qE ':2222\b'; then
    log_ok "DirectAdmin nasłuchuje na :2222"
  else
    log_warn "Port 2222 nie nasłuchuje — sprawdź directadmin.service"
  fi

  if [ -x /usr/local/lsws/bin/lswsctrl ]; then
    log_ok "LiteSpeed"
  else
    log_warn "LiteSpeed nie wykryty — bootstrap mógł go pominąć (LITESPEED_SERIAL_NO?)"
  fi

  PUBLIC_IP="$(detect_public_ip)"
  if [ -n "$PUBLIC_IP" ]; then
    log_ok "Publiczne IP węzła: $PUBLIC_IP"
  else
    log_fail "Nie udało się wykryć publicznego IP — użyj --public-ip"
    return 1
  fi
}

run_security_hardening() {
  log_step "1/4 Security hardening baseline (host + egress)"

  if [ "$SKIP_SECURITY" = "1" ]; then
    log_warn "Pominięto hardening (--skip-security). To NIE jest zalecane dla LIVE."
    return 0
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log_info "dry-run: security-hardening-baseline.sh --role node --dry-run"
    log_info "dry-run: security-egress-lockdown.sh --role node --dry-run"
    return 0
  fi

  if bash "$SCRIPT_DIR/security-hardening-baseline.sh" --role node; then
    log_ok "security-hardening-baseline.sh zakończony"
  else
    log_fail "security-hardening-baseline.sh zakończony błędem"
    return 1
  fi

  if bash "$SCRIPT_DIR/security-egress-lockdown.sh" --role node --apply; then
    log_ok "security-egress-lockdown.sh --apply zakończony"
  else
    log_fail "security-egress-lockdown.sh --apply zakończony błędem"
    return 1
  fi

  # Incydent Hetzner 2026-06-11: detektor wychodzącego skanu z auto-blockiem.
  if [ -f "$SCRIPT_DIR/security-outbound-scan-detect.sh" ]; then
    if bash "$SCRIPT_DIR/security-outbound-scan-detect.sh" --install --block; then
      log_ok "security-outbound-scan-detect.sh zainstalowany (timer 1 min, auto-block)"
    else
      log_warn "security-outbound-scan-detect.sh — instalacja nieudana (sprawdź ręcznie)"
    fi
  fi

  # O-2: worker migracji od konkurencji (lease + rsync/mysql/imap/wp-cli na węźle).
  # `--install` dociąga też zależności transferu: rsync, sshpass, lftp, imapsync,
  # wp-cli, klient mysql (ensure_deps). Dzięki temu nowy węzeł jest gotowy do
  # przyjmowania migracji od razu po onboardzie — bez ręcznej instalacji narzędzi.
  if [ -f "$SCRIPT_DIR/node-migration-worker.sh" ]; then
    if bash "$SCRIPT_DIR/node-migration-worker.sh" --install; then
      log_ok "node-migration-worker.sh zainstalowany (timer 2 min)"
      # Weryfikacja narzędzi transferu — brak = migracje danego typu będą się
      # zgłaszać jako retryable-fail i trafią do kolejki „Pilne”.
      MIG_MISSING=""
      for tool in jq curl rsync sshpass lftp mysql imapsync wp; do
        command -v "$tool" >/dev/null 2>&1 || MIG_MISSING="$MIG_MISSING $tool"
      done
      if [ -n "$MIG_MISSING" ]; then
        log_warn "Migrator — brak narzędzi:$MIG_MISSING (doinstaluj ręcznie; EPEL wymagany dla imapsync/sshpass)"
      else
        log_ok "Migrator — komplet narzędzi transferu (rsync/sshpass/lftp/imapsync/wp-cli/mysql)"
      fi
    else
      log_warn "node-migration-worker.sh — instalacja nieudana (sprawdź jq/rsync/lftp/imapsync/wp-cli)"
    fi
  fi

  # B-1 LIVE: backupy off-node (offsite). Timer instalujemy zawsze; pierwszy
  # przebieg wymaga /etc/verris-backup.conf + rclone.conf (sekrety na węźle).
  if [ -f "$SCRIPT_DIR/node-offsite-backup.sh" ]; then
    if bash "$SCRIPT_DIR/node-offsite-backup.sh" --install; then
      log_ok "node-offsite-backup.sh zainstalowany (timer 03:30)"
      [ -r /etc/verris-backup.conf ] || log_warn "Utwórz /etc/verris-backup.conf + rclone.conf, inaczej backup offsite nie wystartuje"
    else
      log_warn "node-offsite-backup.sh — instalacja nieudana"
    fi
  fi
}

da_ip_registered() {
  local ip="$1"
  local ips_dir="/usr/local/directadmin/data/admin/ips"
  [ -d "$ips_dir" ] || return 1
  # Pliki w katalogu ips/ lub zawartość
  if [ -f "$ips_dir/$ip" ] || grep -rqF "$ip" "$ips_dir/" 2>/dev/null; then
    return 0
  fi
  return 1
}

ensure_da_ip() {
  log_step "2/4 DirectAdmin — IP i pakiety planów"

  if [ "$SKIP_DA" = "1" ]; then
    log_info "Pominięto (--skip-da)"
    return 0
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log_info "dry-run: sprawdzenie IP $PUBLIC_IP w DA + sync pakietów starter/pro/business"
    return 0
  fi

  if da_ip_registered "$PUBLIC_IP"; then
    log_ok "IP $PUBLIC_IP już zarejestrowane w DirectAdmin"
  else
    log_info "Rejestracja IP $PUBLIC_IP w DirectAdmin (shared)..."
    if /usr/local/directadmin/directadmin ip add "$PUBLIC_IP" 2>/dev/null; then
      log_ok "directadmin ip add $PUBLIC_IP"
    elif echo -e "action=add\nvalue=$PUBLIC_IP\nnetmask=255.255.255.255" \
      | /usr/local/directadmin/directadmin c 2>/dev/null; then
      log_ok "directadmin c add IP $PUBLIC_IP"
    else
      log_warn "Nie udało się automatycznie dodać IP — dodaj ręcznie w DA Admin → IP Management"
      log_info "  echo -e 'action=add\\nvalue=$PUBLIC_IP\\netmask=255.255.255.255' | directadmin c"
    fi
  fi

  if [ -n "${DA_KEY:-}" ] && [ -n "${DA_USER:-}" ]; then
    export DA_HOST="${DA_HOST:-127.0.0.1}"
    export DA_PORT="${DA_PORT:-2222}"
    export DA_SECURE="${DA_SECURE:-yes}"
    log_info "Sync pakietów DA (starter, pro, business)..."
    if bash "$SCRIPT_DIR/node-da-sync-plan-packages.sh"; then
      log_ok "Pakiety planów zsynchronizowane"
    else
      log_fail "Sync pakietów DA nie powiódł się"
    fi
  else
    log_warn "Pomiń sync pakietów — ustaw DA_USER + DA_KEY (login key admina) i uruchom:"
    log_info "  export DA_USER=admin DA_KEY='...' && bash $SCRIPT_DIR/node-da-sync-plan-packages.sh"
    log_info "API może też tworzyć pakiety przy provisioningu (ensureUserPackage), ale pre-sync jest szybszy."
  fi

  # Weryfikacja admin API (opcjonalna)
  if [ -n "${DA_KEY:-}" ] && [ -n "${DA_USER:-}" ]; then
    local proto=https auth base
    [ "${DA_SECURE:-yes}" = "no" ] && proto=http
    auth="$(printf '%s:%s' "$DA_USER" "$DA_KEY" | base64 | tr -d '\n')"
    base="${proto}://${DA_HOST:-127.0.0.1}:${DA_PORT:-2222}"
    if curl -fsS -k -H "Authorization: Basic ${auth}" "$base/CMD_API_PACKAGES_USER" >/dev/null 2>&1; then
      log_ok "Admin DA API (packages) odpowiada"
    else
      log_warn "Admin DA API test nie powiódł się — sprawdź login key w panelu admin"
    fi
  fi
}

run_live_readiness() {
  log_step "3/4 LIVE readiness (agent + profil + weryfikacja)"

  if [ "$SKIP_READINESS" = "1" ]; then
    log_info "Pominięto (--skip-readiness)"
    return 0
  fi

  local args=()
  [ "$DRY_RUN" = "1" ] && args+=(--dry-run)
  [ "$GOVERNOR_ONLY" = "1" ] && args+=(--governor-only)

  if bash "$SCRIPT_DIR/node-live-readiness.sh" "${args[@]}"; then
    log_ok "node-live-readiness.sh zakończony"
  else
    log_fail "node-live-readiness.sh zakończony błędem"
    return 1
  fi
}

print_admin_checklist() {
  log_step "4/4 Checklist panel admin"

  # shellcheck disable=SC1090
  source /etc/verris.conf 2>/dev/null || true

  echo ""
  echo "============================================"
  echo " Verris node onboard — $TS"
  echo " Log: $LOG"
  echo " Server ID: ${VERRIS_SERVER_ID:-?}"
  echo " Public IP: $PUBLIC_IP"
  echo " Panel DA (klient): https://${PUBLIC_IP}:2222"
  echo "============================================"

  if [ "$FAIL" -eq 0 ]; then
    echo ""
    echo "[OK] Węzeł gotowy pod LIVE provisioning."
    echo ""
    echo "Panel admin — dokończ konfigurację:"
    echo "  1. Węzeł → DirectAdmin: Host=$PUBLIC_IP, Port=2222, User=admin, Login Key, TLS=ON"
    echo "  2. Test połączenia DA (zielony)"
    echo "  3. Status węzła ACTIVE + hostname node-XX.verris.pl + rekord A w OVH"
    echo "  4. Wildcard TLS — automatycznie z control-plane (bootstrap dodaje klucz SSH)"
    echo "       bash /opt/verris/ops/scripts/verris-node-wildcard-tls.sh --deploy-only --node=HOSTNAME"
    echo "     (patrz ops/docs/NODE_WILDCARD_TLS.md)"
    echo ""
    echo "Diagnostyka na węźle:"
    echo "  tail -f /var/log/verris-tasks.log"
    echo "  dbctl list"
    echo "  systemctl status verris-tasks.timer verris-agent.timer"
    return 0
  fi

  echo ""
  echo "[FAIL] Onboard nie zakończony — napraw pozycje [FAIL] powyżej."
  echo "Runbook: ops/docs/NODE_ONBOARD_RUNBOOK.md"
  return 1
}

main() {
  echo "=== Verris node onboard LIVE ==="
  echo "Start: $TS"
  echo "Script dir: $SCRIPT_DIR"
  echo "Log: $LOG"

  require_root
  require_bundle_scripts
  preflight_stack
  run_security_hardening
  require_verris_conf
  ensure_da_ip
  run_live_readiness
  print_admin_checklist
}

main "$@"
