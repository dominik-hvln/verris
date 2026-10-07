#!/usr/bin/env bash
# shellcheck disable=SC2034  # tablice GRUPA_* czytane przez declare -n
# =============================================================================
# Ustawienie kluczy integracji w .env.prod i restart API — wpisuje właściciel na serwerze.
#   cd /opt/verris && sudo bash ops/scripts/prod-ustaw-klucze.sh [ai|paynow|openprovider|stripe|vps|funkcje ...]
# Bez argumentów: wszystkie grupy. Puste pole (Enter) = wartość bez zmian, „-” = wyczyść wartość.
# Sekrety czytane bez echa (read -s), nie trafiają do historii powłoki ani na ekran.
# Przed zmianą kopia .env.prod (prod-env-backup.sh). Klucze NIE są w panelu celowo:
# przejęta sesja admina nie może podmienić klucza bramki i przekierować płatności klientów.
# =============================================================================
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE="${ENV_FILE:-.env.prod}"

[[ "$(id -u)" -eq 0 ]] || { echo "Uruchom jako root" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Brak $ENV_FILE w $(pwd)" >&2; exit 1; }

# grupa: KLUCZ|s (sekret) albo KLUCZ|j (jawny)|opis — tablice czytane przez declare -n niżej
GRUPA_ai=(
  "AI_API_KEY|s|OpenAI — klucz API (GPT-6 Luna: czat, asystent)"
  "ANTHROPIC_API_KEY|s|Anthropic — klucz API (Sonnet 5.5: prognoza, szkice BOK)"
  "AI_TYLKO_KONTA|j|AI tylko dla tych e-maili (po przecinku; puste po starcie = wszyscy)"
  "AI_EMBED_DISABLED|j|Wyłączyć embeddingi bazy wiedzy (true/false)"
)
GRUPA_paynow=(
  "PAYNOW_API_KEY|s|Paynow — Api-Key"
  "PAYNOW_SIGNATURE_KEY|s|Paynow — Signature-Key"
  "PAYNOW_API_URL|j|Paynow — adres API (sandbox: https://api.sandbox.paynow.pl, produkcja: https://api.paynow.pl)"
)
GRUPA_openprovider=(
  "REGISTRAR_PROVIDER|j|Rejestrator (openprovider)"
  "OPENPROVIDER_API_BASE_URL|j|OpenProvider — adres API (sandbox: https://api.sandbox.openprovider.nl, produkcja: https://api.openprovider.eu)"
  "OPENPROVIDER_USERNAME|j|OpenProvider — login API"
  "OPENPROVIDER_PASSWORD|s|OpenProvider — hasło API"
  "OPENPROVIDER_OWNER_HANDLE|j|OpenProvider — uchwyt operatora (admin/tech/billing)"
  "OPENPROVIDER_WEBHOOK_API_KEY|s|OpenProvider — klucz webhooka (wymyślony przez nas, np. openssl rand -hex 32)"
  "OPENPROVIDER_WEBHOOK_SECRET|s|OpenProvider — sekret podpisu webhooka (inny niż klucz, np. openssl rand -hex 32)"
)
GRUPA_vps=(
  "HETZNER_API_TOKEN|s|Hetzner Cloud — token projektu (Read & Write) do sprzedaży VPS"
)
GRUPA_stripe=(
  "STRIPE_SECRET_KEY|s|Stripe — klucz tajny (sk_live_… / sk_test_…)"
  "STRIPE_WEBHOOK_SECRET|s|Stripe — sekret webhooka (whsec_…)"
)
# Funkcje per konto (API + panel klienta w runtime): lista e-maili ma pierwszeństwo przed flagą true/false.
# Wyczyszczenie listy (funkcja dla wszystkich albo nikogo): wpisz „-”.
GRUPA_funkcje=(
  "FEATURE_VPS|j|VPS dla wszystkich klientów (true/false)"
  "FEATURE_VPS_TYLKO_KONTA|j|VPS tylko dla tych e-maili (po przecinku; ma pierwszeństwo przed FEATURE_VPS)"
  "FEATURE_RESELLER_MARKUP|j|Narzut resellera dla wszystkich resellerów (true/false)"
  "FEATURE_RESELLER_MARKUP_TYLKO_KONTA|j|Narzut tylko dla tych resellerów — e-maile po przecinku (ma pierwszeństwo przed flagą)"
)

obecna() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]\$//" || true; }

ustaw() { # KLUCZ WARTOŚĆ — zamiana linii albo dopisanie; wartość w apostrofach (bez interpolacji w compose)
  local k="$1" v="$2" tmp
  [[ "$v" != *"'"* && "$v" != *$'\n'* ]] || { echo "  ✗ $k: wartość z apostrofem/nową linią — pomijam" >&2; return; }
  tmp="$(mktemp "${ENV_FILE}.XXXX")"
  K="$k" V="'$v'" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]} $0 ~ "^"k"=" {if(!d){print k"="v; d=1}; next} {print} END{if(!d) print k"="v}' "$ENV_FILE" >"$tmp"
  chmod 600 "$tmp"; mv -f "$tmp" "$ENV_FILE"
  ZMIENIONE+=("$k")
}

grupy=("$@"); [[ ${#grupy[@]} -gt 0 ]] || grupy=(ai paynow openprovider stripe vps funkcje)
for g in "${grupy[@]}"; do
  declare -p "GRUPA_$g" &>/dev/null || { echo "Nieznana grupa: $g (ai|paynow|openprovider|stripe|vps|funkcje)" >&2; exit 1; }
done
bash ops/scripts/prod-env-backup.sh >/dev/null && echo "Kopia $ENV_FILE: /root/verris-secrets/latest"
ZMIENIONE=()

for g in "${grupy[@]}"; do
  declare -n lista="GRUPA_$g"
  echo; echo "== $g =="
  for wpis in "${lista[@]}"; do
    IFS='|' read -r k typ opis <<<"$wpis"
    teraz="$(obecna "$k")"
    if [[ "$typ" == s ]]; then
      stan=$([[ -n "$teraz" ]] && echo "ustawiony" || echo "brak")
      read -rsp "$opis [$stan]: " v; echo
    else
      read -rp "$opis [${teraz:-brak}]: " v
    fi
    # „-” czyści wartość (np. AI_TYLKO_KONTA po publikacji dokumentów = AI dla wszystkich); Enter = bez zmian.
    if [[ "$v" == "-" ]]; then ustaw "$k" ""; elif [[ -n "$v" ]]; then ustaw "$k" "$v"; fi
  done
  unset -n lista
done

[[ ${#ZMIENIONE[@]} -gt 0 ]] || { echo; echo "Bez zmian — API nie restartuję."; exit 0; }
echo; echo "Zmienione: ${ZMIENIONE[*]}"

# Restart samego API na obrazie, który już działa (bez budowania i pobierania).
cid="$(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" ps -q api)"
img="$(docker inspect --format '{{.Config.Image}}' "$cid")"
export REGISTRY_PREFIX="${img%/verris-api:*}" IMAGE_TAG="${img##*:}"
docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml --env-file "$ENV_FILE" up -d --no-build --no-deps api
for _ in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml --env-file "$ENV_FILE" exec -T api \
       node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "API działa z nowymi kluczami ($IMAGE_TAG)."; exit 0
  fi
  sleep 2
done
echo "API nie odpowiada na /healthz po 60 s — sprawdź: docker compose ... logs api --tail 100" >&2; exit 1
