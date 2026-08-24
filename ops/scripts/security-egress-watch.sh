#!/usr/bin/env bash
# Periodyczny monitoring podejrzanego ruchu / integralności cron (host-level).
# Instalacja: security-install-verris-security.sh (systemd timer co 5 min).
#
#   sudo bash ops/scripts/security-egress-watch.sh
#   sudo bash ops/scripts/security-egress-watch.sh --prometheus-textfile /var/lib/verris-metrics
set -euo pipefail

IOC_FILE="${IOC_FILE:-/etc/verris/security/ioc-ips.txt}"
LOG_DIR="${LOG_DIR:-/var/log/verris-security}"
TEXTFILE_DIR=""
FINDINGS=0

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --prometheus-textfile) TEXTFILE_DIR="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--prometheus-textfile /path/to/dir]"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$LOG_DIR"

# =============================================================================
# X-36 — PLIK RAPORTU ISTNIEJE WTEDY I TYLKO WTEDY, GDY SA ZNALEZISKA.
#
# Poprzednia wersja tworzyla plik na starcie i zostawiala go pustym, gdy nic
# nie znalazla. Przy przebiegu co 5 minut daje to 288 plikow na dobe — stan na
# 2026-08-24 to ~24 tys. plikow i ~90 MB, w wiekszosci 81-bajtowych kopii tego
# samego ostrzezenia. Katalog stal sie nieczytelny, a `ls -la` w nim kosztowny.
#
# Gorsze bylo jednak co innego: raport 0-bajtowy znaczyl DWIE PRZECIWNE rzeczy —
# „przebieg czysty" albo „przebieg umarl przed zapisaniem czegokolwiek"
# (`set -e` + `ss` bez oslony, patrz nizej). Ta sama choroba co w X-35, tylko
# na dysku zamiast w PromQL: pustka jako nosnik dwoch sprzecznych znaczen.
#
# Teraz przebieg pisze do pliku tymczasowego i przenosi go pod docelowa nazwe
# TYLKO jesli cos znalazl. Dzieki temu obecnosc pliku jest jednoznaczna, a `ls`
# w tym katalogu od razu pokazuje wylacznie przebiegi, ktore mialy cos do
# powiedzenia. Rozroznienie „czysto" / „awaria" zostaje w journalu: czysty
# przebieg konczy sie linia „OK — no findings", a przerwany nie ma jej wcale.
#
# RETENCJA. Bez niej katalog rosnie w nieskonczonosc. Raporty trzymamy 30 dni
# (RETENCJA_DNI), audyty tygodniowe ~13 miesiecy — to one sa narracja okresu
# i wazy kilka kilobajtow tygodniowo.
#
# UWAGA PRZY PIERWSZYM URUCHOMIENIU: ponizszy `find -delete` usunie zalegly
# backlog starszy niz RETENCJA_DNI. Jesli chcesz zachowac historie sprzed
# wdrozenia, zarchiwizuj katalog PRZED instalacja tej wersji.
# =============================================================================
RETENCJA_DNI="${RETENCJA_DNI:-30}"
find "$LOG_DIR" -maxdepth 1 -type f -name 'watch-*.log' \
     -mtime "+${RETENCJA_DNI}" -delete 2>/dev/null || true
find "$LOG_DIR" -maxdepth 1 -type f -name 'weekly-audit-*.log' \
     -mtime +400 -delete 2>/dev/null || true

REPORT_FINAL="$LOG_DIR/watch-$(date -u +%Y%m%dT%H%M%SZ).log"
REPORT="$(mktemp)"

record() {
  echo "$1" | tee -a "$REPORT"
  FINDINGS=$((FINDINGS + 1))
}

