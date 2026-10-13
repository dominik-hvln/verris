/**
 * NODE-6 — skrypt aktualizacji stacku węzła do LATEST-STABLE. Komendy zgodne
 * z oficjalnymi mechanizmami producentów:
 *   - DirectAdmin + LiteSpeed + PHP → CustomBuild (`./build update` + `./build update_versions`;
 *     przy zmianie domyślnego PHP z manifestu dodatkowo `./build php`)
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
BLEDY=0
OLD_KERNEL="$(uname -r)"
blad() { log "BŁĄD: $*"; BLEDY=$((BLEDY + 1)); }
OSTRZEZENIA=0
OSTRZ_LINIE=()
ostrzezenie() { OSTRZEZENIA=$((OSTRZEZENIA + 1)); OSTRZ_LINIE+=("$*"); }

# 0) Agent zadań z control-plane (podpisany, verris-fetch). Bez tego nowe pola zadań (np. lista plików
#    kwarantanny) wymagały ręcznej instalacji agenta przez SSH na każdym węźle.
if verris-fetch /agent/tasks/agent-install/script /usr/local/bin/verris-agent-install.sh 60; then
  bash /usr/local/bin/verris-agent-install.sh >/dev/null 2>&1 && log "Agent zadań zaktualizowany." || blad "instalacja agenta zadań"
else
  blad "pobranie instalatora agenta zadań (verris-fetch)"
fi

# 1) DirectAdmin + LiteSpeed + PHP przez CustomBuild (kanał stable).
CB=/usr/local/directadmin/custombuild
if [ -d "$CB" ]; then
  cd "$CB"
  log "CustomBuild: pobieram najnowsze wersje…"
  ./build update >/dev/null 2>&1 || blad "build update"
  # PB-33 — „Wyrównaj flotę”: domyślne PHP z manifestu floty (/etc/verris-stack.env) przed przebudową.
  if [ "\${UPD_WYROWNAJ:-}" = "1" ] && [ -r /etc/verris-stack.env ]; then
    . /etc/verris-stack.env
    PHP_OBECNE="$(sed -n 's/^php1_release=//p' "$CB/options.conf" 2>/dev/null | head -1)"
    log "Wyrównanie z manifestem \${VERRIS_STACK_VERSION:-?}: PHP \${VERRIS_PHP1_RELEASE:-?} (na węźle: \${PHP_OBECNE:-?})"
    if [ "\${PHP_OBECNE}" != "\${VERRIS_PHP1_RELEASE:-}" ]; then
      ./build set php1_release "$VERRIS_PHP1_RELEASE" >/dev/null 2>&1 && PHP_ZMIANA=1 || blad "build set php1_release"
    fi
  fi
  # 13.10 — było „./build all d”: wyrównanie zgodnych węzłów kompilowało od zera PHP ×5, Dovecota i resztę
  # (t2 ~35 min, t1 ~20 min) bez żadnej zmiany wersji. Dokumentacja DirectAdmin „Upgrading Services”
  # (https://docs.directadmin.com/custombuild/upgrading-services.html): aktualizacja = „da build update_versions”
  # (tylko nieaktualne składniki); „build all” rekompiluje wszystko i „nie jest zalecane do regularnego użycia”.
  log "CustomBuild: aktualizuję nieaktualne składniki (update_versions)…"
  # Weryfikacja 11.10 — CustomBuild kończy się kodem 0 także wtedy, gdy krok w środku wypisze „Error: …”
  # (t1: cagefsctl --force-update → „/etc/cagefs/cagefs.mp file contains incorrect path - /run/mysql …”).
  # Takie linie liczymy jako ostrzeżenia: przebieg nie jest „wszystko zaktualizowane”, ale fala nie staje.
  BUILD_LOG="$(mktemp /tmp/verris-update-build.XXXXXX)"
  ./build update_versions 2>&1 | tee "$BUILD_LOG" || blad "build update_versions"
  # Zmiana domyślnego PHP z manifestu (PB-33) — przebudowa samego PHP według options.conf.
  if [ "\${PHP_ZMIANA:-0}" = "1" ]; then
    log "CustomBuild: przebudowa PHP po zmianie php1_release…"
    ./build php 2>&1 | tee -a "$BUILD_LOG" || blad "build php"
  fi
  while IFS= read -r linia; do ostrzezenie "CustomBuild: $linia"; done < <(grep -E '^Error:' "$BUILD_LOG" | sort -u)
  rm -f "$BUILD_LOG"
  ./build rewrite_confs >/dev/null 2>&1 || true
else
  log "Brak CustomBuild — pomijam aktualizację DA/LiteSpeed."
fi

# 2) DirectAdmin binary (kanał stable), jeśli dostępny.
if command -v da >/dev/null 2>&1; then
  da update >/dev/null 2>&1 || blad "da update"
fi

# 3) CloudLinux / pakiety OS (kernel LVE, lve-utils, cagefs itd.).
if command -v yum >/dev/null 2>&1; then
  log "yum: aktualizuję pakiety systemu (CloudLinux/OS)…"
  yum -y update >/dev/null 2>&1 || blad "yum update"
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

# 5) Kontrola po aktualizacji (13.10, t1: po fali strony PHP padły na LVE, a zadanie mówiło tylko o Roundcube):
#    strażnik węzła w trybie --sprawdz — LiteSpeed, błędy LVE w jądrze, strony kont (HTTP). Problem = błąd zadania,
#    fala staje i alarmuje; strażnik w pętli i tak zacznie naprawę w ciągu minuty.
if [ -x /usr/local/bin/verris-straznik.sh ]; then
  sleep 30
  WYNIK_SPR="$(/usr/local/bin/verris-straznik.sh --sprawdz 2>&1 | tail -1)"
  log "Kontrola po aktualizacji: \${WYNIK_SPR}"
  case "$WYNIK_SPR" in
    VERRIS_STRAZNIK_SPRAWDZ=ok*) ;;
    *) blad "kontrola po aktualizacji: \${WYNIK_SPR#VERRIS_STRAZNIK_SPRAWDZ=}" ;;
  esac
else
  log "Brak strażnika węzła (starszy agent) — kontrola po aktualizacji pominięta."
fi

# Ostrzeżenia na końcu wyjścia — karta węzła pokazuje jego ostatnie linie.
for linia in "\${OSTRZ_LINIE[@]}"; do log "OSTRZEŻENIE: $linia"; done
OSTRZ_POLE=""
[ "$OSTRZEZENIA" -gt 0 ] && OSTRZ_POLE=" warnings=$OSTRZEZENIA"

# PB-32 — błąd kroku kończy zadanie jako FAILED: fala aktualizacji zatrzymuje się na tym węźle.
if [ "$BLEDY" -gt 0 ]; then
  echo "VERRIS_UPDATE_RESULT=failed errors=$BLEDY$OSTRZ_POLE"
  exit 1
fi

if [ "$REBOOT_NEEDED" = "1" ]; then
  log "needs-reboot: zainstalowano nowszy kernel ($LATEST). Zaplanuj reboot po drainie."
  echo "VERRIS_UPDATE_RESULT=needs-reboot$OSTRZ_POLE"
else
  log "OK: stack zaktualizowany, reboot niepotrzebny."
  echo "VERRIS_UPDATE_RESULT=ok$OSTRZ_POLE"
fi
`;
}
