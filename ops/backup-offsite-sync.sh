#!/usr/bin/env bash
# Deprecated: primary backup storage is MinIO (see ops/backup-postgres.sh).
# External replication: use ops/backup-mirror-external.sh
exec "$(dirname "$0")/backup-mirror-external.sh" "$@"
