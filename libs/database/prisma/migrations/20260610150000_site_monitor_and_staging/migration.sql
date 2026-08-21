-- B3: site monitoring (opt-in, per subscription) + B5: staging sync task.
ALTER TYPE "NodeTaskKind" ADD VALUE 'STAGING_SYNC';

ALTER TABLE "Account" ADD COLUMN "stagingCreatedAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "stagingSyncedAt" TIMESTAMP(3);

CREATE TYPE "SiteMonitorStatus" AS ENUM ('UNKNOWN', 'UP', 'DOWN');
CREATE TYPE "SiteMonitorEventType" AS ENUM ('DOWN', 'RECOVERED');

CREATE TABLE "SiteMonitor" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "url" TEXT NOT NULL,
    "lastStatus" "SiteMonitorStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "lastHttpStatus" INTEGER,
    "lastError" TEXT,
    "downSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMonitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteMonitor_subscriptionId_key" ON "SiteMonitor"("subscriptionId");
CREATE INDEX "SiteMonitor_enabled_idx" ON "SiteMonitor"("enabled");

ALTER TABLE "SiteMonitor" ADD CONSTRAINT "SiteMonitor_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SiteMonitorEvent" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "type" "SiteMonitorEventType" NOT NULL,
    "message" TEXT,
    "httpStatus" INTEGER,
    "durationS" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteMonitorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteMonitorEvent_monitorId_createdAt_idx" ON "SiteMonitorEvent"("monitorId", "createdAt");

ALTER TABLE "SiteMonitorEvent" ADD CONSTRAINT "SiteMonitorEvent_monitorId_fkey"
    FOREIGN KEY ("monitorId") REFERENCES "SiteMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
