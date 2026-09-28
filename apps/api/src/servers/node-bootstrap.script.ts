/**
 * NODE-2/5 — Generator wznawialnego skryptu bootstrapu węzła (odpornego na
 * restarty). Instaluje na węźle usługę systemd `verris-bootstrap` typu oneshot,
 * która uruchamia się PRZY KAŻDYM STARCIE, wykonuje kolejną fazę z pliku stanu
 * i ponownie się uzbraja — aż do DONE. Reboot po CloudLinux nie przerywa
 * procesu: po powrocie oneshot wznawia od kolejnej fazy.
 *
 * Komendy są zgodne z OFICJALNĄ dokumentacją producentów (zweryfikowane):
 *   - CloudLinux (konwersja): repo.cloudlinux.com/.../cldeploy + `sh cldeploy -k <key>` + reboot
 *   - DirectAdmin (instalator CLI): `sh <(curl -fsSL https://download.directadmin.com/setup.sh) '<license>'`
 *   - LiteSpeed (przez CustomBuild): `./build set webserver litespeed` + serial + `./build litespeed`
 * Faza AGENT deleguje do ISTNIEJĄCEGO, sprawdzonego skryptu handshake+agent
 * (renderBootstrapScript) — bez duplikacji. OVH NS glue + pakiety DA odpala
 * control-plane po raporcie fazy CANARY.
 *
 * Fazy: PREFLIGHT → CLOUDLINUX(+reboot) → DA → STACK(LiteSpeed) → AGENT → CANARY → DONE
 *
 * PB-29/PB-30:
 *  - klucze licencyjne NIE są w treści skryptu — skrypt pobiera je POST-em z nagłówkiem tokenu
 *    (/agent/nodes/bootstrap/secrets, wpis w audycie), trzyma tylko w pamięci i nie zapisuje na dysk;
 *  - manifest stosu (/etc/verris-stack.env) ląduje na węźle przed instalacją DirectAdmin i ustala
 *    kanał/build DA, PHP i MariaDB — każdy węzeł instaluje to samo;
 *  - CloudLinux wykrywany przez /proc/lve i `cldetect` (od CL9 jądro nie ma „lve” w nazwie);
 *  - po DONE skrypt z tokenem jest usuwany z dysku.
 */
