#!/usr/bin/env bash
# PB-37 — jednorazowo po wdrożeniu: szablony odpowiedzi obsługi + kategorie dla istniejących.
# Idempotentne: dodaje tylko szablony o brakujących tytułach, kategorię ustawia tylko tam, gdzie jej nie ma.
# Nie jest częścią każdego wdrożenia — szablon usunięty przez admina nie może wracać sam.
# Użycie (na control-plane, w katalogu repo): bash ops/scripts/prod-seed-canned.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api /usr/local/bin/api-entrypoint.sh \
  node libs/database/prisma/dist/seed-canned.js