# --- Active connections to known IOC ---
if [ -f "$IOC_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="$(echo "$line" | tr -d '[:space:]')"
    [ -z "$line" ] && continue
    [[ "$line" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    if ss -H -tn state established 2>/dev/null | awk -v ip="$line" '$4 ~ ip { found=1 } END { exit !found }'; then
      record "CRITICAL: established TCP to IOC $line"
      ss -tn state established 2>/dev/null | grep "$line" >>"$REPORT" || true
    fi
  done <"$IOC_FILE"
fi

# --- Burst outbound :80/:443 (possible scan/C2 beaconing) ---
# X-36: `|| true` NIE jest ozdobnikiem. Skrypt działa z `set -euo pipefail`,
# a `ss` bez osłony w podstawieniu polecenia zabija CAŁY przebieg — przed
# zapisem metryki. Zostaje po tym raport 0-bajtowy, NIEODRÓŻNIALNY od przebiegu
# czystego, i metryka zamrożona na poprzedniej wartości. Podejrzewamy, że
# dokładnie to stało się 2026-07-08 o 15:44 (jedyny pusty raport w serii).
OUT_WEB="$( { ss -H -tn state established '( dport = :80 or dport = :443 )' 2>/dev/null || true; } | wc -l | tr -d ' ')"
if [ "${OUT_WEB:-0}" -gt 40 ]; then
  record "WARN: high count of established outbound web connections: ${OUT_WEB}"
fi

SYN_WEB="$( { ss -H -tan state syn-sent '( dport = :80 or dport = :443 )' 2>/dev/null || true; } | wc -l | tr -d ' ')"
if [ "${SYN_WEB:-0}" -gt 15 ]; then
  record "WARN: many SYN-SENT outbound web connections: ${SYN_WEB}"
  ss -H -tan state syn-sent '( dport = :80 or dport = :443 )' 2>/dev/null | head -20 >>"$REPORT" || true
fi

# --- Kernel log: unique egress destinations in last 6 minutes ---
if [ -r /var/log/kern.log ]; then
  KERN_WINDOW="$(date -u -d '6 minutes ago' '+%Y-%m-%dT%H:%M' 2>/dev/null || date -u -v-6M '+%Y-%m-%dT%H:%M' 2>/dev/null || true)"
  if [ -n "$KERN_WINDOW" ]; then
    UNIQUE_DST="$(
      awk -v since="$KERN_WINDOW" '
        $0 ~ /VERRIS-EGRESS-WEB|VERRIS-ANTISCAN-DROP/ && $0 >= since {
          if (match($0, /DST=[0-9.]+/)) {
            dst = substr($0, RSTART + 4, RLENGTH - 4)
            d[dst] = 1
          }
        }
        END { n = 0; for (k in d) n++; print n + 0 }
      ' /var/log/kern.log 2>/dev/null || echo 0
    )"
    if [ "${UNIQUE_DST:-0}" -gt 25 ]; then
      record "CRITICAL: ${UNIQUE_DST} unique egress web destinations in last ~6 min (possible netscan)"
    fi
  fi
fi

# --- Anti-scan drops in kernel log (last 6 min) ---
if [ -r /var/log/kern.log ]; then
  # X-36: policzone i nigdy nieużyte ANTISCAN_DROPS (suma od początku logu)
  # zostało usunięte. Martwy kod w skrypcie bezpieczeństwa jest gorszy niż
  # w zwykłym: czytający zakłada, że skoro coś się liczy, to coś tego pilnuje.
  RECENT_DROPS="$(
    KERN_SINCE="$(date -u -d '6 minutes ago' '+%Y-%m-%dT%H:%M' 2>/dev/null || date -u -v-6M '+%Y-%m-%dT%H:%M' 2>/dev/null || true)"
    [ -n "$KERN_SINCE" ] && awk -v since="$KERN_SINCE" '$0 ~ /VERRIS-ANTISCAN-DROP/ && $0 >= since { c++ } END { print c+0 }' /var/log/kern.log || echo 0
  )"
  if [ "${RECENT_DROPS:-0}" -gt 0 ]; then
    record "INFO: VERRIS-ANTISCAN-DROP fired ${RECENT_DROPS} time(s) in last ~6 min (egress blocked)"
  fi
  unset RECENT_DROPS KERN_SINCE
fi

# =============================================================================
# X-36 — integralnosc crona liczona z TRESCI, nie z listingu.
#
# CO BYLO ZLE. Poprzednia wersja hashowala miedzy innymi wyjscie:
#
#     ls -la /etc/cron.d /etc/cron.daily /etc/cron.hourly
#
# `ls -la` wypisuje wpis `..` — czyli mtime katalogu /etc. Do tego wiersze
# `total N` i mtime `.`. To NIE byl odcisk crona. To byl detektor zmian
# w CALYM /etc, z etykieta „cron integrity" na obudowie.
#
# Skutek, zmierzony 2026-08-24: zaden plik w cron.d/daily/hourly nie mial mtime
# pozniejszego niz 2026-05-31, a mimo to WARN palil sie od 4 czerwca bez przerwy
# — od chwili, gdy unattended-upgrades o 06:19:31 zapisalo cos w /etc. Co gorsza
# hash „now" zmienial sie dalej (c38e0c11 21.08, cbfd10e8 24.08), wiec od
# pierwszego dryfu ten detektor nie wykrywal juz NICZEGO: dziesiata zmiana crona
# wygladalaby identycznie jak pierwsza.
#
# NOWA NAZWA PLIKU BAZY jest cz. rozwiazania, nie kosmetyka. Stara suma
# w cron.sha256 opisuje inny format wejscia i nigdy by nie pasowala — zostawienie
# tej samej nazwy daloby WARN na zawsze, czyli dokladnie to, co naprawiamy.
# Nowy plik inicjalizuje sie sam przy pierwszym przebiegu.
#
# CZY WOLNO SIE SAMOINICJALIZOWAC BEZ PRZEGLADU. Tutaj tak, i to nie jest
# zalozenie: listing z 2026-08-24 pokazuje, ze najswiezszy plik w /etc/cron.d
# pochodzi z 31 maja (verris-node-wildcard-tls), a w cron.daily i cron.hourly
# wszystko jest z pakietow. Nie ma czego przegladac — cron sie nie zmienil.
#
# Przy zmianie zapisujemy ROZNICE, nie sam fakt. Poprzednia wersja mowila
# „zmienilo sie" i nic wiecej, wiec czlowiek i tak musial zaczynac od zera.
# =============================================================================
CRON_SNAP="$LOG_DIR/cron-content.sha256"
CRON_BASE="$LOG_DIR/cron-content.snapshot"
CRON_DIRS="/etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly"
CRON_TMP="$(mktemp)"
{
  echo "## crontab -l (root)"
  crontab -l 2>/dev/null || true
  echo "## tresc plikow"
  # shellcheck disable=SC2086
  find $CRON_DIRS -type f -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum 2>/dev/null || true
  echo "## uprawnienia i wlasciciel"
  # shellcheck disable=SC2086
  find $CRON_DIRS -type f -printf '%p %m %u %g\n' 2>/dev/null | sort || true
} >"$CRON_TMP" 2>/dev/null
NEW_HASH="$(sha256sum "$CRON_TMP" | awk '{print $1}')"

if [ -f "$CRON_SNAP" ]; then
  OLD_HASH="$(cat "$CRON_SNAP")"
  if [ "$OLD_HASH" != "$NEW_HASH" ]; then
    record "WARN: cron content changed (was ${OLD_HASH:0:12}… now ${NEW_HASH:0:12}…)"
    if [ -f "$CRON_BASE" ]; then
      echo "--- roznica wzgledem bazy odniesienia ---" >>"$REPORT"
      diff -u "$CRON_BASE" "$CRON_TMP" >>"$REPORT" 2>/dev/null || true
    fi
  fi
else
  echo "$NEW_HASH" >"$CRON_SNAP"
  cp -f "$CRON_TMP" "$CRON_BASE" 2>/dev/null || true
  log "Initialized cron content snapshot at $CRON_SNAP"
fi
rm -f "$CRON_TMP"

if [ "$FINDINGS" -eq 0 ]; then
  rm -f "$REPORT"
  log "OK — no findings"
else
  mv -f "$REPORT" "$REPORT_FINAL"
  chmod 640 "$REPORT_FINAL" 2>/dev/null || true
  log "ALERT — ${FINDINGS} finding(s), see $REPORT_FINAL"
fi

# Prometheus textfile for node_exporter
if [ -n "$TEXTFILE_DIR" ]; then
  mkdir -p "$TEXTFILE_DIR"
  TMP="${TEXTFILE_DIR}/verris_security.prom.$$"
  cat >"$TMP" <<EOF
# HELP verris_security_findings Active security watch findings on this host.
# TYPE verris_security_findings gauge
verris_security_findings ${FINDINGS}
EOF
  mv "$TMP" "${TEXTFILE_DIR}/verris_security.prom"
fi

exit "$([ "$FINDINGS" -eq 0 ] && echo 0 || echo 1)"
