#!/usr/bin/env bash
# Smoke: Grafana SSO (forward_auth) + metryki API HTTP + BOK ticket API (opcjonalnie).
# Uruchom na hoście: cd /opt/verris && bash ops/scripts/prod-smoke-grafana-bok.sh
set -Eeuo pipefail

cd "$(dirname "$0")/../.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
API_PUBLIC="${SMOKE_API_URL:-https://api.verris.pl}"
GRAFANA_PUBLIC="${SMOKE_GRAFANA_URL:-https://grafana.verris.pl}"

pass=0
fail=0
skip=0

ok() { echo "[OK] $*"; pass=$((pass + 1)); }
bad() { echo "[FAIL] $*"; fail=$((fail + 1)); }
skip_msg() { echo "[SKIP] $*"; skip=$((skip + 1)); }

echo "=== Grafana SSO (public) ==="
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${GRAFANA_PUBLIC}/" || echo "000")
if [[ "$code" == "401" || "$code" == "403" || "$code" == "302" ]]; then
  ok "Grafana bez sesji → HTTP ${code} (wymaga auth)"
else
  bad "Grafana bez sesji → HTTP ${code} (oczekiwano 401/403/302)"
fi

echo ""
echo "=== Grafana validate (API, bez tokenu) ==="
code=$(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T api \
  wget -qO- --server-response http://127.0.0.1:3000/auth/grafana-validate 2>&1 | awk '/HTTP\//{print $2}' | tail -1 || true)
if [[ "${code:-}" == "401" ]]; then
  ok "/auth/grafana-validate bez tokenu → 401"
else
  bad "/auth/grafana-validate bez tokenu → ${code:-brak odpowiedzi}"
fi

echo ""
echo "=== Admin / Staff Grafana SSO route ==="
for path in "https://admin.verris.pl/grafana/sso" "https://staff.verris.pl/grafana/sso"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -L "${path}" || echo "000")
  if [[ "$code" == "200" || "$code" == "307" || "$code" == "302" ]]; then
    ok "${path} → ${code}"
  else
    bad "${path} → ${code}"
  fi
done

echo ""
echo "=== Metryki HTTP w /metrics ==="
metrics=$(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T api \
  wget -qO- --header="Authorization: Bearer $(grep -E '^METRICS_AUTH_TOKEN=' "${ENV_FILE}" | cut -d= -f2-)" \
  http://127.0.0.1:3000/metrics 2>/dev/null || true)
if echo "$metrics" | grep -q 'verris_http_requests_total'; then
  ok "verris_http_requests_total w /metrics"
else
  bad "brak verris_http_requests_total (zdeployuj nowe API i wygeneruj ruch)"
fi
if echo "$metrics" | grep -q 'verris_http_request_duration_seconds_bucket'; then
  ok "histogram duration w /metrics"
else
  bad "brak histogramu HTTP"
fi

echo ""
echo "=== Prometheus (opcjonalnie) ==="
if docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T prometheus \
  wget -qO- 'http://localhost:9090/api/v1/query?query=sum(rate(verris_http_requests_total[5m]))' 2>/dev/null | grep -q '"status":"success"'; then
  ok "Prometheus query verris_http_requests_total"
else
  skip_msg "Prometheus query — brak danych lub stary scrape (poczekaj 1–2 min po deploy)"
fi

echo ""
echo "=== BOK ticket API (wymaga SMOKE_CLIENT_EMAIL + SMOKE_CLIENT_PASSWORD) ==="
if [[ -z "${SMOKE_CLIENT_EMAIL:-}" || -z "${SMOKE_CLIENT_PASSWORD:-}" ]]; then
  skip_msg "Ustaw SMOKE_CLIENT_EMAIL i SMOKE_CLIENT_PASSWORD dla pełnego E2E"
else
  login_json=$(curl -sf -X POST "${API_PUBLIC}/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${SMOKE_CLIENT_EMAIL}\",\"password\":\"${SMOKE_CLIENT_PASSWORD}\"}" || true)
  token=$(echo "$login_json" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  if [[ -z "$token" ]]; then
    bad "login klienta nie zwrócił access_token (2FA? użyj konta bez TOTP)"
  else
    ok "login klienta"
    subject="smoke-bok-$(date +%s)"
    create_json=$(curl -sf -X POST "${API_PUBLIC}/tickets" \
      -H "Authorization: Bearer ${token}" \
      -H 'Content-Type: application/json' \
      -d "{\"subject\":\"${subject}\",\"message\":\"Smoke BOK z prod-smoke-grafana-bok.sh\",\"priority\":\"NORMAL\",\"department\":\"GENERAL\"}" || true)
    ticket_id=$(echo "$create_json" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
    if [[ -n "$ticket_id" ]]; then
      ok "utworzono ticket ${ticket_id}"
      reply_json=$(curl -sf -X POST "${API_PUBLIC}/tickets/${ticket_id}/replies" \
        -H "Authorization: Bearer ${token}" \
        -H 'Content-Type: application/json' \
        -d '{"message":"Dopisek klienta — smoke"}' || true)
      if echo "$reply_json" | grep -q '"id"'; then
        ok "odpowiedź klienta w tickecie"
      else
        bad "odpowiedź klienta nie powiodła się"
      fi
    else
      bad "utworzenie ticketu nie powiodło się"
    fi
  fi
fi

echo ""
echo "=== Podsumowanie: OK=${pass} FAIL=${fail} SKIP=${skip} ==="
[[ "$fail" -eq 0 ]]
