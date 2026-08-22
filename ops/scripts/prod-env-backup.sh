#!/usr/bin/env bash
# Kopiuje .env.prod (i powiązane sekrety) poza git — chroni przed git clean / przypadkowym usunięciem.
# Uruchom na hoście: cd /opt/verris && ./ops/scripts/prod-env-backup.sh
# Cron: ops/cron/verris-env-backup.cron
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BACKUP_ROOT="${VERRIS_ENV_BACKUP_DIR:-/root/verris-secrets}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="${BACKUP_ROOT}/${STAMP}"

log() { echo "[env-backup] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

if [[ ! -f .env.prod ]]; then
  log "Brak .env.prod w ${ROOT}"
  exit 1
fi

install -d -m 700 "${BACKUP_ROOT}"
install -d -m 600 "${DEST}"

cp -a .env.prod "${DEST}/.env.prod"
chmod 600 "${DEST}/.env.prod"

if [[ -f ops/sogo/.env.sogo ]]; then
  install -d -m 700 "${DEST}/ops/sogo"
  cp -a ops/sogo/.env.sogo "${DEST}/ops/sogo/.env.sogo"
  chmod 600 "${DEST}/ops/sogo/.env.sogo"
fi

# Symlink „latest” dla szybkiego restore
ln -sfn "${DEST}" "${BACKUP_ROOT}/latest"

# Retencja: zostaw ostatnie N kopii (domyślnie 14)
KEEP="${VERRIS_ENV_BACKUP_KEEP:-14}"
ls -1dt "${BACKUP_ROOT}"/[0-9]* 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  [[ -d "$old" && "$old" != "${BACKUP_ROOT}/latest" ]] && rm -rf "$old"
done

log "saved → ${DEST}"
log "restore: cp ${BACKUP_ROOT}/latest/.env.prod ${ROOT}/.env.prod && chmod 600 ${ROOT}/.env.prod"
