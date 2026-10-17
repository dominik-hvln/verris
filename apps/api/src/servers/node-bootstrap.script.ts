import { QUOTA_XFS_SH } from './quota-xfs.script.js';
import { TLS_PANELU_SH } from './tls-panelu.script.js';

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
 * Fazy: PREFLIGHT → CLOUDLINUX(+reboot) → QUOTA(+reboot, jeśli potrzebny) → DA → STACK(LiteSpeed) → AGENT → CANARY → TLS → DONE
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
  # Ponowienia (17.10): raport CANARY STARTED uruchamia DNS w OVH, a zgubiony (np. restart API przy wdrożeniu) zostawiał
  # fazę TLS bez rekordu A.
  curl -fsS -m 15 --retry 4 --retry-delay 5 --retry-all-errors -X POST "$API_BASE/agent/nodes/bootstrap/report" \\
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

${QUOTA_XFS_SH}
${TLS_PANELU_SH}
install_self() {
  # 17.10: jednolinijkowiec wklejony drugi raz w trakcie instalacji nadpisywał plik, który bash usługi właśnie czyta
  # (bash czyta skrypt przyrostowo) — usługa wykonywała potem fragment od złego miejsca.
  case "$(systemctl show -p ActiveState --value verris-bootstrap.service 2>/dev/null)" in
    active|activating|reloading)
      echo "[verris] bootstrap już działa w tle — nic nie zmieniam. Podgląd: journalctl -fu verris-bootstrap"
      exit 0 ;;
  esac
  # Przy \`curl … | bash\` $0 to „bash” — wtedy pobieramy skrypt jeszcze raz. Zapis obok i mv (nowy i-węzeł).
  if [ -f "$0" ] && [ "$(basename "$0")" != "bash" ]; then cp -f "$0" "$RUNNER.nowy"; else
    curl -fsS -m 60 -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" "$API_BASE/agent/nodes/bootstrap/script" -o "$RUNNER.nowy" \\
      || { echo "[verris] nie udało się pobrać skryptu bootstrapu" >&2; exit 1; }
  fi
  chmod 0700 "$RUNNER.nowy" && mv -f "$RUNNER.nowy" "$RUNNER"
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
  rm -f "$RUNNER" "$UNIT" "$STATE_DIR/agent-install.sh" "$STATE_DIR/cldeploy" "$STATE_DIR/.quota-restart" "$STATE_DIR/.tls-proby" "$STATE_DIR/.cloudlinux-restart"
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
    # Contabo (13.10, t2): cloud-config z user-data dostawcy (fqdn vmi….contaboserver.net, manage_etc_hosts: true)
    # ma pierwszeństwo przed cloud.cfg.d — po restarcie wracały nazwa hosta „t2” i /etc/hosts z 127.0.0.1 vmi…,
    # a Exim nie znał verris-da-powiadomienia@t2. Moduły nazwy hosta wyłączone: lista cloud_init_modules
    # z cloud.cfg bez set_hostname, update_hostname, update_etc_hosts
    # (https://docs.cloud-init.io/en/latest/reference/modules.html).
    python3 - "\${CLOUD_CFG:-/etc/cloud/cloud.cfg}" "\${CLOUD_CFG_D:-/etc/cloud/cloud.cfg.d}/99-verris-zz-bez-hostname.cfg" <<'PYCC' || true
import sys, yaml
c = yaml.safe_load(open(sys.argv[1])) or {}
pomin = {'set_hostname', 'update_hostname', 'update_etc_hosts'}
mods = [m for m in (c.get('cloud_init_modules') or []) if (m if isinstance(m, str) else m[0]) not in pomin]
if mods:
    open(sys.argv[2], 'w').write(yaml.safe_dump({'cloud_init_modules': mods}))
PYCC
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
  # Quota XFS ustawiona już tu, żeby zadziałała po restarcie CloudLinux (faza QUOTA sprawdza i w razie potrzeby restartuje).
  wlacz_quota_xfs /home >/dev/null 2>&1 || true
  report PREFLIGHT OK
  set_phase CLOUDLINUX
}

