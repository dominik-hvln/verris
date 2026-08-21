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
 */
export function buildNodeBootstrapScript(input: {
  apiBaseUrl: string;
  bootstrapToken: string;
  serverId: string;
  /** Klucze licencyjne (odszyfrowane) — puste = faza pominięta z instrukcją. */
  daLicenseKey?: string | null;
  clActivationKey?: string | null;
  lsSerial?: string | null;
}): string {
  const api = input.apiBaseUrl.replace(/\/$/, '');
  const clean = (s: string | null | undefined) => (s ?? '').replace(/['"\\\n\r]/g, '').trim();
  const tok = clean(input.bootstrapToken);
  const sid = clean(input.serverId);
  const daKey = clean(input.daLicenseKey);
  const clKey = clean(input.clActivationKey);
  const lsSerial = clean(input.lsSerial);

  return `#!/usr/bin/env bash
# Verris — wznawialny bootstrap węzła (reboot-safe). Wygenerowany automatycznie.
# Komendy zgodne z oficjalną dokumentacją DirectAdmin / CloudLinux / LiteSpeed.
set -uo pipefail

API_BASE='${api}'
BOOTSTRAP_TOKEN='${tok}'
SERVER_ID='${sid}'
DA_LICENSE='${daKey}'
CL_ACTIVATION_KEY='${clKey}'
LS_SERIAL='${lsSerial}'
AGENT_SCRIPT_URL="$API_BASE/agent/nodes/bootstrap/agent-script?token=$BOOTSTRAP_TOKEN"

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
get_phase() { cat "$STATE_FILE" 2>/dev/null || echo PENDING; }
fail() { report "$1" FAILED "\${2:-}"; exit 1; }

install_self() {
  cp -f "$0" "$RUNNER" 2>/dev/null || curl -fsS "$API_BASE/agent/nodes/bootstrap/script?token=$BOOTSTRAP_TOKEN" -o "$RUNNER"
  chmod 0700 "$RUNNER"
  cat > "$UNIT" <<'EOUNIT'
[Unit]
Description=Verris node bootstrap (resumable)
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/verris-bootstrap run
RemainAfterExit=no
[Install]
WantedBy=multi-user.target
EOUNIT
  systemctl daemon-reload
  systemctl enable verris-bootstrap.service >/dev/null 2>&1 || true
  [ -f "$STATE_FILE" ] || set_phase PREFLIGHT
  exec "$RUNNER" run
}

finish() {
  set_phase DONE
  report DONE OK "bootstrap zakończony"
  systemctl disable verris-bootstrap.service >/dev/null 2>&1 || true
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
  report PREFLIGHT OK
  set_phase CLOUDLINUX
}

phase_cloudlinux() {
  report CLOUDLINUX STARTED
  if uname -r | grep -qi lve; then
    touch "$STATE_DIR/.cloudlinux-done"
    report CLOUDLINUX OK "kernel LVE już aktywny"; set_phase DA; return
  fi
  if [ -z "$CL_ACTIVATION_KEY" ]; then
    # Brak klucza — pomijamy (wizard poda instrukcję ręcznej konwersji).
    report CLOUDLINUX OK "pominięto — brak klucza aktywacyjnego CloudLinux"; set_phase DA; return
  fi
  # Oficjalna konwersja CloudLinux (repo.cloudlinux.com) — wymaga rebootu.
  cd "$STATE_DIR"
  wget -q https://repo.cloudlinux.com/cloudlinux/sources/cln/cldeploy -O cldeploy || fail CLOUDLINUX "pobranie cldeploy nie powiodło się"
  sh cldeploy -k "$CL_ACTIVATION_KEY" || fail CLOUDLINUX "cldeploy zwrócił błąd"
  set_phase DA
  report CLOUDLINUX REBOOT "restart po instalacji kernela CloudLinux (wznowię automatycznie)"
  sync; systemctl reboot; exit 0
}

phase_da() {
  report DA STARTED
  if [ -d /usr/local/directadmin ]; then
    report DA OK "DirectAdmin już zainstalowany"; set_phase STACK; return
  fi
  [ -n "$DA_LICENSE" ] || fail DA "brak klucza licencyjnego DirectAdmin"
  # Oficjalny instalator CLI DirectAdmin (domyślna konfiguracja).
  sh <(curl -fsSL https://download.directadmin.com/setup.sh) "$DA_LICENSE" || fail DA "instalator DA zwrócił błąd"
  [ -d /usr/local/directadmin ] || fail DA "DA nie zainstalował się poprawnie"
  report DA OK
  set_phase STACK
}

phase_stack() {
  report STACK STARTED
  CB=/usr/local/directadmin/custombuild
  if [ ! -d "$CB" ]; then report STACK OK "brak CustomBuild — pomijam"; set_phase AGENT; return; fi
  cd "$CB"
  if [ -z "$LS_SERIAL" ]; then
    report STACK OK "pominięto LiteSpeed — brak seriala; działa domyślny serwer WWW"
    set_phase AGENT; return
  fi
  # LiteSpeed przez CustomBuild (oficjalna metoda dla DirectAdmin).
  ./build update >/dev/null 2>&1 || true
  ./build set webserver litespeed >/dev/null 2>&1 || fail STACK "build set webserver litespeed"
  ./build set litespeed_serial "$LS_SERIAL" >/dev/null 2>&1 || fail STACK "build set litespeed_serial"
  ./build litespeed || fail STACK "build litespeed"
  ./build rewrite_confs >/dev/null 2>&1 || true
  report STACK OK "LiteSpeed zainstalowany"
  set_phase AGENT
}

phase_agent() {
  report AGENT STARTED
  # Delegacja do ISTNIEJĄCEGO, sprawdzonego skryptu Verris: handshake z
  # control-plane (/servers/handshake), zapis identity do /etc/verris.conf,
  # instalacja agenta LVE + timer telemetrii. Bez duplikacji logiki.
  if ! curl -fsS -m 60 "$AGENT_SCRIPT_URL" -o "$STATE_DIR/agent-install.sh"; then
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
  return `curl -fsS '${api}/agent/nodes/bootstrap/script?token=${tok}' | bash`;
}
