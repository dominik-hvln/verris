#!/usr/bin/env bash
# Verris — instalacja MySQL Governor (CloudLinux) na węźle z DirectAdmin.
# Wymaga: aktywny CloudLinux + działający MySQL/MariaDB (po instalacji DA).
# Domyślnie wywoływany z profilu hostingowego (krok 7 wizarda); można uruchomić osobno.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/node-hosting-profile.sh" --governor-only --yes "$@"
