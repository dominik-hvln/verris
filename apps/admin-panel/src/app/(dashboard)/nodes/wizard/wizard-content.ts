/** Treści kroków wizarda węzła compute — operator runbook (GO-HOST). */

export type WizardStepId =
  | "requirements"
  | "cloudlinux"
  | "directadmin"
  | "litespeed"
  | "bootstrap"
  | "approve-da"
  | "backup-offsite"
  | "onboard-live"
  | "hosting-profile"
  | "finish";

export type WizardStep = {
  id: WizardStepId;
  title: string;
  subtitle: string;
};

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "requirements",
    title: "Wymagania",
    subtitle: "OS, sieć i zasoby przed licencjami",
  },
  {
    // NODE-01 — jedna ścieżka: kreator tworzy rekord i prowadzi przez wznawialny bootstrap v2
    // (CloudLinux → DirectAdmin → LiteSpeed → agent → canary). Ręczne komendy zostają jako awaryjne.
    id: "bootstrap",
    title: "Instalacja (bootstrap v2)",
    subtitle: "Rekord w panelu, licencje, jeden skrypt wznawialny po restarcie",
  },
  {
    id: "approve-da",
    title: "Akceptacja i DA API",
    subtitle: "Panel admin → login key",
  },
  {
    id: "backup-offsite",
    title: "Backup offsite",
    subtitle: "Storage Box i szyfrowanie raz dla floty — węzeł pobierze je sam",
  },
  {
    id: "onboard-live",
    title: "Onboard LIVE",
    subtitle: "Z panelu: hardening, egress, kopie, IP i pakiety DA, raport gotowości",
  },
  {
    id: "hosting-profile",
    title: "Profil hostingowy",
    subtitle: "Governor, poczta, FTP, LS + strona domyślna Verris",
  },
  {
    id: "finish",
    title: "Gotowe",
    subtitle: "Probes i smoke provisioning",
  },
];

export const INSTALL_OS_PREP = `# 0) AlmaLinux 9.x lub 10.2 — minimal install, potem jako root:
hostnamectl set-hostname node-pl-01.example.com   # dostosuj
dnf -y update
dnf -y install wget curl tar tmux
timedatectl set-timezone Europe/Warsaw
# Firewall (przykład): publiczne 80/443/2222 tylko jeśli potrzebne; SSH ogranicz do swojego IP
# firewall-cmd --permanent --add-service=ssh && firewall-cmd --reload`;

export const INSTALL_CLOUDLINUX_AL10 = `# 1) CloudLinux 10 — konwersja z AlmaLinux 10.2 (trial / klucz aktywacji)
#    Dokumentacja: https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_installation/
dnf -y install wget
wget https://repo.cloudlinux.com/cloudlinux/sources/cln/cldeploy
chmod +x cldeploy

# Trial lub płatny klucz z CloudLinux Network (CLN):
./cldeploy -k TWÓJ_KLUCZ_AKTYWACJI_CLOUDLINUX

# Alternatywa: licencja przypięta do IP (jeśli masz taką umowę):
# ./cldeploy -i

# Po zakończeniu — reboot (nowy kernel CL):
reboot

# Po reboot — weryfikacja:
cldetect --help
lveinfo --help
cloudlinux-statistic --help 2>/dev/null || true

# MySQL Governor — instaluje profil hostingowy (krok „Profil hostingowy” kreatora / panel admin)
# po DirectAdmin. Ręcznie: ops/scripts/node-cloudlinux-governor.sh`;

export const INSTALL_CLOUDLINUX_AL9 = `# 1) CloudLinux 9 — konwersja z AlmaLinux 9.x (alternatywa, bardziej dojrzały stack)
dnf -y install wget
wget https://repo.cloudlinux.com/cloudlinux/sources/cln/cldeploy
chmod +x cldeploy
./cldeploy -k TWÓJ_KLUCZ_AKTYWACJI_CLOUDLINUX
reboot
# Po reboot: lveinfo --help`;

