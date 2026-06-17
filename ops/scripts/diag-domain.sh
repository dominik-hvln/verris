#!/usr/bin/env bash
# =============================================================================
# Verris — diagnostyka domeny (DNS / HTTP / SSL). READ-ONLY.
# Ustala czemu domena „nie działa" i czemu Let's Encrypt nie wystawił certu.
# Uruchom z dowolnej maszyny z dostępem do internetu:
#   DOMAIN=tprstudio.pl NODE_IP=<IP_węzła> bash ops/scripts/diag-domain.sh
# NODE_IP opcjonalne — jeśli podasz, sprawdzi czy rekord A wskazuje na węzeł.
# =============================================================================
set -uo pipefail

DOMAIN="${DOMAIN:?Ustaw DOMAIN=twojadomena.pl}"
NODE_IP="${NODE_IP:-}"
ok(){ echo "  ✅ $1"; }
warn(){ echo "  ⚠️  $1"; }
fail(){ echo "  ❌ $1"; }
sec(){ echo; echo "=== $1 ==="; }

sec "1. Rekordy DNS"
A=$(dig +short A "$DOMAIN" 2>/dev/null | tr '\n' ' ')
WWW=$(dig +short A "www.$DOMAIN" 2>/dev/null | tr '\n' ' ')
NS=$(dig +short NS "$DOMAIN" 2>/dev/null | tr '\n' ' ')
echo "  A    $DOMAIN     -> ${A:-(brak)}"
echo "  A    www.$DOMAIN -> ${WWW:-(brak)}"
echo "  NS   $DOMAIN     -> ${NS:-(brak)}"
[ -z "$A" ] && fail "Brak rekordu A — domena nie wskazuje na żaden serwer (to blokuje stronę i LE)."

if [ -n "$NODE_IP" ]; then
  if echo " $A " | grep -q " $NODE_IP "; then ok "Rekord A wskazuje na węzeł ($NODE_IP)."
  else fail "Rekord A ($A) NIE wskazuje na węzeł ($NODE_IP) — popraw A w DNS."; fi
fi

sec "2. HTTP / HTTPS"
for scheme in http https; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -H "Host: $DOMAIN" "$scheme://$DOMAIN/" 2>/dev/null || echo ERR)
  if [ "$code" = "ERR" ] || [ "$code" = "000" ]; then fail "$scheme://$DOMAIN — brak odpowiedzi"
  else ok "$scheme://$DOMAIN -> HTTP $code"; fi
done

sec "3. Certyfikat TLS"
cert=$(echo | timeout 12 openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -issuer -subject -enddate 2>/dev/null)
if [ -n "$cert" ]; then
  echo "$cert" | sed 's/^/  /'
  echo "$cert" | grep -qi "let's encrypt" && ok "Cert Let's Encrypt obecny." || warn "Cert obecny, ale nie Let's Encrypt."
else
  fail "Brak ważnego certu TLS na :443 (zgadza się z 'brak SSL' w panelu)."
fi

sec "Wniosek"
echo "  • Jeśli rekord A nie wskazuje na węzeł → najpierw popraw DNS, potem ponów wystawienie LE."
echo "  • Po poprawnym A i propagacji (do ~kilkudziesięciu min) ponownie kliknij 'Wystaw certyfikat LE'."
echo "  • Sprawdź też w panelu admina: konto/domena utworzone w DirectAdmin (vhost istnieje)."
