#!/usr/bin/env bash
# =============================================================================
# Verris — akceptacyjny test LIVE (black-box, READ-ONLY)
# Sprawdza zdrowie, bezpieczeństwo HTTP/TLS i publiczne kontrakty API po deployu.
# Nic nie modyfikuje. Uruchom z dowolnej maszyny z dostępem do domen:
#   BASE_API=https://api.verris.pl \
#   BASE_PANEL=https://panel.verris.pl \
#   BASE_ADMIN=https://admin.verris.pl \
#   BASE_STAFF=https://staff.verris.pl \
#   BASE_STATUS=https://status.verris.pl \
#   bash ops/scripts/prod-live-acceptance.sh
# Wyjście: 0 = wszystko OK/niezbędne, >0 = liczba twardych błędów.
# =============================================================================
set -uo pipefail

API="${BASE_API:-https://api.verris.pl}"
PANEL="${BASE_PANEL:-https://panel.verris.pl}"
ADMIN="${BASE_ADMIN:-https://admin.verris.pl}"
STAFF="${BASE_STAFF:-https://staff.verris.pl}"
STATUS="${BASE_STATUS:-https://status.verris.pl}"
CURL=(curl -sS --max-time 20)

PASS=0; WARN=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
sec()  { echo; echo "=== $1 ==="; }

# Zwraca kod HTTP dla GET
code() { "${CURL[@]}" -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || echo "ERR"; }
# Zwraca nagłówki
hdrs() { "${CURL[@]}" -D - -o /dev/null "$1" 2>/dev/null; }
# Body
body() { "${CURL[@]}" "$1" 2>/dev/null; }

sec "1. Zdrowie API"
for p in healthz readyz; do
  c=$(code "$API/$p")
  [[ "$c" == "200" ]] && ok "GET /$p → 200" || fail "GET /$p → $c (oczekiwano 200)"
done
rb=$(body "$API/readyz")
echo "$rb" | grep -q '"database"' && echo "$rb" | grep -qi '"up"\|"ok"' \
  && ok "readyz: baza danych up" || warn "readyz nie potwierdza bazy: $rb"

sec "2. Dostępność paneli (HTTP 2xx/3xx)"
for pair in "PANEL:$PANEL" "ADMIN:$ADMIN" "STAFF:$STAFF" "STATUS:$STATUS"; do
  name="${pair%%:*}"; url="${pair#*:}"
  c=$(code "$url/")
  if [[ "$c" =~ ^(200|301|302|307|308)$ ]]; then ok "$name $url → $c"
  else fail "$name $url → $c"; fi
done

sec "3. TLS / HTTPS (przekierowanie z http, ważny cert)"
for url in "$API" "$PANEL" "$ADMIN"; do
  host="${url#https://}"
  hc=$(code "http://$host/")
  [[ "$hc" =~ ^(301|302|307|308)$ ]] && ok "http://$host przekierowuje ($hc)" \
    || warn "http://$host nie przekierowuje na https ($hc)"
  if echo | timeout 12 openssl s_client -connect "${host}:443" -servername "$host" 2>/dev/null \
      | openssl x509 -noout -checkend 604800 >/dev/null 2>&1; then
    ok "Cert $host ważny >7 dni"
  else warn "Cert $host wygasa <7 dni lub niedostępny"; fi
done

sec "4. Nagłówki bezpieczeństwa (panel kliencki)"
H=$(hdrs "$PANEL/")
check_hdr() { echo "$H" | grep -qi "^$1:" && ok "$1 obecny" || warn "$1 BRAK"; }
check_hdr "strict-transport-security"
check_hdr "x-content-type-options"
check_hdr "x-frame-options"
check_hdr "content-security-policy"
check_hdr "referrer-policy"
echo "$H" | grep -qi "^server: *caddy" && warn "Nagłówek Server ujawnia 'Caddy' (rozważ ukrycie)" || ok "Server header nie ujawnia stacku"
echo "$H" | grep -qiE "^x-powered-by:" && warn "X-Powered-By ujawnia tech (usuń)" || ok "Brak X-Powered-By"

sec "5. Kontrola dostępu (chronione endpointy bez tokena → 401/403)"
for ep in "/services" "/subscriptions" "/admin/users" "/vps" "/addons"; do
  c=$(code "$API$ep")
  if [[ "$c" =~ ^(401|403)$ ]]; then ok "$ep chroniony ($c)"
  elif [[ "$c" == "404" ]]; then warn "$ep → 404 (ścieżka inna? zignoruj jeśli nie istnieje)"
  elif [[ "$c" == "200" ]]; then fail "$ep ZWRACA 200 BEZ AUTORYZACJI — wyciek!"
  else warn "$ep → $c"; fi
done

sec "6. Passkey / WebAuthn skonfigurowany"
ws=$(body "$API/auth/webauthn/status")
if echo "$ws" | grep -qi '"available"'; then
  echo "$ws" | grep -qi '"available":true' \
    && ok "webauthn/status: available=true (RP skonfigurowane)" \
    || warn "webauthn/status: available=false → ustaw WEBAUTHN_RP_ID/WEBAUTHN_ORIGINS"
else warn "Brak /auth/webauthn/status (stary build?) — $ws"; fi

sec "7. Publiczne statystyki (trust signals — bez mocków)"
ps=$(body "$API/public/stats")
if echo "$ps" | grep -qiE '"(accounts|domains|uptime|customers)"'; then
  ok "public-stats zwraca realne pola: $(echo "$ps" | head -c 160)"
else warn "public-stats nieczytelne/niedostępne: $(echo "$ps" | head -c 160)"; fi

sec "8. Rate limiting na logowaniu (10x szybki POST → spodziewane 429)"
got429=0
for i in $(seq 1 12); do
  c=$("${CURL[@]}" -o /dev/null -w "%{http_code}" -X POST "$API/auth/login" \
      -H 'content-type: application/json' --data '{"email":"x@x.pl","password":"x"}' 2>/dev/null)
  [[ "$c" == "429" ]] && { got429=1; break; }
done
[[ "$got429" == "1" ]] && ok "Logowanie rate-limitowane (429 po serii prób)" \
  || warn "Brak 429 po 12 próbach — sprawdź throttling/loginBlocked"

sec "9. Obsługa błędów (nieistniejąca ścieżka → 404, nie 500)"
c=$(code "$API/__nope_$(date +%s)")
[[ "$c" == "404" ]] && ok "Nieznana ścieżka → 404" || warn "Nieznana ścieżka → $c (oczekiwano 404)"

sec "Podsumowanie"
echo "  PASS=$PASS  WARN=$WARN  FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && echo "  ⛔ Są twarde błędy — patrz ❌ powyżej." \
  || echo "  ✅ Brak twardych błędów. Przejrzyj ⚠️ ostrzeżenia."
exit "$FAIL"
