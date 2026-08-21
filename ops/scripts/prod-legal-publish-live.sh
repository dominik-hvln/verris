#!/usr/bin/env bash
# Publikuje dokumenty prawne jako wersja 1.0.0 (po akceptacji prawnika).
# Uruchom na hoście: cd /opt/verris && ./ops/scripts/prod-legal-publish-live.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export LEGAL_REVIEW_VERSION="${LEGAL_LIVE_VERSION:-1.0.0}"
export LEGAL_CHANGELOG="${LEGAL_CHANGELOG:-Wersja 1.0.0 — publikacja po akceptacji prawnika. Wymaga re-consent użytkowników przy kolejnym logowaniu.}"

echo "[legal-live] Publishing as v${LEGAL_REVIEW_VERSION}"
exec "$ROOT/ops/scripts/prod-legal-publish-draft-review.sh"