export const INSTALL_DIRECTADMIN = `# 2) DirectAdmin — na CloudLinux (jako root, w tmux)
tmux new -s da-install

dnf -y install wget
cd /root
wget -O setup.sh https://www.directadmin.com/setup.sh
chmod 750 setup.sh

# Instalator interaktywny (license key, hostname, e-mail admina, NS-y):
./setup.sh

# --- sharedlicense / auto (jeśli vendor dał Ci gotowy klucz i parametry) ---
# ./setup.sh auto
# (parametry zależą od typu licencji — patrz help DirectAdmin / mail z licencji)

# Po instalacji — panel:
#   https://TWÓJ.IP:2222
# Login key (do Verris): DirectAdmin → Account Manager → Create Login Key
#   (API access, bez expiry lub rotacja wg polityki)
#
# MySQL Governor (CloudLinux) — automatycznie w kroku „Profil hostingowy”.
# Wymaga działającego MariaDB/MySQL z DA. Ręcznie: bash node-cloudlinux-governor.sh

# Weryfikacja:
systemctl status directadmin --no-pager
/usr/local/directadmin/directadmin version 2>/dev/null || true
cd /usr/local/directadmin/custombuild && ./build versions | head -20`;

export const INSTALL_LITESPEED_VIA_DA = `# 3a) LiteSpeed + LSPHP — ZALECANE: przez DirectAdmin CustomBuild (po DA)
tmux new -s ls-custombuild
cd /usr/local/directadmin/custombuild

./build set webserver litespeed
./build set php1_release 8.3
./build set php2_release no
./build set redis yes
./build update
./build litespeed
./build php n

# Weryfikacja (wymagane przez bootstrap Verris):
/usr/local/lsws/bin/lswsctrl status
ls /usr/local/lsws/lsphp*/bin/lsphp
ss -lnt | grep 7080   # WebAdmin LS`;

export const INSTALL_LITESPEED_STANDALONE = `# 3b) LiteSpeed — alternatywa: instalator przed bootstrap (gdy bez CustomBuild)
export LITESPEED_SERIAL_NO="TWÓJ-SERIAL-LITESPEED-TRIAL"
bash <(curl -fsSL https://get.litespeed.sh) "$LITESPEED_SERIAL_NO"

# LSPHP — doinstaluj z repozytorium LiteSpeed dla RHEL/Alma (wersja z polityki hostingu):
# https://docs.litespeedtech.com/lsws/installation/
# Przykład (sprawdź aktualną wersję w docs LS):
# wget -O - https://repo.litespeed.sh/ | bash
# lub pakiety lsphp83-* z repo LiteSpeed

/usr/local/lsws/bin/lswsctrl start
ls /usr/local/lsws/lsphp*/bin/lsphp`;

export const PREPARE_NODE_EXPORTS = `# 4) Przed bootstrap Verris — na węźle (root):
export LITESPEED_SERIAL_NO="TWÓJ-SERIAL-LITESPEED"   # tylko gdy LS jeszcze nie ma lswsctrl
export LSWS_WEBADMIN_ALLOW_IP="TWOJE.IP.BIURA"         # opcjonalnie
# export PUBLIC_IP="PUBLICZNY.IP.WĘZŁA"              # opcjonalnie

tmux new -s verris-bootstrap
# wklej i uruchom skrypt z panelu admin (krok „Instalacja”, sekcja ręczna)`;

export const VERIFY_CLOUDLINUX = `# Po instalacji CL trial — weryfikacja:
lveinfo --help >/dev/null 2>&1 && echo "OK: lveinfo"
cloudlinux-statistic --help >/dev/null 2>&1 && echo "OK: cloudlinux-statistic"
# Jedno z powyższych musi działać — inaczej agent Verris nie wyśle telemetrii LVE.`;

