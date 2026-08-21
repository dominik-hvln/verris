#!/usr/bin/env bash
# Verris — tworzy/aktualizuje pakiety użytkownika DirectAdmin (starter, pro,
# business) na węźle z REALNYMI limitami z planów Verris.
# Nazwy MUSZĄ odpowiadać Plan.slug w panelu Verris.
#
# WAŻNE (bug Node-PL-01, zweryfikowane na DA 1.697): w API DA o "Bez ograniczeń"
# decyduje SAMA OBECNOŚĆ parametru `ufoo` — jego wartość jest IGNOROWANA, więc
# `ufoo=no` także daje unlimited. Dla realnych limitów wysyłamy WYŁĄCZNIE `foo=<n>`
# BEZ `ufoo`; `ufoo=yes` tylko dla prawdziwego unlimited. Skrypt jest idempotentny
# — DA `CMD_API_MANAGE_USER_PACKAGES` z `add=Save` tworzy LUB nadpisuje pakiet,
# więc bezpiecznie naprawia istniejące pakiety "unlimited".
#
# Mapowanie limitów musi być spójne z:
#   - libs/database/prisma/seed.ts (Plan)
#   - apps/api/src/servers/da-package-spec.ts (buildDaPackageSpecFromPlan)
#
# Użycie (SSH root na węźle):
#   export DA_HOST=127.0.0.1
#   export DA_PORT=2222
#   export DA_USER=admin
#   export DA_KEY='login-key-z-panelu-DA'
#   bash node-da-sync-plan-packages.sh
#
# Login key: DirectAdmin → Account Manager → Login Keys (admin, scope: packages + accounts)
set -euo pipefail

DA_HOST="${DA_HOST:-127.0.0.1}"
DA_PORT="${DA_PORT:-2222}"
DA_USER="${DA_USER:?ustaw DA_USER (admin)}"
DA_KEY="${DA_KEY:?ustaw DA_KEY (login key)}"
DA_SECURE="${DA_SECURE:-yes}"
DA_LANGUAGE="${DA_LANGUAGE:-pl}"

proto=https
[ "$DA_SECURE" = "no" ] && proto=http

auth="$(printf '%s:%s' "$DA_USER" "$DA_KEY" | base64 | tr -d '\n')"
base="${proto}://${DA_HOST}:${DA_PORT}"

da_get() {
  curl -fsS -k -H "Authorization: Basic ${auth}" "$base$1"
}

da_post() {
  curl -fsS -k -X POST -H "Authorization: Basic ${auth}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data "$2" "$base$1"
}

list_packages() {
  da_get "/CMD_API_PACKAGES_USER" | tr '&' '\n' | grep -E '^list[0-9]+=' | cut -d= -f2- | sort -u
}

# upsert_package <name> <quota_mb> <bandwidth_mb> <domains> <subdomains> \
#                <emails> <forwarders> <mlists> <autoresp> <mysql> <domptr> <ftp> \
#                <cpu%> <mem_mb> <io_kbps> <iops> <ep> <nproc>
# Każda wartość liczbowa lub słowo "unlimited".
upsert_package() {
  local name="$1" quota="$2" bw="$3" vdomains="$4" nsub="$5" nemails="$6" \
        nemailf="$7" nemailml="$8" nemailr="$9" mysql="${10}" domptr="${11}" ftp="${12}" \
        cpu="${13}" mem="${14}" io="${15}" iops="${16}" ep="${17}" nproc="${18}"

  echo "[INFO] Upsert pakietu DA: $name (quota=${quota}MB bw=${bw}MB cpu=${cpu}% mem=${mem}MB)"

  local body="add=Save&packagename=${name}"
  body="${body}$(limit_pair quota "$quota")"
  body="${body}$(limit_pair bandwidth "$bw")"
  body="${body}$(limit_pair vdomains "$vdomains")"
  body="${body}$(limit_pair nsubdomains "$nsub")"
  body="${body}$(limit_pair nemails "$nemails")"
  body="${body}$(limit_pair nemailf "$nemailf")"
  body="${body}$(limit_pair nemailml "$nemailml")"
  body="${body}$(limit_pair nemailr "$nemailr")"
  body="${body}$(limit_pair mysql "$mysql")"
  body="${body}$(limit_pair domainptr "$domptr")"
  body="${body}$(limit_pair ftp "$ftp")"
  # CloudLinux LVE (poziom pakietu) — utrwalane tylko gdy DA ma integrację LVE
  # (CageFS). Na węzłach bez integracji DA je ignoruje i używa cgroups (niżej).
  body="${body}&cpu=${cpu}&mem=${mem}&io=${io}&iops=${iops}&ep=${ep}&nproc=${nproc}"
  # DirectAdmin systemd-cgroups (aktywny limiter bez integracji LVE; cgroup=1).
  # Puste = bez ograniczeń (BRAK flagi u<field>). Format zweryfikowany na DA 1.697:
  # CPUQuota "<n>%", Memory* "<n>M", IO*BandwidthMax "<n>K" (KB/s), IOPS/Tasks = int.
  # Wartości mapują 1:1 z LVE: CPUQuota=cpu%, MemoryMax=mem MB, IO=io KB/s, TasksMax=nproc.
  body="${body}&CPUQuota=${cpu}%25&MemoryHigh=${mem}M&MemoryMax=${mem}M"
  body="${body}&IOReadBandwidthMax=${io}K&IOWriteBandwidthMax=${io}K"
  body="${body}&IOReadIOPSMax=${iops}&IOWriteIOPSMax=${iops}&TasksMax=${nproc}"
  body="${body}&cgi=ON&php=ON&ssl=ON&spam=ON&cron=ON&dnscontrol=ON&ssh=OFF"
  body="${body}&language=${DA_LANGUAGE}&skin=evolution"

  local out
  out="$(da_post "/CMD_API_MANAGE_USER_PACKAGES" "$body")"
  if printf '%s' "$out" | grep -q 'error=1'; then
    echo "[FAIL] nie udało się zapisać pakietu $name: $out" >&2
    return 1
  fi
  echo "[OK] zapisano pakiet: $name"
}

# limit_pair <field> <value|unlimited>
#   - realny limit → "&field=<n>"           (BEZ u<field> — inaczej DA = unlimited)
#   - unlimited    → "&field=unlimited&ufield=yes"
limit_pair() {
  local field="$1" value="$2"
  if [ "$value" = "unlimited" ]; then
    printf '&%s=unlimited&u%s=yes' "$field" "$field"
  else
    printf '&%s=%s' "$field" "$value"
  fi
}

echo "=== Verris — sync pakietów DirectAdmin (realne limity, bez flag u*) ==="
echo "Host: $base (user=$DA_USER, język=$DA_LANGUAGE)"
echo ""
echo "Istniejące pakiety:"
list_packages | sed 's/^/  - /' || true
echo ""

#               name      quota   bw       dom sub  mail fwd  ml  ar   db  dptr ftp  cpu mem  io     iops ep  nproc
upsert_package  starter   10240   102400   1   25   25   50   5   25   5   5    10   100 1024 10240  1024 30  46
upsert_package  pro       25600   512000   10  100  200  unlimited 25 100 25 25 50 200 2048 20480 2048 50  70
upsert_package  business  51200   1536000  unlimited unlimited unlimited unlimited 100 unlimited unlimited unlimited unlimited 400 4096 40960 4096 80 100

echo ""
echo "Weryfikacja (DA → Edytuj pakiet): transfer i dysk NIE są 'Bez ograniczeń'."
echo "Po sync — spróbuj ponownie utworzyć usługę w panelu klienta."
