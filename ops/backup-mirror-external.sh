#!/usr/bin/env bash
# =============================================================================
# Verris — mirror bucketu backupów MinIO → zewnętrzny object storage (faza 2)
# -----------------------------------------------------------------------------
# Primary storage = MinIO na control-plane (verris-backups). Ten skrypt kopiuje
# cały bucket na drugi endpoint (dedykowany MinIO, S3, B2, R2) przez `mc mirror`.
#
# Włącz: MIRROR_EXTERNAL_ENABLED=1 w /etc/default/verris-backup lub cron env.
#
# Wymagane (jednorazowa konfiguracja na hoście — mc alias w kontenerze one-shot):
#   OFFSITE_MC_ALIAS_URL     np. https://backup.example.com
#   OFFSITE_MC_ACCESS_KEY
#   OFFSITE_MC_SECRET_KEY
#   OFFSITE_MC_BUCKET        np. verris-backups (bucket na serwerze zewn.)
# =============================================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIRROR_EXTERNAL_ENABLED="${MIRROR_EXTERNAL_ENABLED:-0}"

log() { echo "[$(date -Iseconds)] $*"; }
fail() { log "ERROR: $*"; exit 1; }

if [[ "$MIRROR_EXTERNAL_ENABLED" != "1" ]]; then
  log "MIRROR_EXTERNAL_ENABLED!=1 — pomijam mirror (backupy tylko na MinIO lokalnym)."
  exit 0
fi

cd "$REPO_ROOT"
# shellcheck source=ops/lib/backup-minio.sh
source "${SCRIPT_DIR}/lib/backup-minio.sh"
backup_minio_load_env

: "${OFFSITE_MC_ALIAS_URL:?OFFSITE_MC_ALIAS_URL required}"
: "${OFFSITE_MC_ACCESS_KEY:?OFFSITE_MC_ACCESS_KEY required}"
: "${OFFSITE_MC_SECRET_KEY:?OFFSITE_MC_SECRET_KEY required}"
OFFSITE_MC_BUCKET="${OFFSITE_MC_BUCKET:-${S3_BUCKET_BACKUPS}}"

log "mirror verris/${S3_BUCKET_BACKUPS} → offsite/${OFFSITE_MC_BUCKET}"

backup_minio_mc_run "
  set -e
  mc alias set verris http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\"
  mc alias set offsite \"${OFFSITE_MC_ALIAS_URL}\" \"${OFFSITE_MC_ACCESS_KEY}\" \"${OFFSITE_MC_SECRET_KEY}\"
  mc mb -p \"offsite/${OFFSITE_MC_BUCKET}\" || true
  mc mirror --overwrite \"verris/\${S3_BUCKET_BACKUPS}\" \"offsite/${OFFSITE_MC_BUCKET}\"
  echo mirror-ok
"

log "external mirror complete"
