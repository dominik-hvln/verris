#!/usr/bin/env bash
#
# node-migration-worker.sh — Verris migration worker v2 (node side).
#
# Leases migration jobs queued by the control plane and executes the heavy
# transfer ON THE NODE that hosts the target account, so large rsync/SQL/
# IMAP traffic never crosses the API pods. Matches the protocol in
# apps/api/src/subscriptions/migration-worker.controller.ts:
#
#   GET  $API/node/migration-worker/lease             -> job JSON | null
#   POST $API/node/migration-worker/:jobId/complete   {bytesTransferred,filesTransferred,databasesMigrated,mailboxesMigrated,log}
#   POST $API/node/migration-worker/:jobId/fail       {error,log,retryable}
#   POST $API/node/migration-worker/:jobId/progress   {bytesTransferred,filesTransferred,note}   (heartbeat)
#
# Job kinds:
#   FILES_SFTP_RSYNC / FILES_DELTA — rsync-over-SSH (sshpass) z fallbackiem lftp
#   MYSQL_IMPORT                   — mysqldump zdalny, fallback mysqldump-przez-SSH
#   IMAP_SYNC / IMAP_DELTA         — imapsync (idempotentny, delta = drugi przebieg)
#   WP_FIXUP                       — wp-cli: wp-config DB creds + search-replace + ownership
#   HTTP_POST_CHECK                — curl 2xx/3xx na https://domena
#
# Heartbeat: każdy długi transfer melduje postęp co 60 s (watchdog w control
# plane wznawia joby, których worker umarł — zlecenie nie wisi w nieskończoność).
#
# Auth: /etc/verris.conf (VERRIS_SERVER_ID, VERRIS_IDENTITY_TOKEN, VERRIS_API_URL).
# Requires: root, jq, curl, rsync, sshpass, lftp, mysql client, imapsync, wp-cli.
#
# Usage:
#   node-migration-worker.sh once       # lease + run a single job (default)
#   node-migration-worker.sh drain      # keep running jobs until lease is empty
#   node-migration-worker.sh --install  # install systemd timer (every 2 min)
set -euo pipefail

CONF=/etc/verris.conf
LOG_TAG="verris-migration-worker"
HEARTBEAT_INTERVAL=60

# Z-03 — walidacja danych z formularza klienta PRZED użyciem ich w powłoce.
# Worker działa jako root na węźle, który hostuje konta innych klientów, a cała
# treść zlecenia (host, login, nazwa bazy, ścieżka) pochodzi z formularza.
# Biblioteka jest instalowana obok workera przez `--install`; przy uruchomieniu
# z bundla leży w ./lib/.
#
# Zachowanie przy braku pliku jest celowo FAIL-CLOSED: worker kończy pracę
# i nie bierze żadnego zlecenia. Kontrola bezpieczeństwa, która po cichu znika
# razem z plikiem, jest gorsza niż jej brak, bo daje fałszywe poczucie osłony.
VG_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/migration-input-guard.sh"
[ -r "$VG_LIB" ] || VG_LIB=/usr/local/sbin/verris-migration-guard.sh
if [ -r "$VG_LIB" ]; then
  # shellcheck source=lib/migration-input-guard.sh
  . "$VG_LIB"
else
  echo "brak migration-input-guard.sh — worker nie uruchomi żadnego zadania bez walidacji wejścia" >&2
  logger -t "$LOG_TAG" "missing migration-input-guard.sh — refusing to run" 2>/dev/null || true
  exit 78
fi

# Sprawdza komplet pól zlecenia wspólnych dla wszystkich rodzajów zadań.
# Zwraca 2 (błąd nieodwracalny — nie ma sensu ponawiać), bo powtórzenie tego
# samego zlecenia da ten sam wynik. Wartości NIE trafiają do logu.
vg_check_source() {
  local job="$1" logfile="$2" typ pole wartosc
  for typ in host port username; do
    wartosc=$(jq -r --arg k "$typ" '.source[$k] // empty' <<<"$job")
    vg_require "$typ" "$wartosc" "source.${typ}" 2>>"$logfile" || return 2
  done
  return 0
}

# Limit pasma transferu plików — fair-use na współdzielonym węźle, żeby jedna
# duża migracja nie wysyciła łącza/I/O innym klientom. Suffiksy rsync: K/M/G
# (na sekundę). "0" lub pusto = bez limitu. Nadpisywalne w /etc/verris.conf
# jako VERRIS_MIGRATION_BWLIMIT (np. "0" dla dedykowanego łącza, "10M" ostrożnie).
MIGRATION_BWLIMIT_DEFAULT="20M"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

