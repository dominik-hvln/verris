-- Migracje self-service A→Z (Sprint: migrator v2)
-- Nowe statusy/kroki + sekwencja i heartbeat jobów + eskalacja do staff + cutover DNS.

ALTER TYPE "MigrationStatus" ADD VALUE IF NOT EXISTS 'ATTENTION';

ALTER TYPE "MigrationWorkerJobKind" ADD VALUE IF NOT EXISTS 'WP_FIXUP';
ALTER TYPE "MigrationWorkerJobKind" ADD VALUE IF NOT EXISTS 'FILES_DELTA';
ALTER TYPE "MigrationWorkerJobKind" ADD VALUE IF NOT EXISTS 'IMAP_DELTA';

ALTER TABLE "MigrationRequest"
  ADD COLUMN "sourcePanelType" TEXT,
  ADD COLUMN "needsAttention" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attentionReason" TEXT,
  ADD COLUMN "attentionAt" TIMESTAMP(3),
  ADD COLUMN "cutoverMode" TEXT,
  ADD COLUMN "cutoverAt" TIMESTAMP(3);

ALTER TABLE "MigrationWorkerJob"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "MigrationRequest_needsAttention_createdAt_idx"
  ON "MigrationRequest"("needsAttention", "createdAt");

CREATE INDEX "MigrationWorkerJob_migrationRequestId_sequence_idx"
  ON "MigrationWorkerJob"("migrationRequestId", "sequence");
