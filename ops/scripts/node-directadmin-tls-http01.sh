#!/usr/bin/env bash
# Verris — Let's Encrypt dla hostname węzła (HTTP-01, mechanizm DirectAdmina, bez OVH API).
# Uruchamiaj NA węźle compute jako root, gdy DNS A wskazuje na ten serwer i :80 jest otwarty.
#
#   bash ops/scripts/node-directadmin-tls-http01.sh node-pl-01.verris.pl
#   bash ops/scripts/node-directadmin-tls-http01.sh --renew node-pl-01.verris.pl
#
# Dla wildcard *.verris.pl użyj: ops/scripts/verris-node-wildcard-tls.sh (DNS-01 + OVH).
set -Eeuo pipefail

HOST="${1:-}"
RENEW=0
for arg in "$@"; do
  case "$arg" in
    --renew) RENEW=1 ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --*) ;;
    *) [ -z "$HOST" ] && HOST="$arg" ;;
  esac
done

LOG_TAG="[verris-node-http01-tls]"
log() { echo "$LOG_TAG $*"; }
die() { log "FAIL: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Uruchom jako root"
[ -n "$HOST" ] || die "Podaj hostname, np. node-pl-01.verris.pl"

DA="/usr/local/directadmin"
[ -x "$DA/scripts/letsencrypt.sh" ] || die "DirectAdmin nie znaleziony w $DA"

# Oficjalna dokumentacja DA („ACME For Server Hostname”): certyfikat hostname wydaje i odnawia sam
# DirectAdmin (Server Manager → Server TLS Certificate), ręcznie: scripts/letsencrypt.sh server_cert.
# DA kopiuje go też do serwera WWW, Exima/Dovecota i FTP. Wcześniejsza wersja brała cert z certbota
# i kopiowała go tylko do conf/ DirectAdmina — `certbot renew` nie kopiował odnowionego, więc po
# 90 dniach panel :2222 wystawiał wygasły certyfikat, a poczta i FTP nie dostawały go wcale.
SERVERNAME="$(sed -n 's/^servername=//p' "$DA/conf/directadmin.conf" 2>/dev/null | head -1)"
[ "$HOST" = "$SERVERNAME" ] || die "Hostname $HOST ≠ servername DirectAdmina ($SERVERNAME) — ustaw nazwę serwera w DA albo podaj właściwą"

resolved=$(getent ahostsv4 "$HOST" | awk '{print $1; exit}')
[ -n "$resolved" ] || die "DNS: $HOST nie ma rekordu A"
log "DNS $HOST → $resolved"
[ "$RENEW" = "1" ] && log "Odnowienie (DA odnawia też sam, automatycznie)"

log "Wydawanie certyfikatu hostname przez DirectAdmin (letsencrypt.sh server_cert)…"
"$DA/scripts/letsencrypt.sh" server_cert || die "letsencrypt.sh server_cert nie powiódł się — sprawdź port 80 i rekord A"

log "OK — certyfikat hostname wydany przez DirectAdmin dla $HOST"
log "Test: curl -vI https://${HOST}:2222/ 2>&1 | grep -E 'subject:|issuer:'"
