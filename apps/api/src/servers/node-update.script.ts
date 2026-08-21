/**
 * NODE-6 — skrypt aktualizacji stacku węzła do LATEST-STABLE. Komendy zgodne
 * z oficjalnymi mechanizmami producentów:
 *   - DirectAdmin + LiteSpeed + PHP → CustomBuild (`./build update` + `./build all d`)
 *   - DirectAdmin binary → `da update` (kanał stable)
 *   - CloudLinux/OS → `yum -y update` (pakiety + kernel LVE)
 *
 * Bezpieczeństwo: NIE robimy automatycznego rebootu w tym zadaniu (agent lease
 * mógłby zostać przerwany). Jeśli aktualizacja kernela wymaga restartu,
 * raportujemy to (`needs-reboot`) — admin planuje reboot w oknie serwisowym
 * (najlepiej po drainie węzła).
 */
export function loadNodeUpdateScript(): string {
  return `#!/usr/bin/env bash
# Verris — aktualizacja stacku węzła do latest-stable. Uruchamiane przez agenta.
set -uo pipefail
log() { echo "[verris-update] $*"; }

REBOOT_NEEDED=0
OLD_KERNEL="$(uname -r)"

# 1) DirectAdmin + LiteSpeed + PHP przez CustomBuild (kanał stable).
CB=/usr/local/directadmin/custombuild
if [ -d "$CB" ]; then
  cd "$CB"
  log "CustomBuild: pobieram najnowsze wersje…"
  ./build update >/dev/null 2>&1 || log "WARN: build update zwrócił błąd"
  log "CustomBuild: aktualizuję cały stack (DA/LiteSpeed/PHP)…"
  ./build all d || log "WARN: build all zwrócił błąd"
  ./build rewrite_confs >/dev/null 2>&1 || true
else
  log "Brak CustomBuild — pomijam aktualizację DA/LiteSpeed."
fi

# 2) DirectAdmin binary (kanał stable), jeśli dostępny.
if command -v da >/dev/null 2>&1; then
  da update >/dev/null 2>&1 || log "WARN: da update zwrócił błąd"
fi

# 3) CloudLinux / pakiety OS (kernel LVE, lve-utils, cagefs itd.).
if command -v yum >/dev/null 2>&1; then
  log "yum: aktualizuję pakiety systemu (CloudLinux/OS)…"
  yum -y update >/dev/null 2>&1 || log "WARN: yum update zwrócił błąd"
fi

# 4) Czy aktualizacja podmieniła kernel? Jeśli tak — potrzebny reboot.
NEW_KERNEL_INSTALLED="$(rpm -q --last kernel* 2>/dev/null | head -1 || true)"
if [ -n "$NEW_KERNEL_INSTALLED" ]; then
  # Porównaj działający kernel z najnowszym zainstalowanym.
  LATEST="$(ls -1t /boot/vmlinuz-* 2>/dev/null | head -1 | sed 's#.*/vmlinuz-##')"
  if [ -n "$LATEST" ] && [ "$LATEST" != "$OLD_KERNEL" ]; then
    REBOOT_NEEDED=1
  fi
fi

if [ "$REBOOT_NEEDED" = "1" ]; then
  log "needs-reboot: zainstalowano nowszy kernel ($LATEST). Zaplanuj reboot po drainie."
  echo "VERRIS_UPDATE_RESULT=needs-reboot"
else
  log "OK: stack zaktualizowany, reboot niepotrzebny."
  echo "VERRIS_UPDATE_RESULT=ok"
fi
`;
}
