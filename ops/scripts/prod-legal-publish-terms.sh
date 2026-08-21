#!/usr/bin/env bash
# =============================================================================
# Publikacja WYŁĄCZNIE Regulaminu (TERMS) jako nowej wersji w LegalDocument.
#
# W przeciwieństwie do prod-legal-publish-draft-review.sh (publikuje wszystkie 4
# dokumenty jako jedną wersję) — ten skrypt dotyka TYLKO regulaminu. Dzięki temu
# bump §15 nie republikuje polityki prywatności/cookies/DPA i nie wymusza na
# klientach ponownej zgody na dokumenty, które się nie zmieniły.
#
# Ustawia nową wersję isCurrent=true i gasi poprzednią (isCurrent=false),
# zachowując ją w archiwum (transparentność + §4 ust. 2).
#
# Uruchom na serwerze:
#   cd /opt/verris && LEGAL_TERMS_VERSION=1.1.0 ./ops/scripts/prod-legal-publish-terms.sh
# =============================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
VERSION="${LEGAL_TERMS_VERSION:-1.1.0}"
DRAFTS_HOST="${ROOT}/docs/legal/drafts"

CHANGELOG="${LEGAL_TERMS_CHANGELOG:-Zmiana §15 (SLA): rekompensata za niedostępność jest teraz przyznawana automatycznie, bez konieczności składania wniosku — po zakończeniu miesiąca kalendarzowego uznajemy Twój Portfel i informujemy o tym e-mailem. Progi rekompensat (5/25/50/100%) pozostają bez zmian. Zmiana wyłącznie na Twoją korzyść.}"

[[ -f "${DRAFTS_HOST}/terms.md" ]] || { echo "[legal] Brak ${DRAFTS_HOST}/terms.md"; exit 1; }

# Ostrzeżenie, jeśli plik na serwerze nie jest jeszcze w wersji ${VERSION}.
if ! grep -q "Wersja ${VERSION}" "${DRAFTS_HOST}/terms.md"; then
  echo "[legal] UWAGA: ${DRAFTS_HOST}/terms.md nie zawiera nagłówka \"Wersja ${VERSION}\"."
  echo "         Upewnij się, że serwer ma najnowszy kod (deploy) przed publikacją."
  echo "         Przerwano dla bezpieczeństwa. Ustaw LEGAL_TERMS_FORCE=1, by pominąć."
  [[ "${LEGAL_TERMS_FORCE:-0}" = "1" ]] || exit 1
fi

API_CID="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q api)"
[[ -n "$API_CID" ]] || { echo "[legal] Kontener api nie działa"; exit 1; }

env_get() {
  grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}
DATABASE_URL="${DATABASE_URL:-$(env_get DATABASE_URL)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(env_get POSTGRES_PASSWORD)}"
POSTGRES_USER="${POSTGRES_USER:-$(env_get POSTGRES_USER)}"
POSTGRES_HOST="${POSTGRES_HOST:-$(env_get POSTGRES_HOST)}"
POSTGRES_PORT="${POSTGRES_PORT:-$(env_get POSTGRES_PORT)}"
POSTGRES_DB="${POSTGRES_DB:-$(env_get POSTGRES_DB)}"
if [[ -z "${DATABASE_URL:-}" && -n "${POSTGRES_PASSWORD:-}" ]]; then
  enc_pass="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api \
    node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$POSTGRES_PASSWORD")"
  export DATABASE_URL="postgresql://${POSTGRES_USER:-verris}:${enc_pass}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-verris_db}?schema=public"
fi
[[ -n "${DATABASE_URL:-}" ]] || { echo "[legal] Ustaw DATABASE_URL lub POSTGRES_PASSWORD w $ENV_FILE"; exit 1; }

docker cp "${DRAFTS_HOST}/terms.md" "${API_CID}:/tmp/terms.md"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
  -e DATABASE_URL="$DATABASE_URL" \
  -e LEGAL_TERMS_VERSION="$VERSION" \
  -e LEGAL_TERMS_CHANGELOG="$CHANGELOG" \
  api node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const version = process.env.LEGAL_TERMS_VERSION;
const changelogMarkdown = process.env.LEGAL_TERMS_CHANGELOG || '';
const contentMarkdown = fs.readFileSync('/tmp/terms.md', 'utf8');
const locale = 'pl';
const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.legalDocument.updateMany({
      where: { kind: 'TERMS', locale, isCurrent: true },
      data: { isCurrent: false },
    });
    await tx.legalDocument.upsert({
      where: { kind_version_locale: { kind: 'TERMS', version, locale } },
      create: {
        kind: 'TERMS', version, locale,
        title: 'Regulamin świadczenia usług Verris',
        contentMarkdown, changelogMarkdown,
        isCurrent: true, publishedAt: new Date(),
      },
      update: {
        title: 'Regulamin świadczenia usług Verris',
        contentMarkdown, changelogMarkdown,
        isCurrent: true, publishedAt: new Date(),
      },
    });
  });
  console.log(`[legal] TERMS v${version} → isCurrent=true (panel /legal/terms)`);
}

main().then(() => prisma.$disconnect()).catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
NODE

echo "[legal] Regulamin ${VERSION} opublikowany. Sprawdź: panel /legal/terms · admin → Compliance."
