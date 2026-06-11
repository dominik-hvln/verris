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
REPORT="$LOG_DIR/watch-$(date -u +%Y%m%dT%H%M%SZ).log"
: >"$REPORT"

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
OUT_WEB="$(ss -H -tn state established '( dport = :80 or dport = :443 )' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${OUT_WEB:-0}" -gt 40 ]; then
  record "WARN: high count of established outbound web connections: ${OUT_WEB}"
fi

SYN_WEB="$(ss -H -tan state syn-sent '( dport = :80 or dport = :443 )' 2>/dev/null | wc -l | tr -d ' ')"
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
  ANTISCAN_DROPS="$(
    grep -c 'VERRIS-ANTISCAN-DROP' /var/log/kern.log 2>/dev/null | tail -1 || echo 0
  )"
  RECENT_DROPS="$(
    KERN_SINCE="$(date -u -d '6 minutes ago' '+%Y-%m-%dT%H:%M' 2>/dev/null || date -u -v-6M '+%Y-%m-%dT%H:%M' 2>/dev/null || true)"
    [ -n "$KERN_SINCE" ] && awk -v since="$KERN_SINCE" '$0 ~ /VERRIS-ANTISCAN-DROP/ && $0 >= since { c++ } END { print c+0 }' /var/log/kern.log || echo 0
  )"
  if [ "${RECENT_DROPS:-0}" -gt 0 ]; then
    record "INFO: VERRIS-ANTISCAN-DROP fired ${RECENT_DROPS} time(s) in last ~6 min (egress blocked)"
  fi
  unset ANTISCAN_DROPS RECENT_DROPS KERN_SINCE
fi

# --- Cron integrity snapshot ---
CRON_SNAP="$LOG_DIR/cron.sha256"
CRON_TMP="$(mktemp)"
{
  crontab -l 2>/dev/null || true
  ls -la /etc/cron.d /etc/cron.daily /etc/cron.hourly 2>/dev/null || true
  cat /etc/cron.d/* 2>/dev/null || true
} >"$CRON_TMP" 2>/dev/null
NEW_HASH="$(sha256sum "$CRON_TMP" | awk '{print $1}')"
rm -f "$CRON_TMP"
if [ -f "$CRON_SNAP" ]; then
  OLD_HASH="$(cat "$CRON_SNAP")"
  if [ "$OLD_HASH" != "$NEW_HASH" ]; then
    record "WARN: cron layout/content hash changed (was ${OLD_HASH:0:12}… now ${NEW_HASH:0:12}…)"
  fi
else
  echo "$NEW_HASH" >"$CRON_SNAP"
  log "Initialized cron snapshot at $CRON_SNAP"
fi

if [ "$FINDINGS" -eq 0 ]; then
  log "OK — no findings"
else
  log "ALERT — ${FINDINGS} finding(s), see $REPORT"
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
