-- Async DirectAdmin restore jobs (worker-processed, with optional pre-restore
-- safety backup). Status tracked for the client/admin panel.
CREATE TYPE "HostingRestoreStatus" AS ENUM ('QUEUED', 'RUNNING', 'SAFETY_BACKUP', 'RESTORING', 'COMPLETED', 'FAILED');

CREATE TABLE "HostingRestoreJob" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "isAdminInitiated" BOOLEAN NOT NULL DEFAULT false,
    "backupId" TEXT NOT NULL,
    "backupFileName" TEXT NOT NULL,
    "scopeFiles" BOOLEAN NOT NULL DEFAULT true,
    "scopeDatabases" BOOLEAN NOT NULL DEFAULT true,
    "scopeEmail" BOOLEAN NOT NULL DEFAULT true,
    "safetyBackup" BOOLEAN NOT NULL DEFAULT true,
    "status" "HostingRestoreStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostingRestoreJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HostingRestoreJob_status_createdAt_idx" ON "HostingRestoreJob"("status", "createdAt");
CREATE INDEX "HostingRestoreJob_subscriptionId_createdAt_idx" ON "HostingRestoreJob"("subscriptionId", "createdAt");

ALTER TABLE "HostingRestoreJob" ADD CONSTRAINT "HostingRestoreJob_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