export const HOSTING_PROFILE_HINT = `# Preflight (tylko odczyt, bez zmian):
scp ops/scripts/node-stack-preflight.sh ops/scripts/node-hosting-profile.sh root@WĘZEŁ:/root/
ssh root@WĘZEŁ 'bash /root/node-stack-preflight.sh'

# Z panelu admin (zalecane): Node → Profil hostingowy → Uruchom (agent verris-tasks)
# Domyślnie --skip-build (bez 30–90 min CustomBuild rebuild)

# Ręcznie na węźle:
ssh root@WĘZEŁ 'bash /root/node-hosting-profile.sh --yes --skip-build'

# Węzeł sprzed agent-3: jednorazowo zainstaluj agenta zadań (skrypt z panelu → Pokaż skrypt instalacji)`;

export const VERIFY_BOOTSTRAP_AGENTS = `# Po bootstrap — weryfikacja agentów (root na węźle):
systemctl is-active verris-agent.timer verris-probes.timer
test -x /usr/local/bin/verris-tasks.sh && echo "OK: verris-tasks"
grep -q verris-tasks.sh /usr/local/bin/verris-probes.sh 2>/dev/null && echo "OK: probes→tasks hook"
tail -3 /var/log/verris-agent.log
# Oczekiwany komunikat bootstrapu: "Bootstrap complete"`;

/** Co robi skrypt bootstrap z panelu (nie instaluje CL ani DA). */
export const BOOTSTRAP_DOES = [
  "Instaluje się jako usługa systemd verris-bootstrap — wznawia pracę po restarcie (także po konwersji CloudLinux)",
  "CloudLinux: cldeploy -k <klucz> + reboot — gdy podasz klucz i kernel LVE jeszcze nie działa",
  "DirectAdmin: oficjalny instalator setup.sh — gdy DA jeszcze nie ma",
  "LiteSpeed przez DA CustomBuild — gdy podasz serial",
  "Handshake z api.verris.pl, /etc/verris.conf, verris-agent, verris-probes, verris-tasks (kolejka zadań z panelu)",
  "Raportuje każdą fazę na żywo do panelu; po fazie Canary control-plane zakłada NS glue i pakiety DA",
];

export const BOOTSTRAP_DOES_NOT = [
  "Nie robi hardeningu ani blokady ruchu wychodzącego — krok „Onboard LIVE” (obowiązkowy przed klientami)",
  "Nie konfiguruje kopii poza serwerem — krok „Backup offsite”",
  "Nie instaluje MySQL Governor ani nie stroi poczty/FTP — krok „Profil hostingowy”",
  "Nie zna login key DirectAdmin — podajesz go w kroku „Akceptacja i DA API” (sekret nie trafia do skryptu)",
  "Nie ustawia limitów LVE per klient — robi to Verris przy provisioningu z planu",
];

/**
 * Faza 3 runbooka (NODE_ONBOARD_RUNBOOK.md) — jeden skrypt na węźle: security
 * hardening + egress lockdown + rejestracja publicznego IP w DA + pakiety
 * planów + LIVE readiness. Audit F-07: ten krok był poza wizardem.
 */
export const ONBOARD_LIVE_SCP = `# 5a) Z repo (stacja robocza) — pakiet onboardu w układzie repo: skrypty z lib/, strona domyślna,
#     listy bezpieczeństwa (security-watch). Układ ops/… jest wymagany — skrypty szukają plików względem repo.
tar czf - ops/scripts ops/hosting-default-page ops/etc/verris/security ops/systemd | ssh root@WĘZEŁ 'mkdir -p /opt/verris && tar xzf - -C /opt/verris'`;

