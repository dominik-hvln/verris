#!/usr/bin/env bash
# Publikuje dokumenty prawne (docs/legal/drafts) jako wersja live.
# Decyzja właściciela 2026-09-23: publikacja po aktualizacji do stanu faktycznego, bez zewnętrznego przeglądu.
# Uruchom na hoście: cd /opt/verris && ./ops/scripts/prod-legal-publish-live.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export LEGAL_REVIEW_VERSION="${LEGAL_LIVE_VERSION:-1.2.0}"
export LEGAL_CHANGELOG="${LEGAL_CHANGELOG:-Wersja 1.2.0 — dokumenty zaktualizowane do stanu faktycznego usług. Wymaga ponownej akceptacji przy kolejnym logowaniu.}"

echo "[legal-live] Publishing as v${LEGAL_REVIEW_VERSION}"
exec "$ROOT/ops/scripts/prod-legal-publish-draft-review.sh"