require_conf() {
  [ -r "$CONF" ] || { echo "[FAIL] missing $CONF — bootstrap the node first." >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$CONF"
  : "${VERRIS_SERVER_ID:?}" "${VERRIS_IDENTITY_TOKEN:?}" "${VERRIS_API_URL:?}"
}

api() {
  # api METHOD PATH [JSON_BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS --max-time 60 -X "$method" \
      -H "X-Server-Id: $VERRIS_SERVER_ID" \
      -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$body" "${VERRIS_API_URL}${path}"
  else
    curl -fsS --max-time 60 -X "$method" \
      -H "X-Server-Id: $VERRIS_SERVER_ID" \
      -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \
      "${VERRIS_API_URL}${path}"
  fi
}

# --- job completion helpers -------------------------------------------------

complete_job() {
  # complete_job JOB_ID BYTES FILES DBS MAILBOXES LOGFILE
  # Dołącza raport spójności z pliku "${logfile}.integrity" (zapisanego przez
  # run_* — te działają w subshellu $(...), więc przekazujemy przez plik).
  local id="$1" bytes="$2" files="$3" dbs="$4" mboxes="$5" logfile="$6"
  local logtext; logtext=$(tail -c 200000 "$logfile" 2>/dev/null | jq -Rs . || echo '""')
  local integrity=""
  [ -f "${logfile}.integrity" ] && integrity=$(cat "${logfile}.integrity")
  echo "$integrity" | jq empty >/dev/null 2>&1 || integrity=""
  local body
  if [ -n "$integrity" ]; then
    body=$(jq -nc \
      --argjson bytes "${bytes:-0}" --argjson files "${files:-0}" \
      --argjson dbs "${dbs:-0}" --argjson mboxes "${mboxes:-0}" \
      --argjson log "$logtext" --argjson integrity "$integrity" \
      '{bytesTransferred:$bytes,filesTransferred:$files,databasesMigrated:$dbs,mailboxesMigrated:$mboxes,log:$log,integrity:$integrity}')
  else
    body=$(jq -nc \
      --argjson bytes "${bytes:-0}" --argjson files "${files:-0}" \
      --argjson dbs "${dbs:-0}" --argjson mboxes "${mboxes:-0}" \
      --argjson log "$logtext" \
      '{bytesTransferred:$bytes,filesTransferred:$files,databasesMigrated:$dbs,mailboxesMigrated:$mboxes,log:$log}')
  fi
  api POST "/node/migration-worker/${id}/complete" "$body" >/dev/null
  log "job $id completed (bytes=$bytes files=$files dbs=$dbs mboxes=$mboxes)"
}

fail_job() {
  # fail_job JOB_ID "error" LOGFILE RETRYABLE(true|false)
  local id="$1" err="$2" logfile="$3" retryable="${4:-true}"
  local logtext; logtext=$(tail -c 200000 "$logfile" 2>/dev/null | jq -Rs . || echo '""')
  local body
  body=$(jq -nc --arg err "$err" --argjson log "$logtext" --argjson retry "$retryable" \
    '{error:$err,log:$log,retryable:$retry}')
  api POST "/node/migration-worker/${id}/fail" "$body" >/dev/null || true
  log "job $id failed: $err (retryable=$retryable)"
}

post_progress() {
  # post_progress JOB_ID BYTES FILES "note"
  local id="$1" bytes="${2:-0}" files="${3:-0}" note="${4:-}"
  local body
  body=$(jq -nc --argjson bytes "$bytes" --argjson files "$files" --arg note "$note" \
    '{bytesTransferred:$bytes,filesTransferred:$files,note:$note}')
  api POST "/node/migration-worker/${id}/progress" "$body" >/dev/null 2>&1 || true
}

# Heartbeat w tle: co HEARTBEAT_INTERVAL s mierzy rozmiar katalogu docelowego
# (jeśli podany) i melduje postęp do control plane.
start_heartbeat() {
  # start_heartbeat JOB_ID [WATCH_DIR] [NOTE]
  local id="$1" dir="${2:-}" note="${3:-transfer in progress}"
  (
    while :; do
      sleep "$HEARTBEAT_INTERVAL"
      local bytes=0 files=0
      if [ -n "$dir" ] && [ -d "$dir" ]; then
        bytes=$(du -sb "$dir" 2>/dev/null | awk '{print $1+0}')
        files=$(find "$dir" -type f 2>/dev/null | wc -l | awk '{print $1+0}')
      fi
      post_progress "$id" "${bytes:-0}" "${files:-0}" "$note"
    done
  ) &
  HEARTBEAT_PID=$!
}

stop_heartbeat() {
  [ -n "${HEARTBEAT_PID:-}" ] && kill "$HEARTBEAT_PID" 2>/dev/null || true
  HEARTBEAT_PID=""
}

# --- per-kind executors -----------------------------------------------------

# Resolve the on-disk doc root for a DA account/domain.
docroot_for() {
  local user="$1" domain="$2"
  echo "/home/${user}/domains/${domain}/public_html"
}

# Konwersja limitu w stylu rsync (np. "20M", "512K", "1G", "1500") na bajty/s
# dla lftp (net:limit-total-rate). rsync bez sufiksu = KiB/s.
bwlimit_to_bytes() {
  local v="$1" num unit
  num=$(echo "$v" | sed -E 's/[^0-9.].*$//')
  unit=$(echo "$v" | sed -E 's/^[0-9.]+//' | tr 'a-z' 'A-Z')
  [ -n "$num" ] || { echo 0; return; }
  case "$unit" in
    G) awk -v n="$num" 'BEGIN{printf "%d", n*1024*1024*1024}' ;;
    M) awk -v n="$num" 'BEGIN{printf "%d", n*1024*1024}' ;;
    K) awk -v n="$num" 'BEGIN{printf "%d", n*1024}' ;;
    "") awk -v n="$num" 'BEGIN{printf "%d", n*1024}' ;;  # rsync: goły = KiB/s
    *) echo 0 ;;
  esac
}

SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o PreferredAuthentications=password -o PubkeyAuthentication=no)

run_files() {
  # rsync-over-SSH (szybki, wznawialny, delta) z fallbackiem na lftp mirror
  # (działa też na kontach sftp-only/ftp/ftps). Delta = drugi przebieg tych
  # samych narzędzi — oba są przyrostowe z natury.
  local job="$1" logfile="$2"
  local user domain dst proto host port suser spass spath
  user=$(jq -r '.target.accountUsername // empty' <<<"$job")
  domain=$(jq -r '.target.domain // empty' <<<"$job")
  proto=$(jq -r '.source.protocol // "sftp"' <<<"$job")
  host=$(jq -r '.source.host' <<<"$job")
  port=$(jq -r '.source.port' <<<"$job")
  suser=$(jq -r '.source.username' <<<"$job")
  spass=$(jq -r '.source.password' <<<"$job")
  spath=$(jq -r '.source.remotePath // "/"' <<<"$job")
  [ -n "$user" ] && [ -n "$domain" ] || { echo "missing target account/domain" >>"$logfile"; return 2; }

  # Z-03: `spath` trafiał do `lftp -e "... mirror '\''${spath}'\'' ..."`. Apostrof
  # w ścieżce zamykał cytowanie, a lftp wykonuje polecenia powłoki po `!`.
  vg_check_source "$job" "$logfile" || return 2
  vg_require protocol "$proto" "source.protocol" 2>>"$logfile" || return 2
  vg_require path "$spath" "source.remotePath" 2>>"$logfile" || return 2
  vg_require account "$user" "target.accountUsername" 2>>"$logfile" || return 2
  dst=$(docroot_for "$user" "$domain")
  mkdir -p "$dst"

  local bwlimit="${VERRIS_MIGRATION_BWLIMIT:-$MIGRATION_BWLIMIT_DEFAULT}"
  local rsync_bw=() lftp_bw=""
  if [ -n "$bwlimit" ] && [ "$bwlimit" != "0" ]; then
    rsync_bw=(--bwlimit="$bwlimit")
    local bwbytes; bwbytes=$(bwlimit_to_bytes "$bwlimit")
    [ "$bwbytes" -gt 0 ] 2>/dev/null && lftp_bw="set net:limit-total-rate ${bwbytes}:0;"
    echo "== bwlimit=${bwlimit} (fair-use)" >>"$logfile"
  fi

  local transferred=false
  if [ "$proto" = "sftp" ] && command -v rsync >/dev/null 2>&1 && command -v sshpass >/dev/null 2>&1; then
    echo "== rsync over SSH ${suser}@${host}:${port}${spath} -> ${dst}" >>"$logfile"
    if sshpass -p "$spass" rsync -az --partial --delete-excluded \
        --exclude '.cache' --exclude 'tmp/' \
        --timeout=120 --info=stats2 "${rsync_bw[@]}" \
        -e "ssh ${SSH_OPTS[*]} -p ${port}" \
        "${suser}@${host}:${spath%/}/" "${dst}/" >>"$logfile" 2>&1; then
      transferred=true
    else
      echo "== rsync failed (brak shella na źródle?) — fallback lftp mirror" >>"$logfile"
    fi
  fi

  if [ "$transferred" = false ]; then
    # lftp mirrors recursively over sftp/ftp/ftps and is resilient to flaky links.
    #
    # `${spath}` jest wstawiana do łańcucha poleceń lftp w apostrofach. Jest to
    # bezpieczne wyłącznie dlatego, że vg_require path wyżej odrzuca apostrof,
    # cudzysłów, backslash, dolar, średnik i nową linię. Gdyby ta walidacja
    # kiedyś stąd zniknęła, wraca wykonanie polecenia jako root — lftp wykonuje
    # polecenia powłoki po `!`.
    local ssl_setting=""
    [ "$proto" = "ftps" ] && ssl_setting="set ftp:ssl-force true; set ftp:ssl-protect-data true;"
    LFTP_PASSWORD="$spass" lftp -u "$suser,dummy" \
      -e "set sftp:auto-confirm yes; set net:max-retries 3; set net:timeout 30; \
          set ssl:verify-certificate no; ${lftp_bw} ${ssl_setting} \
          mirror --continue --parallel=4 --no-perms --verbose '${spath}' '${dst}'; bye" \
      "${proto}://${host}:${port}" >>"$logfile" 2>&1 <<EOF
$spass
EOF
  fi

  # DA-correct ownership so PHP-FPM / suEXEC can serve the files.
  chown -R "${user}:${user}" "$dst" >>"$logfile" 2>&1 || true

  local bytes files
  bytes=$(du -sb "$dst" 2>/dev/null | awk '{print $1+0}')
  files=$(find "$dst" -type f 2>/dev/null | wc -l | awk '{print $1+0}')

  # Raport spójności: liczba plików źródła (z rsync --stats "reg:") vs cel.
  # Na ścieżce lftp brak statystyk — źródło pozostaje null (raport tylko celu).
  local src_files
  src_files=$(grep -oE 'Number of files:[^(]*\(reg: *[0-9,]+' "$logfile" 2>/dev/null | tail -1 | grep -oE 'reg: *[0-9,]+' | grep -oE '[0-9,]+' | tr -d ',')
  if [ -n "$src_files" ]; then
    jq -nc --argjson s "$src_files" --argjson t "$files" --argjson b "$bytes" \
      '{kind:"files", sourceFiles:$s, targetFiles:$t, targetBytes:$b, match:($s==$t)}' >"${logfile}.integrity"
  else
    jq -nc --argjson t "$files" --argjson b "$bytes" \
      '{kind:"files", sourceFiles:null, targetFiles:$t, targetBytes:$b, match:null}' >"${logfile}.integrity"
  fi
  echo "$bytes $files"
}

