/** Treści kroków wizarda węzła compute — operator runbook (GO-HOST). */

export type WizardStepId =
  | "requirements"
  | "cloudlinux"
  | "directadmin"
  | "litespeed"
  | "bootstrap"
  | "approve-da"
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
    id: "cloudlinux",
    title: "CloudLinux",
    subtitle: "Trial / LVE — ręcznie na serwerze",
  },
  {
    id: "directadmin",
    title: "DirectAdmin",
    subtitle: "Instalacja panelu (sharedlicense na testy)",
  },
  {
    id: "litespeed",
    title: "LiteSpeed + LSPHP",
    subtitle: "Serial, tmux, restart SSH",
  },
  {
    id: "bootstrap",
    title: "Bootstrap Verris",
    subtitle: "Rekord w panelu + skrypt agenta",
  },
  {
    id: "approve-da",
    title: "Akceptacja i DA API",
    subtitle: "Panel admin → login key",
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

# MySQL Governor — instaluje profil hostingowy (krok 7 wizarda / panel admin)
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
# MySQL Governor (CloudLinux) — automatycznie w kroku 7 (Profil hostingowy).
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
# wklej i uruchom skrypt z panelu admin (krok Bootstrap)`;

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
  "Instaluje LiteSpeed przez get.litespeed.sh — tylko gdy brak lswsctrl (wymaga LITESPEED_SERIAL_NO)",
  "Sprawdza obecność LSPHP",
  "Handshake z api.verris.pl — rejestracja CPU/RAM/disk",
  "Zapisuje /etc/verris.conf (token agenta)",
  "Instaluje klucz SSH deploy control-plane (do wildcard TLS i ops) — gdy ustawiony na panelu",
  "Instaluje verris-agent (telemetria LVE co 1 min)",
  "Instaluje verris-probes (sondy lokalne co 1 min)",
  "Instaluje verris-tasks.sh + verris-task-run.sh + verris-tasks.timer (kolejka z panelu co 1 min)",
];

export const BOOTSTRAP_DOES_NOT = [
  "Nie instaluje CloudLinux — zrób to wcześniej (krok 2)",
  "Nie instaluje DirectAdmin — zrób to wcześniej (krok 3)",
  "Nie instaluje LSPHP — tylko weryfikuje; doinstaluj przez DA CustomBuild lub repo LS",
  "Nie instaluje MySQL Governor — profil hostingowy (krok 7) instaluje governor-mysql + mysqlgovernor.py --install",
  "Nie konfiguruje cache LS — profil hostingowy (krok 7)",
  "Nie ustawia limitów LVE per klient — robi to Verris przy provisioning z planu",
  "Nie tworzy pakietów DA (starter/pro/business) — synchronizuj po teście login key (sekcja Konfiguracja węzła)",
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
  "Pakiety DA starter/pro/business z realnymi limitami (NIE „Bez ograniczeń”), język PL",
  "Profil hostingowy (Governor/LiteSpeed) wykonany — task SUCCESS",
  "Wildcard *.verris.pl na :2222 (CN/SAN, nie IP)",
  "Smoke: zakup planu → konto DA z limitami planu",
];
