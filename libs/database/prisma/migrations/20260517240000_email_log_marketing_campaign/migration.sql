-- Sprint 2.6 — EmailLog + MarketingCampaign

CREATE TYPE "EmailCategory" AS ENUM ('TRANSACTIONAL', 'MARKETING');
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'SUPPRESSED', 'FAILED', 'BOUNCED');
CREATE TYPE "MarketingCampaignStatus" AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'SENDING',
    'SENT',
    'FAILED',
    'CANCELED'
);
CREATE TYPE "MarketingSegment" AS ENUM (
    'NEWSLETTER_OPT_IN',
    'PRODUCT_UPDATES_OPT_IN',
    'ALL_ACTIVE_USERS'
);

CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "userId" TEXT,
    "category" "EmailCategory" NOT NULL,
    "tag" TEXT,
    "subject" VARCHAR(512) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" VARCHAR(32),
    "messageId" VARCHAR(255),
    "errorMessage" VARCHAR(1024),
    "metadata" JSONB,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLog_userId_createdAt_idx" ON "EmailLog"("userId", "createdAt" DESC);
CREATE INDEX "EmailLog_category_status_createdAt_idx" ON "EmailLog"("category", "status", "createdAt" DESC);
CREATE INDEX "EmailLog_campaignId_idx" ON "EmailLog"("campaignId");
CREATE INDEX "EmailLog_tag_idx" ON "EmailLog"("tag");

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "subject" VARCHAR(255) NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "ctaLabel" VARCHAR(80),
    "ctaUrl" VARCHAR(500),
    "segment" "MarketingSegment" NOT NULL DEFAULT 'NEWSLETTER_OPT_IN',
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cursorOffset" INTEGER NOT NULL DEFAULT 0,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingCampaign_status_scheduledAt_idx" ON "MarketingCampaign"("status", "scheduledAt");