# Sumuje dokładną liczbę wierszy (COUNT(*)) po tabelach bazy podanym klientem
# mysql. $1 = prefiks komendy mysql (np. "mysql --protocol=socket" albo
# "MYSQL_PWD=... mysql -h host -P port -u user"), $2 = nazwa bazy.
# Z-03: było `eval "$mysql_cmd -N -e \"... table_schema='${db}' ...\""` — nazwa
# bazy pochodzi od klienta, więc `eval` dawał wykonanie polecenia jako root,
# a nie tylko wstrzyknięcie SQL. Teraz komenda mysql jest tablicą argumentów,
# a `db` jest wcześniej zwalidowana przez vg_require.
mysql_row_total() {
  local db="$1"; shift
  local -a mysql_cmd=("$@")
  local t total=0 c tables
  vg_is_db "$db" || return 1
  tables=$("${mysql_cmd[@]}" -N -e \
    "SELECT table_name FROM information_schema.tables WHERE table_schema='${db}' AND table_type='BASE TABLE'" 2>/dev/null) || return 1
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    # Nazwa tabeli pochodzi z obcej bazy — backtick w nazwie rozerwałby cytowanie
    # w SQL. Tabele o nietypowej nazwie pomijamy w raporcie spójności zamiast
    # ryzykować; raport jest wtedy zaniżony, ale nie jest wektorem.
    vg_is_db "$t" || { echo "pomijam tabelę o niestandardowej nazwie w raporcie spójności" >&2; continue; }
    c=$("${mysql_cmd[@]}" -N -e "SELECT COUNT(*) FROM \`${db}\`.\`${t}\`" 2>/dev/null) || c=0
    total=$((total + ${c:-0}))
  done <<<"$tables"
  echo "$total"
}

# Z-03: funkcja zwracała GOTOWĄ KOMENDĘ jako tekst, a wywołanie szło przez
# `| eval "$import_cmd"`. Teraz przygotowuje bazę i zwraca samą jej nazwę —
# import wykonuje się zwykłym wywołaniem, bez eval.
mysql_prepare_target_db() {
  # Zwraca (echo) komendę importu do bazy docelowej. Import ZAWSZE idzie przez
  # lokalny root-socket (pewny, bez problemu localhost vs 127.0.0.1 w grantach
  # DA). Gdy baza docelowa powstała już w DirectAdmin (targetDb z lease), tylko
  # do niej importujemy — użytkownik/hasło DA trafiają do wp-config i to przez
  # nie łączy się WordPress (user@localhost przez socket). Gdy brak targetDb,
  # tworzymy bazę wg konwencji DA i nadajemy grant kontu.
  local job="$1" logfile="$2"
  local tdb user sdb
  tdb=$(jq -r '.targetDb.database // empty' <<<"$job")
  if [ -n "$tdb" ]; then
    vg_is_db "$tdb" || { echo "targetDb.database ma niedozwoloną nazwę" >>"$logfile"; return 2; }
    mysql --protocol=socket -e "CREATE DATABASE IF NOT EXISTS \`${tdb}\` CHARACTER SET utf8mb4;" >>"$logfile" 2>&1 || true
    echo "$tdb"
    return 0
  fi
  # Fallback: DA convention <dauser>_<sourcedb> przez root socket + grant konta.
  user=$(jq -r '.target.accountUsername // empty' <<<"$job")
  sdb=$(jq -r '.source.database' <<<"$job")
  tdb=$(printf '%s_%s' "$user" "$sdb" | tr -c 'a-zA-Z0-9_' '_' | cut -c1-64)
  mysql --protocol=socket -e "CREATE DATABASE IF NOT EXISTS \`${tdb}\` CHARACTER SET utf8mb4;" >>"$logfile" 2>&1
  mysql --protocol=socket -e "GRANT ALL ON \`${tdb}\`.* TO '${user}'@'localhost';" >>"$logfile" 2>&1 || true
  echo "$tdb"
}