/** H-19 — konfiguracja kopii poza węzłem; bez niej onboard kończy się [FAIL]. */
export const BACKUP_OFFSITE_CONF = `# 4b) Na węźle (root) — PRZED onboardem LIVE. Bez tego node-onboard-live.sh zatrzyma się na [FAIL].
dnf -y install rclone
rclone config      # remote „verris-remote” (Hetzner Storage Box / S3) + „verris-crypt” (crypt na nim)
cat > /etc/verris-backup.conf <<'CONF'
RCLONE_REMOTE="verris-crypt:"
BACKUP_PREFIX="nodes/$(hostname -s)"
RETENTION_DAYS=30
DA_BACKUP=1
CONF
chmod 600 /etc/verris-backup.conf /root/.config/rclone/rclone.conf
rclone lsd verris-crypt: && echo "OK: remote działa"
# Hasła crypt zapisz w sejfie poza węzłem — bez nich kopii nie odczytasz po utracie serwera.
# H-16: TE SAME hasła crypt (i ten sam remote) na każdym węźle floty — inaczej konta z utraconego
# węzła nie da się odtworzyć na innym (admin → subskrypcja → „Odtworzenie na innym węźle”).`;

export const ONBOARD_LIVE_RUN = `# 5b) Na węźle (root). DA_USER/DA_KEY nie są potrzebne — skrypt bierze tymczasowy klucz z „da api-url”.
bash /opt/verris/ops/scripts/node-onboard-live.sh
# Log: /var/log/verris-node-onboard.log
# Wynik trafia do panelu: węzeł dostaje klientów dopiero po zielonym raporcie gotowości (0 × FAIL).
# Hardening jest domyślnie WŁĄCZONY (--skip-security tylko awaryjnie, NIEZALECANE)`;

export const ONBOARD_LIVE_VERIFY = `# 5c) Weryfikacja po onboardingu:
dbctl list                                   # Governor odpowiada
mysql -e 'SELECT 1'                          # MariaDB OK
ls /usr/local/directadmin/data/admin/ips/    # publiczne IP zarejestrowane w DA
nft list ruleset | head -20                  # egress lockdown aktywny
test -f /etc/verris-hardened && echo "OK: hardening marker"`;

export const ONBOARD_LIVE_DOES = [
  "Security baseline: SSH, fail2ban, sysctl, auto-updates, firewall ingress",
  "Egress lockdown: deny-by-default (nftables) z dziurami na API/repo",
  "Rejestruje publiczne IP węzła w DA — bez tego provisioning kończy się błędem „A valid IP was not provided”",
  "Tworzy pakiety DA starter/pro/business zgodne z planami panelu",
  "Instaluje backup offsite (timer 03:30) i ZATRZYMUJE się, gdy brak /etc/verris-backup.conf albo remote rclone",
  "LIVE readiness: agent zadań + Governor/MariaDB 10.6 + profil hostingowy + weryfikacja",
  "Ręcznie w WebAdmin LiteSpeed: Per-Client Throttling wg ops/docs/DDOS.md (G-21) — L3/L4 filtruje Hetzner",
];

/**
 * Definition of Done dla węzła ACTIVE (bootstrap v2). Każdy punkt ma swój
 * walidator w sekcji „Audyt i naprawa” na stronie węzła.
 */
export const DOD_ACTIVE_CHECKLIST = [
  "Status węzła ACTIVE, agent + sondy zielone (heartbeat < 5 min)",
  "Hostname (FQDN) ustawiony, rekord A w OVH wskazuje IP węzła",
  "daHost = hostname (nie surowe IP) — linki panelu i TLS po hostname",
  "Login key DA ma scope packages + accounts (test API OK)",
  "Onboard LIVE wykonany: hardening + egress lockdown + publiczne IP w DA",
  "Pakiety DA starter/pro/business z realnymi limitami (NIE „Bez ograniczeń”), język PL",
  "Profil hostingowy (Governor/LiteSpeed) wykonany — task SUCCESS",
  "Wildcard *.verris.pl na :2222 (CN/SAN, nie IP) + weryfikacja cert w API włączona",
  "Smoke: zakup planu → konto DA z limitami planu",
];
