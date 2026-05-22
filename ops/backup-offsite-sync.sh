#!/usr/bin/env bash
# =============================================================================
# Verris — sync najnowszego dumpu Postgres do storage off-site
# -----------------------------------------------------------------------------
# Uruchamiaj PO ops/backup-postgres.sh (np. cron +5–10 min).
#
# OFFSITE_ENABLED=1 — wymagane do faktycznego uploadu
# BACKUP_DIR          — jak w backup-postgres.sh (default: /var/backups/verris)
#
# Backend A (zalecany): rclone — ustaw RCLONE_REMOTE (np. "verris-backups:db/")
# Backend B: aws cli     — ustaw AWS_S3_BUCKET (np. s3://bucket/verris-db/)
# =============================================================================

set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/verris}"
OFFSITE_ENABLED="${OFFSITE_ENABLED:-0}"

log() { echo "[$(date -Iseconds)] $*"; }
fail() { log "ERROR: $*"; exit 1; }

if [[ "$OFFSITE_ENABLED" != "1" ]]; then
  log "OFFSITE_ENABLED!=1 — pomijam sync (tylko lokalny backup)."
  exit 0
fi

[[ -d "$BACKUP_DIR" ]] || fail "Brak katalogu BACKUP_DIR=$BACKUP_DIR"

latest="$(ls -1t "$BACKUP_DIR"/verris-*.sql.gz 2>/dev/null | head -1 || true)"
[[ -n "$latest" ]] || fail "Brak pliku verris-*.sql.gz w $BACKUP_DIR"

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null 2>&1 || fail "rclone nie zainstalowany"
  log "rclone copy $latest → ${RCLONE_REMOTE}"
  rclone copyto "$latest" "${RCLONE_REMOTE%/}/$(basename "$latest")"
  log "off-site sync OK (rclone)"
  exit 0
fi

if [[ -n "${AWS_S3_BUCKET:-}" ]]; then
  command -v aws >/dev/null 2>&1 || fail "aws cli nie zainstalowany"
  dest="${AWS_S3_BUCKET%/}/$(basename "$latest")"
  log "aws s3 cp $latest → $dest"
  aws s3 cp "$latest" "$dest"
  log "off-site sync OK (s3)"
  exit 0
fi

fail "Ustaw RCLONE_REMOTE lub AWS_S3_BUCKET (albo OFFSITE_ENABLED=0)."