run_mysql() {
  # Ścieżka 1: zdalny mysqldump (gdy źródło wystawia MySQL na świat).
  # Ścieżka 2: mysqldump przez SSH na koncie plikowym źródła (typowe na
  # hostingach współdzielonych, gdzie MySQL słucha tylko na localhost).
  local job="$1" logfile="$2"
  local shost sport sdb suser spass tdb
  shost=$(jq -r '.source.host' <<<"$job")
  sport=$(jq -r '.source.port' <<<"$job")
  sdb=$(jq -r '.source.database' <<<"$job")
  suser=$(jq -r '.source.username' <<<"$job")
  spass=$(jq -r '.source.password' <<<"$job")

  # Z-03: `sdb` szła do `eval`, a stamtąd do polecenia powłoki jako root.
  vg_check_source "$job" "$logfile" || return 2
  vg_require db "$sdb" "source.database" 2>>"$logfile" || return 2

  tdb=$(mysql_prepare_target_db "$job" "$logfile") || return 2
  vg_require db "$tdb" "targetDb.database" 2>>"$logfile" || return 2

  local dumped=false remote_reachable=false
  echo "== mysqldump remote ${suser}@${shost}:${sport}/${sdb} -> ${tdb}" >>"$logfile"
  if MYSQL_PWD="$spass" mysqldump --single-transaction --quick --routines --triggers \
      --no-tablespaces --set-gtid-purged=OFF \
      -h "$shost" -P "$sport" -u "$suser" "$sdb" 2>>"$logfile" \
      | mysql --protocol=socket "$tdb" 2>>"$logfile"; then
    dumped=true
    remote_reachable=true
  else
    echo "== remote mysqldump failed — próbuję przez SSH" >>"$logfile"
  fi

  if [ "$dumped" = false ]; then
    local sshhost sshport sshuser sshpass_
    sshhost=$(jq -r '.sshFallback.host // empty' <<<"$job")
    sshport=$(jq -r '.sshFallback.port // empty' <<<"$job")
    sshuser=$(jq -r '.sshFallback.username // empty' <<<"$job")
    sshpass_=$(jq -r '.sshFallback.password // empty' <<<"$job")
    if [ -n "$sshhost" ] && command -v sshpass >/dev/null 2>&1; then
      echo "== mysqldump via SSH ${sshuser}@${sshhost}:${sshport}" >>"$logfile"
      # shellcheck disable=SC2029
      if sshpass -p "$sshpass_" ssh "${SSH_OPTS[@]}" -p "$sshport" "${sshuser}@${sshhost}" \
          "MYSQL_PWD=$(printf %q "$spass") mysqldump --single-transaction --quick --routines --triggers --no-tablespaces -h 127.0.0.1 -u $(printf %q "$suser") $(printf %q "$sdb")" \
          2>>"$logfile" | mysql --protocol=socket "$tdb" 2>>"$logfile"; then
        dumped=true
      fi
    fi
  fi

  [ "$dumped" = true ] || return 3

  local bytes
  bytes=$(mysql --protocol=socket -N -e \
    "SELECT IFNULL(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema='${tdb}';" 2>/dev/null || echo 0)

  # Raport spójności: dokładna liczba tabel i wierszy w bazie docelowej; gdy
  # źródłowy MySQL był bezpośrednio osiągalny (ścieżka remote) — też źródło.
  local tgt_tables tgt_rows src_rows="null" match="null"
  tgt_tables=$(mysql --protocol=socket -N -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${tdb}' AND table_type='BASE TABLE';" 2>/dev/null || echo 0)
  tgt_rows=$(mysql_row_total "$tdb" mysql --protocol=socket 2>/dev/null || echo 0)
  if [ "$remote_reachable" = true ]; then
    src_rows=$(mysql_row_total "$sdb" env "MYSQL_PWD=$spass" mysql -h "$shost" -P "$sport" -u "$suser" 2>/dev/null || echo null)
    [ "$src_rows" != "null" ] && { [ "${src_rows:-0}" -eq "${tgt_rows:-0}" ] 2>/dev/null && match=true || match=false; }
  fi
  jq -nc \
    --arg db "$tdb" --argjson tables "${tgt_tables:-0}" --argjson rows "${tgt_rows:-0}" \
    --argjson srows "${src_rows:-null}" --argjson match "${match:-null}" \
    '{kind:"mysql", database:$db, targetTables:$tables, targetRows:$rows, sourceRows:$srows, match:$match}' >"${logfile}.integrity"
  echo "${bytes:-0}"
}

run_imap() {
  # imapsync from the source mailbox into the local dovecot mailbox for the same
  # address. The local account is addressed over localhost IMAP using the DA
  # mail user; doveadm master auth is used so we never need the target password.
  # Delta = ten sam przebieg: imapsync jest idempotentny (Message-Id dedupe).
  local job="$1" logfile="$2"
  local email shost sport suser spass
  email=$(jq -r '.source.email // .source.username' <<<"$job")
  shost=$(jq -r '.source.host' <<<"$job")
  sport=$(jq -r '.source.port' <<<"$job")
  suser=$(jq -r '.source.username' <<<"$job")
  spass=$(jq -r '.source.password' <<<"$job")

  # Z-03: te wartości idą do argumentów imapsync. Argumenty są cytowane, więc
  # nie ma tu wstrzyknięcia powłoki — walidujemy mimo to, żeby jedno zlecenie
  # zachowywało się tak samo we wszystkich trzech ścieżkach i żeby dziwne dane
  # zatrzymały się na wejściu, a nie w połowie transferu.
  vg_check_source "$job" "$logfile" || return 2
  vg_require email "$email" "source.email" 2>>"$logfile" || return 2

  # Master-user login to the local dovecot (configured during node bootstrap).
  local master_user="${VERRIS_DOVECOT_MASTER_USER:-}" master_pass="${VERRIS_DOVECOT_MASTER_PASS:-}"
  [ -n "$master_user" ] && [ -n "$master_pass" ] || {
    echo "dovecot master credentials not configured (VERRIS_DOVECOT_MASTER_USER/PASS)" >>"$logfile"; return 2; }

  local tls1=()
  [ "$sport" = "993" ] && tls1=(--ssl1) || tls1=(--tls1)

  imapsync \
    --host1 "$shost" --port1 "$sport" --user1 "$suser" --password1 "$spass" "${tls1[@]}" \
    --host2 127.0.0.1 --port2 143 --user2 "$email" \
    --authuser2 "$master_user" --password2 "$master_pass" --authmech2 PLAIN \
    --no-modulesversion --automap --skipcrossduplicates \
    --useheader 'Message-Id' --useheader 'Date' \
    --nofoldersizes --nofoldersizesatend \
    >>"$logfile" 2>&1

  # Raport spójności: liczby wiadomości źródła/celu z podsumowania imapsync.
  local host1_msgs host2_msgs
  host1_msgs=$(grep -oE 'Host1 Nb messages[^0-9]*[0-9]+' "$logfile" 2>/dev/null | tail -1 | grep -oE '[0-9]+$')
  host2_msgs=$(grep -oE 'Host2 Nb messages[^0-9]*[0-9]+' "$logfile" 2>/dev/null | tail -1 | grep -oE '[0-9]+$')
  if [ -n "$host1_msgs" ] || [ -n "$host2_msgs" ]; then
    jq -nc --arg email "$email" \
      --argjson s "${host1_msgs:-null}" --argjson t "${host2_msgs:-null}" \
      '{kind:"imap", mailbox:$email, sourceMessages:$s, targetMessages:$t,
        match:( if ($s!=null and $t!=null) then ($t>=$s) else null end )}' >"${logfile}.integrity"
  fi
  echo "1" # mailboxes migrated
}

