#!/usr/bin/env bash
# PRZESTARZAŁE — użyj: ./ops/scripts/prod-legal-publish-draft-review.sh
# (publikuje TERMS, PRIVACY, COOKIES, DPA jako 1.0.0-draft do przeglądu z prawnikiem)
echo "[legal-prelive] Ten skrypt jest przestarzały. Uruchom: ./ops/scripts/prod-legal-publish-draft-review.sh" >&2
exec "$(dirname "$0")/prod-legal-publish-draft-review.sh" "$@"
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
VERSION="${LEGAL_PRELIVE_VERSION:-1.0.0-prelive}"
DRAFTS_HOST="${ROOT}/docs/legal/drafts"

if [[ ! -d "$DRAFTS_HOST" ]]; then
  echo "[legal-prelive] Brak katalogu $DRAFTS_HOST"
  exit 1
fi

API_CID="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q api)"
if [[ -z "$API_CID" ]]; then
  echo "[legal-prelive] Kontener api nie działa"
  exit 1
fi

# DATABASE_URL jest ustawiane w api-entrypoint tylko dla PID 1 — exec potrzebuje URL z .env.prod.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
if [[ -z "${DATABASE_URL:-}" && -n "${POSTGRES_PASSWORD:-}" ]]; then
  enc_pass="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api \
    node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$POSTGRES_PASSWORD")"
  export DATABASE_URL="postgresql://${POSTGRES_USER:-verris}:${enc_pass}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-verris_db}?schema=public"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[legal-prelive] Ustaw DATABASE_URL lub POSTGRES_PASSWORD w $ENV_FILE"
  exit 1
fi

docker cp "$DRAFTS_HOST" "${API_CID}:/tmp/legal-drafts"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T -e DATABASE_URL="$DATABASE_URL" api \
  node - "${VERSION}" <<'NODE'
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '1.0.0-prelive';
const draftsDir = '/tmp/legal-drafts';

const docs = [
  {
    kind: 'TERMS',
    file: 'terms.md',
    title: 'Regulamin świadczenia usług hostingowych Verris',
  },
  {
    kind: 'PRIVACY',
    file: 'privacy.md',
    title: 'Polityka prywatności Verris',
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
        changelogMarkdown:
          'Wersja pre-LIVE (draft do lawyer review) — umożliwia rejestrację i smoke testów przed GO.',
        isCurrent: true,
        publishedAt: new Date(),
      },
      update: {
        title: spec.title,
        contentMarkdown,
        changelogMarkdown:
          'Wersja pre-LIVE (draft do lawyer review) — umożliwia rejestrację i smoke testów przed GO.',
        isCurrent: true,
        publishedAt: new Date(),
      },
    });
  });

  console.log(`[legal-prelive] published ${spec.kind} v${version} (isCurrent=true)`);
}

async function main() {
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

echo "[legal-prelive] done — rejestracja wymaga TERMS + PRIVACY isCurrent=true"
