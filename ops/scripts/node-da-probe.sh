#!/usr/bin/env bash
# =============================================================================
# Verris — kształt odpowiedzi API DirectAdmina na żywym węźle (tylko odczyt, bez wartości).
# Po teście D3 na t1 (28.09): kilka parserów w directadmin.service.ts zakładało format, którego
# DA 1.710 nie zwraca (lista DNS, Custom HTTPD). Ten skrypt pokazuje dla każdego odczytu, którego
# używa panel: kod HTTP, format (json / urlencoded / tekst / html) i same NAZWY pól — żadnych
# wartości, więc wynik można wkleić do rozmowy.
#
# Użycie (root na węźle):  bash node-da-probe.sh <login_konta> <domena>
# Klucze z `da api-url` (dokumentacja DA „API Access”) są tymczasowe (24 h) i nie są wypisywane.
# =============================================================================
set -Eeuo pipefail
U="${1:?login konta DA}"; D="${2:?domena konta}"
[[ "$U" =~ ^[a-z][a-z0-9]{0,15}$ ]] || { echo "zły login"; exit 1; }
[[ "$D" =~ ^[a-z0-9.-]+$ ]] || { echo "zła domena"; exit 1; }
DA=/usr/local/directadmin/directadmin
URL_KONTA="$($DA api-url --user="$U" | tail -1)"
URL_ADMINA="$($DA api-url | tail -1)"

opisz() { python3 -c '
import json, sys, urllib.parse
kod, body = sys.argv[1], sys.stdin.read()
def kszt(v, g=0):
    if isinstance(v, dict):
        if g > 2: return "{…%d}" % len(v)
        return "{" + ", ".join("%s:%s" % (k if len(k) < 40 else k[:37] + "…", kszt(x, g + 1)) for k, x in list(v.items())[:25]) + (", …" if len(v) > 25 else "") + "}"
    if isinstance(v, list): return "[%d× %s]" % (len(v), kszt(v[0], g + 1) if v else "")
    return type(v).__name__
t = body.strip()
if t.startswith("{") or t.startswith("["):
    try: print(kod, "json", kszt(json.loads(t))); sys.exit()
    except ValueError: pass
if t[:15].lower().startswith(("<!doctype", "<html")): print(kod, "html", len(t), "B"); sys.exit()
if "=" in t.split("\n", 1)[0] and " " not in t.split("&", 1)[0]:
    k = [x.split("=", 1)[0] for x in t.split("&") if x]
    print(kod, "urlencoded", len(k), "pól:", ", ".join(k[:30]) + (" …" if len(k) > 30 else "")); sys.exit()
print(kod, "tekst", len(t), "B,", len(t.splitlines()), "linii")
' "$1"; }

sonda() { # <poziom: konto|admin> <ścieżka?parametry> <json: 1|0>
  local baza="$URL_KONTA"; [ "$1" = admin ] && baza="$URL_ADMINA"
  local sep="?"; [[ "$2" == *\?* ]] && sep="&"
  local q="$2"; [ "$3" = 1 ] && q="$q${sep}json=yes"
  local tmp; tmp="$(mktemp)"
  local kod; kod="$(curl -sk --max-time 20 -o "$tmp" -w '%{http_code}' "$baza$q" || echo 000)"
  printf '%-6s %-62s ' "$1" "$(echo "$q" | sed "s/$D/DOMENA/g")"
  opisz "$kod" < "$tmp"; rm -f "$tmp"
}

for j in 1 0; do
  echo "=== json=$( [ $j = 1 ] && echo yes || echo no) ==="
  sonda konto "/CMD_API_SHOW_DOMAINS" $j
  sonda konto "/CMD_API_SHOW_USER_CONFIG" $j
  sonda konto "/CMD_API_SHOW_USER_USAGE" $j
  sonda konto "/CMD_API_DNS_CONTROL?domain=$D" $j
  sonda konto "/CMD_API_ADDITIONAL_DOMAINS?action=view&domain=$D" $j
  sonda konto "/CMD_API_SUBDOMAINS?domain=$D" $j
  sonda konto "/CMD_API_DOMAIN_POINTER?domain=$D" $j
  sonda konto "/CMD_API_POP?action=list&domain=$D" $j
  sonda konto "/CMD_API_EMAIL_FORWARDERS?domain=$D" $j
  sonda konto "/CMD_API_EMAIL_AUTORESPONDER?domain=$D" $j
  sonda konto "/CMD_API_EMAIL_CATCH_ALL?domain=$D" $j
  sonda konto "/CMD_API_SPAMASSASSIN?domain=$D" $j
  sonda konto "/CMD_API_FTP?action=list&domain=$D" $j
  sonda konto "/CMD_API_DATABASES" $j
  sonda konto "/CMD_API_SSL?domain=$D" $j
  sonda konto "/CMD_API_CRON" $j
  sonda konto "/CMD_API_SITE_BACKUP?domain=$D" $j
  sonda konto "/CMD_API_FILE_MANAGER?path=/domains/$D" $j
  sonda admin "/CMD_API_CUSTOM_HTTPD?domain=$D" $j
  sonda admin "/CMD_API_DNS_ADMIN?domain=$D&action=dnssec&value=get_keys" $j
  sonda admin "/CMD_API_SHOW_USERS" $j
  sonda admin "/CMD_API_IP_CONFIG" $j
done