run_wp_fixup() {
  # Auto-fix WordPressa po imporcie plików + bazy:
  #  1. znajduje wp-config.php w docroot,
  #  2. mapuje DB_NAME ze starego hostingu na bazę docelową (z lease),
  #  3. wpisuje nowe DB_NAME/DB_USER/DB_PASSWORD/DB_HOST przez wp-cli,
  #  4. search-replace starej domeny (gdy różna od docelowej),
  #  5. flush cache/rewrite + ownership.
  local job="$1" logfile="$2"
  local user domain dst
  user=$(jq -r '.target.accountUsername // empty' <<<"$job")
  domain=$(jq -r '.target.domain // empty' <<<"$job")
  dst=$(docroot_for "$user" "$domain")

  if [ ! -f "${dst}/wp-config.php" ]; then
    echo "wp-config.php not found in ${dst} — not a WordPress site, nothing to fix." >>"$logfile"
    echo "0"
    return 0
  fi

  command -v wp >/dev/null 2>&1 || {
    echo "wp-cli is not installed on this node" >>"$logfile"; return 2; }

  local old_db
  old_db=$(sudo -u "$user" -- wp config get DB_NAME --path="$dst" 2>>"$logfile" || echo "")
  echo "== WordPress detected, current DB_NAME=${old_db}" >>"$logfile"

  # Mapowanie: source db name -> target {database,username,password}.
  local mapping tdb tuser tpass
  mapping=$(jq -c --arg old "$old_db" '
    (.wp.databases // [])
    | (map(select(.source == $old)) + map(select(.source != $old)))
    | map(select(.target != null))
    | first // empty' <<<"$job")
  if [ -n "$mapping" ]; then
    tdb=$(jq -r '.target.database' <<<"$mapping")
    tuser=$(jq -r '.target.username' <<<"$mapping")
    tpass=$(jq -r '.target.password' <<<"$mapping")
    echo "== wp config set DB_* -> ${tdb} / ${tuser}" >>"$logfile"
    sudo -u "$user" -- wp config set DB_NAME "$tdb" --path="$dst" >>"$logfile" 2>&1
    sudo -u "$user" -- wp config set DB_USER "$tuser" --path="$dst" >>"$logfile" 2>&1
    sudo -u "$user" -- wp config set DB_PASSWORD "$tpass" --path="$dst" --quiet >>"$logfile" 2>&1
    sudo -u "$user" -- wp config set DB_HOST "localhost" --path="$dst" >>"$logfile" 2>&1
  else
    echo "== brak mapowania bazy docelowej (import poszedł po starych nazwach) — DB creds bez zmian" >>"$logfile"
  fi

  # Weryfikacja połączenia WP z bazą — twardy warunek sukcesu.
  if ! sudo -u "$user" -- wp core is-installed --path="$dst" >>"$logfile" 2>&1; then
    echo "wp core is-installed failed — WordPress nie łączy się z bazą po imporcie" >>"$logfile"
    return 3
  fi

  # Zmiana domeny (np. przenosiny z domeny tymczasowej starego hostingu).
  local source_domain target_domain
  source_domain=$(jq -r '.wp.sourceDomain // empty' <<<"$job")
  target_domain=$(jq -r '.wp.targetDomain // empty' <<<"$job")
  if [ -n "$source_domain" ] && [ -n "$target_domain" ] && [ "$source_domain" != "$target_domain" ]; then
    echo "== wp search-replace //${source_domain} -> //${target_domain}" >>"$logfile"
    sudo -u "$user" -- wp search-replace "//${source_domain}" "//${target_domain}" \
      --all-tables --precise --skip-columns=guid --report-changed-only --path="$dst" >>"$logfile" 2>&1 || return 3
  fi

  sudo -u "$user" -- wp rewrite flush --hard --path="$dst" >>"$logfile" 2>&1 || true
  sudo -u "$user" -- wp cache flush --path="$dst" >>"$logfile" 2>&1 || true
  chown -R "${user}:${user}" "$dst" >>"$logfile" 2>&1 || true
  echo "1" # wp fixed
}

run_http_check() {
  local job="$1" logfile="$2"
  local url; url=$(jq -r '.check.url // empty' <<<"$job")
  [ -n "$url" ] || { echo "no check url" >>"$logfile"; return 2; }
  local code
  # --resolve na własny adres: sprawdzamy nowy hosting nawet PRZED zmianą DNS.
  local domain node_ip
  domain=$(jq -r '.target.domain // empty' <<<"$job")
  node_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  local resolve_opts=()
  if [ -n "$domain" ] && [ -n "$node_ip" ]; then
    resolve_opts=(--resolve "${domain}:443:${node_ip}" --resolve "${domain}:80:${node_ip}")
  fi
  code=$(curl -sSk -o /dev/null -w '%{http_code}' --max-time 30 -L "${resolve_opts[@]}" "$url" 2>>"$logfile" || echo 000)
  echo "HTTP $code for $url (resolved to ${node_ip:-public DNS})" >>"$logfile"
  [[ "$code" =~ ^(2|3)[0-9][0-9]$ ]]
}

# --- main loop --------------------------------------------------------------

run_one() {
  local job; job=$(api GET "/node/migration-worker/lease" || echo "null")
  [ "$job" = "null" ] || [ -z "$job" ] && { return 9; } # nothing to do

  local id kind; id=$(jq -r '.id' <<<"$job"); kind=$(jq -r '.kind' <<<"$job")
  [ -n "$id" ] && [ "$id" != "null" ] || return 9
  local logfile; logfile=$(mktemp /tmp/verris-mig-XXXXXX.log)
  log "leased job $id kind=$kind"

  local user domain dst=""
  user=$(jq -r '.target.accountUsername // empty' <<<"$job")
  domain=$(jq -r '.target.domain // empty' <<<"$job")
  [ -n "$user" ] && [ -n "$domain" ] && dst=$(docroot_for "$user" "$domain")

  set +e
  case "$kind" in
    FILES_SFTP_RSYNC|FILES_DELTA)
      start_heartbeat "$id" "$dst" "kopiowanie plików ($kind)"
      out=$(run_files "$job" "$logfile"); rc=$?
      stop_heartbeat
      if [ $rc -eq 0 ]; then complete_job "$id" "${out% *}" "${out#* }" 0 0 "$logfile"
      else fail_job "$id" "files transfer failed (rc=$rc)" "$logfile" true; fi ;;
    MYSQL_IMPORT)
      start_heartbeat "$id" "" "import bazy MySQL"
      out=$(run_mysql "$job" "$logfile"); rc=$?
      stop_heartbeat
      if [ $rc -eq 0 ]; then complete_job "$id" "${out:-0}" 0 1 0 "$logfile"
      else fail_job "$id" "mysql import failed (rc=$rc)" "$logfile" true; fi ;;
    IMAP_SYNC|IMAP_DELTA)
      start_heartbeat "$id" "" "synchronizacja skrzynki IMAP ($kind)"
      out=$(run_imap "$job" "$logfile"); rc=$?
      stop_heartbeat
      if [ $rc -eq 0 ]; then complete_job "$id" 0 0 0 "${out:-1}" "$logfile"
      else fail_job "$id" "imap sync failed (rc=$rc)" "$logfile" true; fi ;;
    WP_FIXUP)
      out=$(run_wp_fixup "$job" "$logfile"); rc=$?
      if [ $rc -eq 0 ]; then complete_job "$id" 0 0 0 0 "$logfile"
      elif [ $rc -eq 3 ]; then fail_job "$id" "wordpress fixup failed (db connection / search-replace)" "$logfile" true
      else fail_job "$id" "wordpress fixup failed (rc=$rc)" "$logfile" true; fi ;;
    HTTP_POST_CHECK)
      run_http_check "$job" "$logfile"; rc=$?
      if [ $rc -eq 0 ]; then complete_job "$id" 0 0 0 0 "$logfile"
      else fail_job "$id" "http check failed" "$logfile" false; fi ;;
    *)
      fail_job "$id" "unknown job kind: $kind" "$logfile" false ;;
  esac
  set -e
  stop_heartbeat
  rm -f "$logfile" "${logfile}.integrity"
  return 0
}

