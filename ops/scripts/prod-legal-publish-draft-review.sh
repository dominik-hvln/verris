#!/usr/bin/env bash
# Publikuje WSZYSTKIE dokumenty prawne z docs/legal/drafts/ do panelu (LegalDocument).
# Wersja domyślna: 1.0.0-draft — do przeglądu z prawnikiem PRZED LIVE (decyzja D-4).
# Po akceptacji prawnika: admin → Compliance → publikacja wersji 1.0.0 (LEG-3).
#
# NIE zastępuje lawyer review. Treść = DRAFT 0.2 (PL prawo, praktyki hostingu PL/EU).
#
# Uruchom na serwerze: cd /opt/verris && ./ops/scripts/prod-legal-publish-draft-review.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
VERSION="${LEGAL_REVIEW_VERSION:-1.0.0-draft}"
DRAFTS_HOST="${ROOT}/docs/legal/drafts"

CHANGELOG="${LEGAL_CHANGELOG:-Wersja robocza DRAFT 0.2 — do przeglądu i akceptacji prawnika przed GO LIVE. Po zatwierdzeniu opublikuj wersję 1.0.0 w panelu admin (Compliance). Nie stanowi porady prawnej.}"

if [[ ! -d "$DRAFTS_HOST" ]]; then
  echo "[legal] Brak katalogu $DRAFTS_HOST"
  exit 1
fi

API_CID="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q api)"
if [[ -z "$API_CID" ]]; then
  echo "[legal] Kontener api nie działa"
  exit 1
fi

# NIE source'ujemy całego .env.prod — plik jest w formacie dotenv (Compose),
# nie bash: wartości ze spacjami bez cudzysłowów (np. klucze SSH) wysypałyby
# `source`. Wyciągamy wyłącznie potrzebne klucze, zdejmując ewentualne cudzysłowy.
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
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[legal] Ustaw DATABASE_URL lub POSTGRES_PASSWORD w $ENV_FILE"
  exit 1
fi

docker cp "$DRAFTS_HOST" "${API_CID}:/tmp/legal-drafts"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
  -e DATABASE_URL="$DATABASE_URL" \
  -e LEGAL_VERSION="$VERSION" \
  -e LEGAL_CHANGELOG="$CHANGELOG" \
  api node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const version = process.env.LEGAL_VERSION || '1.0.0-draft';
const changelogMarkdown = process.env.LEGAL_CHANGELOG || '';
const draftsDir = '/tmp/legal-drafts';

const docs = [
  {
    kind: 'TERMS',
    file: 'terms.md',
    title: 'Regulamin świadczenia usług Verris',
  },
  {
    kind: 'PRIVACY',
    file: 'privacy.md',
    title: 'Polityka prywatności Verris',
  },
  {
    kind: 'COOKIES',
    file: 'cookies.md',
    title: 'Polityka plików cookies Verris',
  },
  {
    kind: 'DPA',
    file: 'dpa.md',
    title: 'Umowa powierzenia przetwarzania danych osobowych (DPA)',
  },
];

const prisma = new PrismaClient();

async function publishOne(spec) {
  const filePath = path.join(draftsDir, spec.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing draft: ${filePath}`);
  }
  const contentMarkdown = fs.readFileSync(filePath, 'utf8');
  const locale = 'pl';

  await prisma.$transaction(async (tx) => {
    await tx.legalDocument.updateMany({
      where: { kind: spec.kind, locale, isCurrent: true },
      data: { isCurrent: false },
    });

    await tx.legalDocument.upsert({
      where: {
        kind_version_locale: { kind: spec.kind, version, locale },
      },
      create: {
        kind: spec.kind,
        version,
        locale,
        title: spec.title,
        contentMarkdown,
        changelogMarkdown,
        isCurrent: true,
        publishedAt: new Date(),
      },
      update: {
        title: spec.title,
        contentMarkdown,
        changelogMarkdown,
        isCurrent: true,
        publishedAt: new Date(),
      },
    });
  });

  console.log(`[legal] ${spec.kind} v${version} → isCurrent=true (panel /legal/${spec.kind.toLowerCase()})`);
}

async function main() {
  console.log(`[legal] Publishing ${docs.length} documents as v${version} (lawyer review draft)`);
  for (const spec of docs) {
    await publishOne(spec);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect().finally(() => process.exit(1));
  });
NODE

echo "[legal] done — przegląd: panel klienta /legal/* · admin Compliance · paczka: docs/legal/drafts/"
