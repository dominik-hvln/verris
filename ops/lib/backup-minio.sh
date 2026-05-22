#!/usr/bin/env bash
# Shared MinIO (mc) helpers for ops scripts. Source from backup/restore scripts.
# Requires: docker compose, .env.prod with MINIO_* and S3_BUCKET_BACKUPS.

backup_minio_load_env() {
  local env_file="${ENV_FILE:-.env.prod}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
  MINIO_ROOT_USER="${MINIO_ROOT_USER:?MINIO_ROOT_USER required (set in .env.prod)}"
  MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD required}"
  S3_BUCKET_BACKUPS="${S3_BUCKET_BACKUPS:-verris-backups}"
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-verris}"
  MC_SERVICE="${MC_SERVICE:-minio-bootstrap}"
  RETENTION_DAYS="${RETENTION_DAYS:-14}"
}

backup_minio_mc_run() {
  local script="$1"
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    run --rm --no-deps \
    --entrypoint /bin/sh \
    -e "MINIO_ROOT_USER=${MINIO_ROOT_USER}" \
    -e "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}" \
    -e "S3_BUCKET_BACKUPS=${S3_BUCKET_BACKUPS}" \
    -e "RETENTION_DAYS=${RETENTION_DAYS}" \
    "$MC_SERVICE" \
    -c "$script"
}

backup_minio_ensure_bucket() {
  backup_minio_mc_run '
    set -e
    mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
    mc mb -p "verris/${S3_BUCKET_BACKUPS}" || true
    mc anonymous set none "verris/${S3_BUCKET_BACKUPS}"
    mc ilm rule add --expire-days "${RETENTION_DAYS}" "verris/${S3_BUCKET_BACKUPS}" 2>/dev/null || true
    echo bucket-ready
  '
}

# Usage: backup_minio_upload_file /path/to/dump.sql.gz verris-2026-01-01-0300.sql.gz
backup_minio_upload_file() {
  local local_file="$1"
  local object_name="$2"
  [[ -f "$local_file" ]] || return 1

  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    run --rm --no-deps \
    --entrypoint /bin/sh \
    -v "${local_file}:/upload.sql.gz:ro" \
    -e "MINIO_ROOT_USER=${MINIO_ROOT_USER}" \
    -e "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}" \
    -e "S3_BUCKET_BACKUPS=${S3_BUCKET_BACKUPS}" \
    -e "OBJECT_NAME=${object_name}" \
    "$MC_SERVICE" \
    -c '
      set -e
      mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
      mc mb -p "verris/${S3_BUCKET_BACKUPS}" || true
      mc cp /upload.sql.gz "verris/${S3_BUCKET_BACKUPS}/postgres/${OBJECT_NAME}"
      mc cp /upload.sql.gz "verris/${S3_BUCKET_BACKUPS}/postgres/latest.sql.gz"
      mc ls "verris/${S3_BUCKET_BACKUPS}/postgres/"
    '
}

# Download object to local path. Args: object_filename dest_path
backup_minio_download_file() {
  local object_name="$1"
  local dest_path="$2"
  mkdir -p "$(dirname "$dest_path")"
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    run --rm --no-deps \
    --entrypoint /bin/sh \
    -v "$(dirname "$dest_path"):/out:rw" \
    -e "MINIO_ROOT_USER=${MINIO_ROOT_USER}" \
    -e "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}" \
    -e "S3_BUCKET_BACKUPS=${S3_BUCKET_BACKUPS}" \
    -e "OBJECT_NAME=${object_name}" \
    -e "DEST_BASENAME=$(basename "$dest_path")" \
    "$MC_SERVICE" \
    -c '
      set -e
      mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
      mc cp "verris/${S3_BUCKET_BACKUPS}/postgres/${OBJECT_NAME}" "/out/${DEST_BASENAME}"
    '
}