export function buildNodeBootstrapScript(input: {
  apiBaseUrl: string;
  bootstrapToken: string;
  serverId: string;
  /** Treść /etc/verris-stack.env (stosJakoEnv) — bez sekretów. */
  stackEnv: string;
  /** Nazwa hosta z kreatora (FQDN) — ustawiana w PREFLIGHT i przekazywana instalatorowi DA. */
  hostname?: string | null;
}): string {
  const api = input.apiBaseUrl.replace(/\/$/, '');
  const clean = (s: string | null | undefined) => (s ?? '').replace(/['"\\\n\r]/g, '').trim();
  const tok = clean(input.bootstrapToken);
  const sid = clean(input.serverId);
  const host = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(clean(input.hostname)) ? clean(input.hostname) : '';
  const stackEnv = input.stackEnv.replace(/^EOSTACK$/gm, '');

  return `#!/usr/bin/env bash
# Verris — wznawialny bootstrap węzła (reboot-safe). Wygenerowany automatycznie.
# Komendy zgodne z oficjalną dokumentacją DirectAdmin / CloudLinux / LiteSpeed.
set -uo pipefail

API_BASE='${api}'
BOOTSTRAP_TOKEN='${tok}'
SERVER_ID='${sid}'
NODE_HOSTNAME='${host}'
# Klucze licencyjne: tylko w pamięci, pobierane przez load_secrets().
DA_LICENSE=''
CL_ACTIVATION_KEY=''
LS_SERIAL=''

STATE_DIR=/var/lib/verris
STATE_FILE="$STATE_DIR/bootstrap.state"
RUNNER=/usr/local/sbin/verris-bootstrap
UNIT=/etc/systemd/system/verris-bootstrap.service
mkdir -p "$STATE_DIR"

report() { # phase status [message]
  curl -fsS -m 15 -X POST "$API_BASE/agent/nodes/bootstrap/report" \\
    -H 'Content-Type: application/json' -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" \\
    --data "{\\"serverId\\":\\"$SERVER_ID\\",\\"phase\\":\\"$1\\",\\"status\\":\\"$2\\",\\"message\\":\\"\${3:-}\\"}" \\
    >/dev/null 2>&1 || true
}
set_phase() { echo "$1" > "$STATE_FILE"; }

# PB-30 — manifest stosu floty (ten sam na każdym węźle; agent zadań odświeża go później).
write_stack_env() {
  umask 022
  cat > /etc/verris-stack.env <<'EOSTACK'
${stackEnv}
EOSTACK
}

# PB-29 — klucze licencyjne POST-em z nagłówkiem (nie w URL, nie w treści skryptu, nie na dysku).
load_secrets() {
  [ -n "\${SECRETS_LOADED:-}" ] && return 0
  local out
  # Retry: po restarcie (CloudLinux) sieć/DNS może jeszcze nie odpowiadać, a porażka zatrzymuje fazę do kolejnego bootu.
  out="$(curl -fsS -m 20 --retry 10 --retry-delay 6 --retry-all-errors -X POST -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" "$API_BASE/agent/nodes/bootstrap/secrets")" || return 1
  DA_LICENSE="$(printf '%s\\n' "$out" | sed -n 's/^DA_LICENSE=//p' | head -1)"
  CL_ACTIVATION_KEY="$(printf '%s\\n' "$out" | sed -n 's/^CL_ACTIVATION_KEY=//p' | head -1)"
  LS_SERIAL="$(printf '%s\\n' "$out" | sed -n 's/^LS_SERIAL=//p' | head -1)"
  SECRETS_LOADED=1
}

# CloudLinux OS 9+ ma jądro AlmaLinux (bez „lve” w nazwie) — oficjalnie: cldetect; /proc/lve = LVE działa.
cloudlinux_converted() { command -v cldetect >/dev/null 2>&1 && cldetect --detect-edition >/dev/null 2>&1; }
lve_active() { [ -e /proc/lve/list ]; }
da_installed() { [ -x /usr/local/directadmin/directadmin ] && [ -f /usr/local/directadmin/conf/directadmin.conf ]; }
get_phase() { cat "$STATE_FILE" 2>/dev/null || echo PENDING; }
fail() { report "$1" FAILED "\${2:-}"; exit 1; }

install_self() {
  # Przy \`curl … | bash\` $0 to „bash” — wtedy pobieramy skrypt jeszcze raz.
  if [ -f "$0" ] && [ "$(basename "$0")" != "bash" ]; then cp -f "$0" "$RUNNER"; else
    curl -fsS -m 60 -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" "$API_BASE/agent/nodes/bootstrap/script" -o "$RUNNER" \\
      || { echo "[verris] nie udało się pobrać skryptu bootstrapu" >&2; exit 1; }
  fi
  chmod 0700 "$RUNNER"
  # HOME: fazy po restarcie działają pod systemd (bez HOME) — instalatory DA/CustomBuild go oczekują.
  cat > "$UNIT" <<'EOUNIT'
[Unit]
Description=Verris node bootstrap (resumable)
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
Environment=HOME=/root
ExecStart=/usr/local/sbin/verris-bootstrap run
RemainAfterExit=no
[Install]
WantedBy=multi-user.target
EOUNIT
  systemctl daemon-reload
  systemctl enable verris-bootstrap.service >/dev/null 2>&1 || true
  [ -f "$STATE_FILE" ] || set_phase PREFLIGHT
  write_stack_env
  # Start przez systemd, nie w sesji SSH: zerwane SSH (SIGHUP) nie przerywa instalacji DA.
  systemctl start --no-block verris-bootstrap.service
  echo "[verris] bootstrap uruchomiony w tle (systemd). Podgląd: journalctl -fu verris-bootstrap"
}

finish() {
  set_phase DONE
  report DONE OK "bootstrap zakończony"
  systemctl disable verris-bootstrap.service >/dev/null 2>&1 || true
  # Skrypt zawiera token bootstrapu — po zakończeniu nie zostaje na dysku.
  rm -f "$RUNNER" "$UNIT" "$STATE_DIR/agent-install.sh" "$STATE_DIR/cldeploy"
  systemctl daemon-reload >/dev/null 2>&1 || true
}

# --- FAZY (idempotentne, check-before-do) -----------------------------------
phase_preflight() {
  report PREFLIGHT STARTED
  [ "$(id -u)" = "0" ] || fail PREFLIGHT "wymagany root"
  command -v curl >/dev/null || fail PREFLIGHT "brak curl"
  command -v systemctl >/dev/null || fail PREFLIGHT "brak systemd"
  # DirectAdmin wymaga CZYSTEGO systemu — inny panel = twardy bloker.
  if [ -d /usr/local/cpanel ] || [ -d /usr/local/psa ]; then
    fail PREFLIGHT "wykryto inny panel (cPanel/Plesk) — DA wymaga czystego OS"
  fi
  timedatectl set-ntp true >/dev/null 2>&1 || true
  if [ -n "$NODE_HOSTNAME" ] && [ "$(hostname -f 2>/dev/null)" != "$NODE_HOSTNAME" ]; then
    hostnamectl set-hostname "$NODE_HOSTNAME" || fail PREFLIGHT "hostnamectl set-hostname $NODE_HOSTNAME"
  fi
  # Obrazy chmurowe (Hetzner Cloud): cloud-init ustawia nazwę hosta i /etc/hosts przy starcie —
  # po restarcie CloudLinux nazwa DA wróciłaby do nazwy serwera z konsoli dostawcy.
  if [ -d /etc/cloud/cloud.cfg.d ]; then
    printf 'preserve_hostname: true\\nmanage_etc_hosts: false\\n' > /etc/cloud/cloud.cfg.d/99-verris-hostname.cfg
  fi
  if [ -n "$NODE_HOSTNAME" ]; then
    local ip4
    ip4="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \\([0-9.]*\\).*/\\1/p' | head -1)"
    if [ -n "$ip4" ] && ! grep -qE "^\${ip4}[[:space:]].*\${NODE_HOSTNAME}" /etc/hosts; then
      echo "$ip4 $NODE_HOSTNAME \${NODE_HOSTNAME%%.*}" >> /etc/hosts
    fi
  fi
  # DirectAdmin: min. 4 GB RAM + 4 GB swap (docs.directadmin.com, System Requirements); obrazy chmurowe nie mają swapu.
  if [ -z "$(swapon --noheadings 2>/dev/null)" ] && [ ! -f /swapfile ]; then
    { fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096; } >/dev/null 2>&1 \\
      && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile \\
      && echo '/swapfile none swap defaults 0 0' >> /etc/fstab \\
      || report PREFLIGHT STARTED "nie udało się utworzyć swapu 4 GB — kontynuuję"
  fi
  # SELinux: CloudLinux „supported on CL8+, but might not work with control panels” — tryb permissive
  # (logi zostają; wyłączenie w pliku configu jest w EL9 przestarzałe).
  if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
    setenforce 0 || true
    sed -i 's/^SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
  fi
  report PREFLIGHT OK
  set_phase CLOUDLINUX
}

phase_cloudlinux() {
  report CLOUDLINUX STARTED
  if lve_active; then
    touch "$STATE_DIR/.cloudlinux-done"
    report CLOUDLINUX OK "CloudLinux aktywny (LVE działa)"; set_phase DA; return
  fi
  if cloudlinux_converted; then
    # Konwersja zrobiona, moduł LVE jeszcze nie załadowany — brakuje restartu.
    set_phase DA
    report CLOUDLINUX REBOOT "CloudLinux zainstalowany, restart ładuje moduł LVE (wznowię automatycznie)"
    sync; systemctl reboot; exit 0
  fi
  load_secrets || fail CLOUDLINUX "nie udało się pobrać kluczy licencyjnych z control-plane"
  if [ -z "$CL_ACTIVATION_KEY" ]; then
    # Brak klucza — pomijamy (wizard poda instrukcję ręcznej konwersji).
    report CLOUDLINUX OK "pominięto — brak klucza aktywacyjnego CloudLinux"; set_phase DA; return
  fi
  # Oficjalna konwersja CloudLinux (repo.cloudlinux.com) — wymaga rebootu.
  cd "$STATE_DIR" || fail CLOUDLINUX "cd $STATE_DIR"
  # curl, nie wget — minimalne/chmurowe obrazy AlmaLinux nie muszą mieć wget (curl sprawdza PREFLIGHT).
  curl -fsSL -m 120 https://repo.cloudlinux.com/cloudlinux/sources/cln/cldeploy -o cldeploy || fail CLOUDLINUX "pobranie cldeploy nie powiodło się"
  sh cldeploy -k "$CL_ACTIVATION_KEY" || fail CLOUDLINUX "cldeploy zwrócił błąd"
  set_phase DA
  report CLOUDLINUX REBOOT "restart po instalacji kernela CloudLinux (wznowię automatycznie)"
  sync; systemctl reboot; exit 0
}

phase_da() {
  report DA STARTED
  if da_installed; then
    report DA OK "DirectAdmin już zainstalowany"; set_phase STACK; return
  fi
  load_secrets || fail DA "nie udało się pobrać kluczy licencyjnych z control-plane"
  [ -n "$DA_LICENSE" ] || fail DA "brak klucza licencyjnego DirectAdmin"
  # PB-30 — wersje z manifestu floty (DirectAdmin „Predefined installation options”):
  # kanał/build DA oraz opcje CustomBuild przez zmienne środowiska przed setup.sh.
  [ -r /etc/verris-stack.env ] || write_stack_env
  # shellcheck disable=SC1091
  . /etc/verris-stack.env
  export DA_CHANNEL="$VERRIS_DA_CHANNEL"
  [ -n "$VERRIS_DA_COMMIT" ] && export DA_COMMIT="$VERRIS_DA_COMMIT"
  [ -n "$NODE_HOSTNAME" ] && export DA_HOSTNAME="$NODE_HOSTNAME"
  export php1_release="$VERRIS_PHP1_RELEASE" mysql_inst=mariadb mariadb="$VERRIS_MARIADB"
  # Domyślnie setup.sh puszcza CustomBuild (PHP, MariaDB, Exim…) W TLE i kończy się od razu —
  # faza STACK ruszyłaby ./build równolegle. Tryb pierwszoplanowy (predefined options DirectAdmin).
  export DA_FOREGROUND_CUSTOMBUILD=yes
  # Bez CSF: na węźle jest firewalld + nftables (egress) + fail2ban (decyzja 28.09). CSF z instalatora DA
  # dołożyłby drugi firewall na iptables — ryzyko odcięcia SSH i rozjazdu reguł.
  export DA_SKIP_CSF=true
  sh <(curl -fsSL https://download.directadmin.com/setup.sh) "$DA_LICENSE" || fail DA "instalator DA zwrócił błąd"
  da_installed || fail DA "DA nie zainstalował się poprawnie"
  report DA OK
  set_phase STACK
}

phase_stack() {
  report STACK STARTED
  CB=/usr/local/directadmin/custombuild
  if [ ! -d "$CB" ]; then report STACK OK "brak CustomBuild — pomijam"; set_phase AGENT; return; fi
  load_secrets || fail STACK "nie udało się pobrać kluczy licencyjnych z control-plane"
  cd "$CB" || fail STACK "cd $CB"
  # Asekuracja: gdyby CustomBuild z instalatora DA nadal działał w tle — czekamy (maks. 3 h).
  local i=0
  while pgrep -f 'custombuild/build' >/dev/null 2>&1 && [ "$i" -lt 360 ]; do sleep 30; i=$((i + 1)); done
  # LiteSpeed przez CustomBuild (docs.directadmin.com → Web services → LiteSpeed):
  #   build set webserver litespeed; build set php1_mode lsphp; build litespeed; build php
  #   licencja: build set litespeed_serialno <serial>. Bez seriala CustomBuild instaluje TRIAL.
  # Faza AGENT wymaga LiteSpeed, więc brak seriala = trial, a nie pominięcie fazy.
  ./build update >/dev/null 2>&1 || true
  ./build set webserver litespeed >/dev/null 2>&1 || fail STACK "build set webserver litespeed"
  ./build set php1_mode lsphp >/dev/null 2>&1 || fail STACK "build set php1_mode lsphp"
  local ls_tryb=trial
  case "$LS_SERIAL" in
    ''|[Tt][Rr][Ii][Aa][Ll]) ;;
    *) ./build set litespeed_serialno "$LS_SERIAL" >/dev/null 2>&1 || fail STACK "build set litespeed_serialno"; ls_tryb=serial ;;
  esac
  ./build litespeed || fail STACK "build litespeed"
  ./build php || fail STACK "build php (lsphp)"
  ./build rewrite_confs >/dev/null 2>&1 || true
  report STACK OK "LiteSpeed zainstalowany (licencja: $ls_tryb)"
  set_phase AGENT
}

phase_agent() {
  report AGENT STARTED
  # Delegacja do ISTNIEJĄCEGO, sprawdzonego skryptu Verris: handshake z
  # control-plane (/servers/handshake), zapis identity do /etc/verris.conf,
  # instalacja agenta LVE + timer telemetrii. Bez duplikacji logiki.
  load_secrets || fail AGENT "nie udało się pobrać kluczy licencyjnych z control-plane"
  if ! curl -fsS -m 60 -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" "$API_BASE/agent/nodes/bootstrap/agent-script" -o "$STATE_DIR/agent-install.sh"; then
    fail AGENT "pobranie skryptu agenta nie powiodło się"
  fi
  export LITESPEED_SERIAL_NO="$LS_SERIAL"
  bash "$STATE_DIR/agent-install.sh" || fail AGENT "instalacja agenta/handshake nie powiodła się"
  report AGENT OK
  set_phase CANARY
}

phase_canary() {
  report CANARY STARTED
  # Control-plane po tym raporcie odpala automatycznie: OVH NS glue oraz
  # zapewnienie pakietów DA (spójne z resztą platformy). Węzeł wchodzi do puli
  # w trybie canary — decyzja o pełnym ruchu należy do admina/panelu.
  report CANARY OK
  finish
}

run() {
  while :; do
    case "$(get_phase)" in
      PENDING|PREFLIGHT) phase_preflight ;;
      CLOUDLINUX)        phase_cloudlinux ;;   # może zrobić reboot i exit 0
      DA)                phase_da ;;
      STACK)             phase_stack ;;
      AGENT)             phase_agent ;;
      CANARY)            phase_canary ;;
      DONE)              break ;;
      *)                 break ;;
    esac
  done
}

case "\${1:-install}" in
  run) run ;;
  *)   install_self ;;
esac
`;
}

/** Jednorazowy one-liner do wklejenia na świeżym serwerze (jako root). */
export function buildNodeBootstrapOneLiner(input: {
  apiBaseUrl: string;
  bootstrapToken: string;
}): string {
  const api = input.apiBaseUrl.replace(/\/$/, '');
  const tok = (input.bootstrapToken ?? '').replace(/['"\\\n\r]/g, '');
  // Token w nagłówku, nie w adresie — nie trafia do logów dostępowych proxy/API.
  return `curl -fsS -H 'X-Bootstrap-Token: ${tok}' '${api}/agent/nodes/bootstrap/script' | bash`;
}
