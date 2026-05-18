-- Sprint 7 / R-MIG-1+ — pakietowe zlecenia migracji (FTP+MySQL+IMAP+target domain)
-- z bezpiecznym (AES-GCM) storage sekretów i statusem do kolejki workerów.

CREATE TYPE "MigrationStatus" AS ENUM (
  'DRAFT',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELED'
);

CREATE TABLE "MigrationRequest" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceBundleEnc" TEXT NOT NULL,
  "targetDomain" TEXT,
  "status" "MigrationStatus" NOT NULL DEFAULT 'QUEUED',
  "currentStep" TEXT,
  "workerLog" TEXT,
  "lastError" TEXT,
  "ticketId" TEXT,
  "bytesTransferred" BIGINT NOT NULL DEFAULT 0,
  "filesTransferred" INTEGER NOT NULL DEFAULT 0,
  "databasesMigrated" INTEGER NOT NULL DEFAULT 0,
  "mailboxesMigrated" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MigrationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MigrationRequest_subscriptionId_idx" ON "MigrationRequest" ("subscriptionId");
CREATE INDEX "MigrationRequest_userId_idx" ON "MigrationRequest" ("userId");
CREATE INDEX "MigrationRequest_status_createdAt_idx" ON "MigrationRequest" ("status", "createdAt");

ALTER TABLE "MigrationRequest"
  ADD CONSTRAINT "MigrationRequest_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId")
  REFERENCES "Subscription" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "MigrationRequest"
  ADD CONSTRAINT "MigrationRequest_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
