-- B-1 LIVE: off-node (offsite) backup reporting.
-- The node agent (node-offsite-backup.sh) ships DA account backups to S3-compatible
-- storage and reports the last run here so the panel can flag stale offsite backups.

ALTER TABLE "Server"
  ADD COLUMN "lastOffsiteBackupAt"   TIMESTAMP(3),
  ADD COLUMN "lastOffsiteBackupOk"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastOffsiteBackupInfo" TEXT;
