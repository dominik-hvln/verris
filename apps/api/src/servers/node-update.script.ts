/**
 * NODE-6 — skrypt aktualizacji stacku węzła do LATEST-STABLE. Komendy zgodne
 * z oficjalnymi mechanizmami producentów:
 *   - DirectAdmin + LiteSpeed + PHP → CustomBuild (`./build update` + `./build update_versions`;
 *     przy zmianie domyślnego PHP z manifestu dodatkowo `./build php`)
 *   - DirectAdmin binary → `da update` (kanał stable)
 *   - CloudLinux/OS → `yum -y update` (pakiety + kernel LVE)
 *
 * 21.10 — tryb `UPD_TRYB=bezpieczenstwo` (weryfikator aktualizacji, panel admina „Aktualizacje bezpieczeństwa”):
 * zamiast pełnej aktualizacji tylko poprawki bezpieczeństwa z repozytoriów (`dnf -y upgrade --security`, a przy
 * `UPD_CVE` — `dnf -y upgrade --cve <CVE>` dla każdego), opcjonalnie składniki CustomBuild (`UPD_CUSTOMBUILD=1`),
 * potem łagodny restart LiteSpeed (procesy lsphp przechodzą na nowe binaria alt-php), strażnik i odświeżenie raportu.
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

CB=/usr/local/directadmin/custombuild
TRYB="\${UPD_TRYB:-}"
case "$TRYB" in
  ""|bezpieczenstwo) ;;
  *) echo "[verris-update] BŁĄD: nieznany tryb aktualizacji: $TRYB"; echo "VERRIS_UPDATE_RESULT=failed errors=1"; exit 1 ;;
esac

# CustomBuild „update_versions” (tylko nieaktualne składniki) — wspólne dla pełnej aktualizacji i trybu bezpieczeństwa.
# Dokumentacja DirectAdmin „Upgrading Services”: https://docs.directadmin.com/custombuild/upgrading-services.html
# Weryfikacja 11.10 — CustomBuild kończy się kodem 0 także wtedy, gdy krok w środku wypisze „Error: …”
# (t1: cagefsctl --force-update → „/etc/cagefs/cagefs.mp file contains incorrect path - /run/mysql …”).
# Takie linie liczymy jako ostrzeżenia: przebieg nie jest „wszystko zaktualizowane”, ale fala nie staje.
custombuild_update_versions() {
  log "CustomBuild: aktualizuję nieaktualne składniki (update_versions)…"
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
}

if [ "$TRYB" = "bezpieczenstwo" ]; then
  # 1b) Tylko poprawki bezpieczeństwa z repozytoriów (AlmaLinux / CloudLinux / alt-php) — dnf 4: --security i --cve
  #     (dnf updateinfo). ZAŁOŻENIE do sprawdzenia na węźle (TEST-02, AlmaLinux 10): dnf ma te opcje i metadane
  #     updateinfo z repozytoriów (bez nich --security nic nie zainstaluje — raport z verris-lve.sh to pokaże).
  CVE_LISTA="\${UPD_CVE:-}"
  if [ -n "$CVE_LISTA" ]; then
    IFS=',' read -r -a CVE_TAB <<< "$CVE_LISTA"
    for c in "\${CVE_TAB[@]}"; do
      if ! [[ "$c" =~ ^CVE-[0-9]{4}-[0-9]{4,7}$ ]]; then
        echo "[verris-update] BŁĄD: nieprawidłowy numer CVE: $c"; echo "VERRIS_UPDATE_RESULT=failed errors=1"; exit 1
      fi
    done
    for c in "\${CVE_TAB[@]}"; do
      log "dnf: poprawki dla $c…"
      dnf -y upgrade --cve "$c" 2>&1 | tail -n 20 || blad "dnf upgrade --cve $c"
    done
  else
    log "dnf: instaluję poprawki bezpieczeństwa (--security)…"
    dnf -y upgrade --security 2>&1 | tail -n 20 || blad "dnf upgrade --security"
  fi
  # 1c) Opcjonalnie składniki CustomBuild (Exim, Dovecot, PHP systemowe, LiteSpeed) — nie idą przez dnf.
  if [ "\${UPD_CUSTOMBUILD:-}" = "1" ]; then
    if [ -d "$CB" ]; then
      cd "$CB"
      log "CustomBuild: pobieram najnowsze wersje…"
      ./build update >/dev/null 2>&1 || blad "build update"
      custombuild_update_versions
    else
      log "Brak CustomBuild — pomijam składniki CustomBuild."
    fi
  fi
  # 1d) Łagodny restart LiteSpeed — procesy lsphp przechodzą na nowe binaria alt-php (te same polecenia lswsctrl,
  #     których panel używa przy instalacji LiteSpeed; https://docs.litespeedtech.com/lsws/cp/directadmin/).
  if [ -x /usr/local/lsws/bin/lswsctrl ]; then
    /usr/local/lsws/bin/lswsctrl restart >/dev/null 2>&1 || blad "restart LiteSpeed (lswsctrl restart)"
    log "LiteSpeed: łagodny restart po poprawkach."
  fi
else
# 1) DirectAdmin + LiteSpeed + PHP przez CustomBuild (kanał stable).
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
  custombuild_update_versions
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

# 21.10 — raport oczekujących aktualizacji (verris-lve.sh) odświeży się przy najbliższym przebiegu agenta, nie za 6 h.
touch /var/run/verris-aktualizacje.wymus 2>/dev/null || true

# Ostrzeżenia na końcu wyjścia — karta węzła pokazuje jego ostatnie linie.
for linia in "\${OSTRZ_LINIE[@]}"; do log "OSTRZEŻENIE: $linia"; done
OSTRZ_POLE=""
[ "$OSTRZEZENIA" -gt 0 ] && OSTRZ_POLE=" warnings=$OSTRZEZENIA"

# PB-32 — błąd kroku kończy zadanie jako FAILED: fala aktualizacji zatrzymuje się na tym węźle.
if [ "$BLEDY" -gt 0 ]; then
  echo "VERRIS_UPDATE_RESULT=failed errors=$BLEDY$OSTRZ_POLE"
  exit 1
fi

# 13.10 — panel pokazywał manifest jako „zgodny”, gdy węzeł tylko POBRAŁ plik (agent co minutę), zanim cokolwiek
# zastosował. Wersję zastosowaną zapisuje dopiero udane wyrównanie (i bootstrap) — raportuje ją verris-lve.sh.
if [ "\${UPD_WYROWNAJ:-}" = "1" ] && grep -q '^VERRIS_STACK_VERSION=' /etc/verris-stack.env 2>/dev/null; then
  grep '^VERRIS_STACK_VERSION=' /etc/verris-stack.env > /etc/verris-stack.applied && chmod 0644 /etc/verris-stack.applied
  log "Zastosowany manifest: $(sed -n "s/^VERRIS_STACK_VERSION=//p" /etc/verris-stack.applied)"
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