ensure_deps() {
  # Best-effort install of the transfer tools. Non-fatal: a missing tool only
  # affects its own job kind (worker reports that job as retryable-failed).
  local need=(jq curl rsync sshpass lftp mysql imapsync)
  local missing=()
  for b in "${need[@]}"; do command -v "$b" >/dev/null 2>&1 || missing+=("$b"); done
  if [ ${#missing[@]} -gt 0 ]; then
    log "installing missing tools: ${missing[*]}"
    if command -v dnf >/dev/null 2>&1; then
      dnf install -y epel-release >/dev/null 2>&1 || true
      dnf install -y jq curl rsync sshpass lftp mariadb imapsync >/dev/null 2>&1 || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y epel-release >/dev/null 2>&1 || true
      yum install -y jq curl rsync sshpass lftp mariadb imapsync >/dev/null 2>&1 || true
    elif command -v apt-get >/dev/null 2>&1; then
      apt-get update >/dev/null 2>&1 || true
      apt-get install -y jq curl rsync sshpass lftp mariadb-client imapsync >/dev/null 2>&1 || true
    fi
  fi

  # imapsync: pakiet dystrybucyjny dostarcza zależności Perla, ale sam skrypt bywa
  # mocno przestarzały. Autor zaleca najnowszą wersję (kompatybilność z Gmailem/
  # Exchange, poprawki serwerów IMAP). Nadpisujemy binarkę najnowszym oficjalnym
  # skryptem w /usr/local/bin (wyprzedza /usr/bin w PATH). Best-effort: gdy pobranie
  # się nie uda, zostaje wersja z pakietu. Pin przez IMAPSYNC_URL (domyślnie: latest).
  local imapsync_url="${IMAPSYNC_URL:-https://imapsync.lamiral.info/imapsync}"
  local imapsync_dst="/usr/local/bin/imapsync"
  if curl -fsSL --retry 2 -o "${imapsync_dst}.tmp" "$imapsync_url" 2>/dev/null \
     && head -1 "${imapsync_dst}.tmp" | grep -q '^#!'; then
    chmod +x "${imapsync_dst}.tmp" && mv -f "${imapsync_dst}.tmp" "$imapsync_dst"
    hash -r 2>/dev/null || true
    log "imapsync (oficjalny): $(imapsync --version 2>/dev/null | head -1 || echo 'wersja nieznana')"
  else
    rm -f "${imapsync_dst}.tmp" 2>/dev/null || true
    log "imapsync overlay pominięty — używam wersji z pakietu: $(imapsync --version 2>/dev/null | head -1 || echo 'brak')"
  fi
  # wp-cli — oficjalny phar (podpisywany), potrzebny do WP_FIXUP.
  if ! command -v wp >/dev/null 2>&1; then
    log "installing wp-cli"
    curl -fsSL -o /usr/local/bin/wp \
      https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
      && chmod +x /usr/local/bin/wp || log "wp-cli install failed — WP_FIXUP będzie zgłaszał retryable fail"
  fi
}

install_timer() {
  require_conf
  ensure_deps
  install -m 0755 "$0" /usr/local/sbin/verris-migration-worker
  # Biblioteka walidacji musi wylądować obok workera — bez niej worker startuje
  # fail-closed i nie weźmie żadnego zlecenia (Z-03).
  local guard_src
  guard_src="$(cd "$(dirname "$0")" && pwd)/lib/migration-input-guard.sh"
  if [ -r "$guard_src" ]; then
    install -m 0755 "$guard_src" /usr/local/sbin/verris-migration-guard.sh
  else
    log "BRAK ${guard_src} — worker nie ruszy bez walidacji wejścia; skopiuj cały katalog ops/scripts (z podkatalogiem lib/)"
    return 78
  fi
  cat >/etc/systemd/system/verris-migration-worker.service <<'UNIT'
[Unit]
Description=Verris competitor-migration worker (lease + execute)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/verris-migration-worker drain
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=6
UNIT
  cat >/etc/systemd/system/verris-migration-worker.timer <<'UNIT'
[Unit]
Description=Run Verris migration worker every 2 minutes

[Timer]
OnBootSec=90
OnUnitActiveSec=120
AccuracySec=20

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now verris-migration-worker.timer
  log "installed verris-migration-worker.timer (every 2 min)"
}

main() {
  case "${1:-once}" in
    --install|install-timer) install_timer ;;
    drain)
      require_conf
      ensure_deps
      local n=0
      while :; do
        run_one; rc=$?
        [ $rc -eq 9 ] && break
        n=$((n+1)); [ $n -ge 20 ] && break # safety cap per invocation
      done
      log "drain finished ($n job(s))" ;;
    once|*)
      require_conf
      run_one || true ;;
  esac
}

trap stop_heartbeat EXIT
main "$@"
