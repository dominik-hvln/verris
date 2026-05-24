#!/usr/bin/env bash
# Publikuje Regulamin + Politykę prywatności (wersja pre-LIVE) — odblokowuje rejestrację.
# Drafty z docs/legal/drafts — NIE zastępuje lawyer review (LEG-2); tylko smoke / pre-GO.
#
# Uruchom na serwerze: cd /opt/verris && ./ops/scripts/prod-legal-prelive-publish.sh
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

docker cp "$DRAFTS_HOST" "${API_CID}:/tmp/legal-drafts"

docker exec -i "$API_CID" node - "${VERSION}" <<'NODE'
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
