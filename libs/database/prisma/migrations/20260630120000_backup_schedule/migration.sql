-- PANEL-11 — harmonogram automatycznych backupów konta (per subskrypcja).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BackupFrequency" AS ENUM ('OFF', 'DAILY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BackupSchedule" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "frequency" "BackupFrequency" NOT NULL DEFAULT 'OFF',
    "hour" INTEGER NOT NULL DEFAULT 3,
    "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "retainCount" INTEGER NOT NULL DEFAULT 7,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackupSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BackupSchedule_subscriptionId_key" ON "BackupSchedule"("subscriptionId");
CREATE INDEX IF NOT EXISTS "BackupSchedule_enabled_frequency_idx" ON "BackupSchedule"("enabled", "frequency");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BackupSchedule" ADD CONSTRAINT "BackupSchedule_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