# 17.10: po restarcie wracamy do fazy CLOUDLINUX (nie od razu QUOTA) — dotąd nikt nie sprawdzał, czy LVE po restarcie
# działa, a węzeł bez LVE przechodził dalej (faza AGENT sprawdza tylko obecność narzędzi). Jeden restart; gdy po nim
# LVE dalej nie działa — błąd fazy zamiast pętli restartów.
phase_cloudlinux() {
  report CLOUDLINUX STARTED
  # Po restarcie usługa może wystartować przed załadowaniem modułu LVE (kolejność usług) — czekamy do 2 min.
  if [ -f "$STATE_DIR/.cloudlinux-restart" ]; then
    local i
    for i in $(seq 1 24); do lve_active && break; sleep 5; done
  fi
  if lve_active; then
    touch "$STATE_DIR/.cloudlinux-done"
    rm -f "$STATE_DIR/.cloudlinux-restart"
    report CLOUDLINUX OK "CloudLinux aktywny (LVE działa)"; set_phase QUOTA; return
  fi
  if cloudlinux_converted; then
    [ -f "$STATE_DIR/.cloudlinux-restart" ] && fail CLOUDLINUX "CloudLinux zainstalowany, ale LVE nie działa po restarcie (sprawdź jądro: uname -r, cldetect)"
    # Konwersja zrobiona, moduł LVE jeszcze nie załadowany — brakuje restartu.
    touch "$STATE_DIR/.cloudlinux-restart"
    set_phase CLOUDLINUX
    report CLOUDLINUX REBOOT "CloudLinux zainstalowany, restart ładuje moduł LVE (wznowię automatycznie)"
    sync; systemctl reboot; exit 0
  fi
  load_secrets || fail CLOUDLINUX "nie udało się pobrać kluczy licencyjnych z control-plane"
  if [ -z "$CL_ACTIVATION_KEY" ]; then
    # Brak klucza — pomijamy (wizard poda instrukcję ręcznej konwersji).
    report CLOUDLINUX OK "pominięto — brak klucza aktywacyjnego CloudLinux"; set_phase QUOTA; return
  fi
  # Oficjalna konwersja CloudLinux (repo.cloudlinux.com) — wymaga rebootu.
  cd "$STATE_DIR" || fail CLOUDLINUX "cd $STATE_DIR"
  # curl, nie wget — minimalne/chmurowe obrazy AlmaLinux nie muszą mieć wget (curl sprawdza PREFLIGHT).
  curl -fsSL -m 120 https://repo.cloudlinux.com/cloudlinux/sources/cln/cldeploy -o cldeploy || fail CLOUDLINUX "pobranie cldeploy nie powiodło się"
  sh cldeploy -k "$CL_ACTIVATION_KEY" || fail CLOUDLINUX "cldeploy zwrócił błąd"
  touch "$STATE_DIR/.cloudlinux-restart"
  set_phase CLOUDLINUX
  report CLOUDLINUX REBOOT "restart po instalacji kernela CloudLinux (wznowię automatycznie)"
  sync; systemctl reboot; exit 0
}

# Bez quota DirectAdmin nie egzekwuje dysku kont (t2, 13.10: XFS z noquota na /). Jeden restart wznawiany przez
# systemd; gdy po nim quota dalej nie działa — błąd fazy zamiast węzła bez limitów dysku.
phase_quota() {
  report QUOTA STARTED
  local kod=0
  wlacz_quota_xfs /home || kod=$?
  case "$kod" in
    0)  rm -f "$STATE_DIR/.quota-restart"; report QUOTA OK "quota XFS aktywna"; set_phase DA ;;
    2)  report QUOTA OK "system plików inny niż XFS — quota sprawdza profil hostingowy"; set_phase DA ;;
    10) [ -f "$STATE_DIR/.quota-restart" ] && fail QUOTA "quota XFS nieaktywna mimo restartu (rootflags=uquota,pquota / fstab)"
        touch "$STATE_DIR/.quota-restart"
        report QUOTA REBOOT "restart włącza quota XFS (wznowię automatycznie)"
        sync; systemctl reboot; exit 0 ;;
    *)  fail QUOTA "nie udało się ustawić quota XFS (grubby / fstab)" ;;
  esac
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
  [ -r /etc/verris-stack.env ] || write_stack_env
  # shellcheck disable=SC1091
  . /etc/verris-stack.env
  ./build set webserver "$VERRIS_WEBSERVER" >/dev/null 2>&1 || fail STACK "build set webserver $VERRIS_WEBSERVER"
  ./build set php1_mode lsphp >/dev/null 2>&1 || fail STACK "build set php1_mode lsphp"
  local ls_tryb=trial
  case "$LS_SERIAL" in
    ''|[Tt][Rr][Ii][Aa][Ll]) ;;
    *) ./build set litespeed_serialno "$LS_SERIAL" >/dev/null 2>&1 || fail STACK "build set litespeed_serialno"; ls_tryb=serial ;;
  esac
  ./build litespeed || fail STACK "build litespeed"
  ./build php || fail STACK "build php (lsphp)"
  ./build rewrite_confs >/dev/null 2>&1 || true
  # Stos zainstalowany z manifestu → wersja zastosowana (raportuje ją verris-lve.sh; zgodność floty w panelu).
  grep '^VERRIS_STACK_VERSION=' /etc/verris-stack.env > /etc/verris-stack.applied 2>/dev/null && chmod 0644 /etc/verris-stack.applied || true
  report STACK OK "LiteSpeed zainstalowany (licencja: $ls_tryb)"
  set_phase AGENT
}

