#!/usr/bin/env bash
# Verris — weryfikacja stosu węzła compute przed bootstrapem / profilem hostingowym.
# Uruchom jako root. Nie wprowadza zmian (deleguje do node-hosting-profile.sh --preflight-only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${SCRIPT_DIR}/node-hosting-profile.sh"

if [ ! -x "$PROFILE" ] && [ ! -f "$PROFILE" ]; then
  echo "Brak $PROFILE" >&2
  exit 1
fi

bash "$PROFILE" --preflight-only "$@"
