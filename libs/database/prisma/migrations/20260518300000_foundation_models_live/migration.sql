-- Foundation models for LIVE multi-sprint push:
-- feature flags, announcements, service health, domain checklists,
-- ticket SLA/escalation/risk/runbooks, migration worker jobs,
-- maintenance windows and status webhooks.

CREATE TYPE "ProductAnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ProductAnnouncementKind" AS ENUM ('CHANGELOG', 'INCIDENT_NOTICE', 'MAINTENANCE', 'PRODUCT_UPDATE', 'PROMOTION');
CREATE TYPE "DomainChecklistStatus" AS ENUM ('PENDING', 'OK', 'WARNING', 'FAILED');
CREATE TYPE "MigrationWorkerJobKind" AS ENUM ('FILES_SFTP_RSYNC', 'MYSQL_IMPORT', 'IMAP_SYNC', 'HTTP_POST_CHECK');
CREATE TYPE "MigrationWorkerJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELED');
CREATE TYPE "MaintenanceWindowStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');
CREATE TYPE "StatusWebhookEvent" AS ENUM ('INCIDENT_CREATED', 'INCIDENT_UPDATED', 'INCIDENT_RESOLVED', 'MAINTENANCE_SCHEDULED', 'MAINTENANCE_UPDATED');
CREATE TYPE "StatusWebhookDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "Ticket"
  ADD COLUMN "slaResponseDueAt" TIMESTAMP(3),
  ADD COLUMN "slaResolveDueAt" TIMESTAMP(3),
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalatedById" TEXT,
  ADD COLUMN "escalationReason" TEXT,
  ADD COLUMN "runbookKey" TEXT,
  ADD COLUMN "riskFlag" TEXT,
  ADD COLUMN "riskReason" TEXT;

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabledDefault" BOOLEAN NOT NULL DEFAULT false,
  "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
  "rules" JSONB,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlagOverride" (
  "id" TEXT NOT NULL,
  "featureFlagId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlagPlanOverride" (
  "id" TEXT NOT NULL,
  "featureFlagId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlagPlanOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAnnouncement" (
  "id" TEXT NOT NULL,
  "kind" "ProductAnnouncementKind" NOT NULL,
  "status" "ProductAnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "audienceRole" "Role",
  "featureFlagKey" TEXT,
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceHealthSnapshot" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "dnsOk" BOOLEAN,
  "tlsOk" BOOLEAN,
  "backupFresh" BOOLEAN,
  "incidentsOpen" INTEGER NOT NULL DEFAULT 0,
  "lveOk" BOOLEAN,
  "phpOk" BOOLEAN,
  "mailOk" BOOLEAN,
  "details" JSONB,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DomainChecklist" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "domainId" TEXT,
  "hostname" TEXT NOT NULL,
  "status" "DomainChecklistStatus" NOT NULL DEFAULT 'PENDING',
  "requiredRecords" JSONB,
  "observedRecords" JSONB,
  "issues" JSONB,
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MigrationWorkerJob" (
  "id" TEXT NOT NULL,
  "migrationRequestId" TEXT NOT NULL,
  "kind" "MigrationWorkerJobKind" NOT NULL,
  "status" "MigrationWorkerJobStatus" NOT NULL DEFAULT 'QUEUED',
  "workerId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB,
  "lastError" TEXT,
  "log" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MigrationWorkerJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaintenanceWindow" (
  "id" TEXT NOT NULL,
  "serverId" TEXT,
  "title" TEXT NOT NULL,
  "publicMessage" TEXT,
  "internalNote" TEXT,
  "status" "MaintenanceWindowStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatusWebhookEndpoint" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secretEnc" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "events" "StatusWebhookEvent"[],
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StatusWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatusWebhookDelivery" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "event" "StatusWebhookEvent" NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "StatusWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "responseStatus" INTEGER,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StatusWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");
CREATE INDEX "FeatureFlag_enabledDefault_rolloutPercent_idx" ON "FeatureFlag"("enabledDefault", "rolloutPercent");
CREATE UNIQUE INDEX "FeatureFlagOverride_featureFlagId_userId_key" ON "FeatureFlagOverride"("featureFlagId", "userId");
CREATE INDEX "FeatureFlagOverride_userId_idx" ON "FeatureFlagOverride"("userId");
CREATE UNIQUE INDEX "FeatureFlagPlanOverride_featureFlagId_planId_key" ON "FeatureFlagPlanOverride"("featureFlagId", "planId");
CREATE INDEX "FeatureFlagPlanOverride_planId_idx" ON "FeatureFlagPlanOverride"("planId");
CREATE INDEX "ProductAnnouncement_status_publishedAt_idx" ON "ProductAnnouncement"("status", "publishedAt");
CREATE INDEX "ProductAnnouncement_kind_createdAt_idx" ON "ProductAnnouncement"("kind", "createdAt");
CREATE INDEX "ServiceHealthSnapshot_subscriptionId_computedAt_idx" ON "ServiceHealthSnapshot"("subscriptionId", "computedAt");
CREATE INDEX "DomainChecklist_subscriptionId_status_idx" ON "DomainChecklist"("subscriptionId", "status");
CREATE INDEX "DomainChecklist_hostname_idx" ON "DomainChecklist"("hostname");
CREATE UNIQUE INDEX "MigrationWorkerJob_idempotencyKey_key" ON "MigrationWorkerJob"("idempotencyKey");
CREATE INDEX "MigrationWorkerJob_migrationRequestId_status_idx" ON "MigrationWorkerJob"("migrationRequestId", "status");
CREATE INDEX "MigrationWorkerJob_status_createdAt_idx" ON "MigrationWorkerJob"("status", "createdAt");
CREATE INDEX "MaintenanceWindow_status_scheduledStart_idx" ON "MaintenanceWindow"("status", "scheduledStart");
CREATE INDEX "MaintenanceWindow_serverId_idx" ON "MaintenanceWindow"("serverId");
CREATE INDEX "StatusWebhookEndpoint_isActive_idx" ON "StatusWebhookEndpoint"("isActive");
CREATE INDEX "StatusWebhookDelivery_status_nextAttemptAt_idx" ON "StatusWebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "StatusWebhookDelivery_endpointId_createdAt_idx" ON "StatusWebhookDelivery"("endpointId", "createdAt");
CREATE INDEX "Ticket_slaResponseDueAt_idx" ON "Ticket"("slaResponseDueAt");
CREATE INDEX "Ticket_slaResolveDueAt_idx" ON "Ticket"("slaResolveDueAt");
CREATE INDEX "Ticket_riskFlag_idx" ON "Ticket"("riskFlag");

ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_featureFlagId_fkey" FOREIGN KEY ("featureFlagId") REFERENCES "FeatureFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagPlanOverride" ADD CONSTRAINT "FeatureFlagPlanOverride_featureFlagId_fkey" FOREIGN KEY ("featureFlagId") REFERENCES "FeatureFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagPlanOverride" ADD CONSTRAINT "FeatureFlagPlanOverride_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnnouncement" ADD CONSTRAINT "ProductAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceHealthSnapshot" ADD CONSTRAINT "ServiceHealthSnapshot_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DomainChecklist" ADD CONSTRAINT "DomainChecklist_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DomainChecklist" ADD CONSTRAINT "DomainChecklist_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MigrationWorkerJob" ADD CONSTRAINT "MigrationWorkerJob_migrationRequestId_fkey" FOREIGN KEY ("migrationRequestId") REFERENCES "MigrationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT "MaintenanceWindow_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT "MaintenanceWindow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StatusWebhookEndpoint" ADD CONSTRAINT "StatusWebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StatusWebhookDelivery" ADD CONSTRAINT "StatusWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "StatusWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