phase_agent() {
  report AGENT STARTED
  # Delegacja do ISTNIEJĄCEGO, sprawdzonego skryptu Verris: handshake z
  # control-plane (/servers/handshake), zapis identity do /etc/verris.conf,
  # instalacja agenta LVE + timer telemetrii. Bez duplikacji logiki.
  # 17.10: po udanym handshake token jest zużyty (/secrets i /agent-script dają 401) — ponowienie fazy uruchamia
  # zachowany skrypt agenta bez handshake, zamiast kończyć się błędem wymagającym nowego jednolinijkowca.
  if grep -q '^VERRIS_IDENTITY_TOKEN=' /etc/verris.conf 2>/dev/null && [ -s "$STATE_DIR/agent-install.sh" ]; then
    VERRIS_POMIN_HANDSHAKE=1 bash "$STATE_DIR/agent-install.sh" || fail AGENT "instalacja agenta (ponowienie po handshake) nie powiodła się"
    report AGENT OK
    set_phase CANARY
    return
  fi
  load_secrets || fail AGENT "nie udało się pobrać kluczy licencyjnych z control-plane"
  if ! curl -fsS -m 60 -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" "$API_BASE/agent/nodes/bootstrap/agent-script" -o "$STATE_DIR/agent-install.sh"; then
    fail AGENT "pobranie skryptu agenta nie powiodło się"
  fi
  chmod 0600 "$STATE_DIR/agent-install.sh"
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
  set_phase TLS
}

# PB-31: świeży DirectAdmin ma ssl=0 (panel po czystym HTTP). Rekord A nazwy węzła zakłada control-plane po raporcie
# CANARY, więc certyfikat dopiero teraz. Błąd zostawia fazę TLS: ponowienie — systemctl start verris-bootstrap.
phase_tls() {
  report TLS STARTED
  # Tylko nazwa z kreatora: hostname -f na obrazie dostawcy to np. vmi….contaboserver.net — certyfikat na nią nic nie da.
  local host="$NODE_HOSTNAME" kod=0
  [ -n "$host" ] || fail TLS "brak nazwy hosta z kreatora — certyfikatu panelu nie da się wydać"
  wlacz_tls_panelu "$host" || kod=$?
  if [ "$kod" = 0 ]; then report TLS OK "HTTPS panelu z certyfikatem dla $host"; finish; return; fi
  # 17.10: ponowienie bez SSH — systemd sam uruchomi bootstrap ponownie (stan zostaje TLS, raport TLS STARTED
  # ponawia też DNS w OVH). Po błędzie Let's Encrypt dłuższa przerwa (limit nieudanych walidacji na godzinę).
  local proba powod odstep=20min
  proba=$(( $(cat "$STATE_DIR/.tls-proby" 2>/dev/null || echo 0) + 1 ))
  echo "$proba" > "$STATE_DIR/.tls-proby"
  case "$kod" in
    3) powod="rekord A $host nie wskazuje węzła" ;;
    4) powod="brak dig (bind-utils) i nie udało się go zainstalować" ;;
    *) powod="certyfikat panelu dla $host nie wydany (port 80, rekord A)"; odstep=65min ;;
  esac
  if [ "$proba" -lt "\${TLS_MAX_PROB:-4}" ] &&
    systemd-run --quiet --unit="verris-bootstrap-ponow-$proba" --on-active="$odstep" systemctl start verris-bootstrap.service >/dev/null 2>&1; then
    fail TLS "$powod — ponowię automatycznie za $odstep (próba $proba z \${TLS_MAX_PROB:-4})"
  fi
  fail TLS "$powod — po $proba próbach; ponów: systemctl start verris-bootstrap"
}

run() {
  while :; do
    case "$(get_phase)" in
      PENDING|PREFLIGHT) phase_preflight ;;
      CLOUDLINUX)        phase_cloudlinux ;;   # może zrobić reboot i exit 0
      QUOTA)             phase_quota ;;        # jw.
      DA)                phase_da ;;
      STACK)             phase_stack ;;
      AGENT)             phase_agent ;;
      CANARY)            phase_canary ;;
      TLS)               phase_tls ;;
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
