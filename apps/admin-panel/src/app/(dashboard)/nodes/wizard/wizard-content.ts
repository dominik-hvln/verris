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
    subtitle: "Spójna konfiguracja floty (Governor, LS)",
  },
  {
    id: "finish",
    title: "Gotowe",
    subtitle: "Probes i smoke provisioning",
  },
];

export const PREPARE_NODE_EXPORTS = `# Na węźle (root), przed bootstrap — wklej serial LiteSpeed trial:
export LITESPEED_SERIAL_NO="TWÓJ-SERIAL-LITESPEED"
# Opcjonalnie: ogranicz WebAdmin LS (7080) do Twojego IP biura:
export LSWS_WEBADMIN_ALLOW_IP="TWOJE.IP.BIURA"
# Opcjonalnie, gdy auto-wykrycie IP zawiedzie:
# export PUBLIC_IP="PUBLICZNY.IP.WĘZŁA"

# Uruchom bootstrap w sesji odporniej na zerwanie SSH:
tmux new -s verris-bootstrap
# lub: screen -S verris-bootstrap`;

export const VERIFY_CLOUDLINUX = `# Po instalacji CL trial — weryfikacja:
lveinfo --help >/dev/null 2>&1 && echo "OK: lveinfo"
cloudlinux-statistic --help >/dev/null 2>&1 && echo "OK: cloudlinux-statistic"
# Jedno z powyższych musi działać — inaczej agent Verris nie wyśle telemetrii LVE.`;

export const HOSTING_PROFILE_HINT = `# Profil Verris — skopiuj z repo na węzeł (jako root):
scp ops/scripts/node-hosting-profile.sh root@WĘZEŁ:/root/
ssh root@WĘZEŁ
chmod +x /root/node-hosting-profile.sh
/root/node-hosting-profile.sh --dry-run   # podgląd planu
/root/node-hosting-profile.sh            # wykonanie (CustomBuild: użyj tmux)`;

/** Co robi skrypt bootstrap z panelu (nie instaluje CL ani DA). */
export const BOOTSTRAP_DOES = [
  "Instaluje LiteSpeed przez get.litespeed.sh — tylko gdy brak lswsctrl (wymaga LITESPEED_SERIAL_NO)",
  "Sprawdza obecność LSPHP",
  "Handshake z api.verris.pl — rejestracja CPU/RAM/disk",
  "Zapisuje /etc/verris.conf (token agenta)",
  "Instaluje verris-agent (telemetria LVE co 1 min)",
  "Instaluje verris-probes (sondy lokalne status page)",
];

export const BOOTSTRAP_DOES_NOT = [
  "Nie instaluje CloudLinux — zrób to wcześniej (krok 2)",
  "Nie instaluje DirectAdmin — zrób to wcześniej (krok 3)",
  "Nie instaluje LSPHP — tylko weryfikuje; doinstaluj przez DA CustomBuild lub repo LS",
  "Nie konfiguruje MySQL Governor / cache LS — profil hostingowy (krok 7)",
  "Nie ustawia limitów LVE per klient — robi to Verris przy provisioning z planu",
];
