-- EMM — Produkt email-marketingu. ProductKind.EMAIL_MARKETING + limity planu +
-- modele list/kontakt/kampania/wysyłka. RODO: double opt-in, unsubscribe token.

-- 1) Nowa wartość enuma ProductKind (poza blokiem DO — ADD VALUE nie może być w DO).
ALTER TYPE "ProductKind" ADD VALUE IF NOT EXISTS 'EMAIL_MARKETING';

-- 2) Nowe enumy EMM (idempotentnie).
DO $$ BEGIN
  CREATE TYPE "EmmContactStatus" AS ENUM ('PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EmmCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EmmSendStatus" AS ENUM ('SENT', 'SUPPRESSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) Limity planu email-marketingu.
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "emmMaxContacts" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "emmMonthlySends" INTEGER;

-- 4) EmmList
CREATE TABLE IF NOT EXISTS "EmmList" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "doubleOptIn" BOOLEAN NOT NULL DEFAULT true,
  "fromName" TEXT,
  "replyTo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmmList_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmmList_subscriptionId_idx" ON "EmmList"("subscriptionId");
CREATE INDEX IF NOT EXISTS "EmmList_userId_idx" ON "EmmList"("userId");

-- 5) EmmContact
CREATE TABLE IF NOT EXISTS "EmmContact" (
  "id" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "status" "EmmContactStatus" NOT NULL DEFAULT 'PENDING',
  "confirmToken" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "unsubToken" TEXT NOT NULL,
  "unsubscribedAt" TIMESTAMP(3),
  "source" TEXT,
  "consentIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmmContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmmContact_confirmToken_key" ON "EmmContact"("confirmToken");
CREATE UNIQUE INDEX IF NOT EXISTS "EmmContact_unsubToken_key" ON "EmmContact"("unsubToken");
CREATE UNIQUE INDEX IF NOT EXISTS "EmmContact_listId_email_key" ON "EmmContact"("listId", "email");
CREATE INDEX IF NOT EXISTS "EmmContact_listId_status_idx" ON "EmmContact"("listId", "status");

-- 6) EmmCampaign
CREATE TABLE IF NOT EXISTS "EmmCampaign" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "ctaLabel" TEXT,
  "ctaUrl" TEXT,
  "status" "EmmCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "cursorOffset" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "suppressedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmmCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmmCampaign_subscriptionId_idx" ON "EmmCampaign"("subscriptionId");
CREATE INDEX IF NOT EXISTS "EmmCampaign_status_idx" ON "EmmCampaign"("status");

-- 7) EmmSend
CREATE TABLE IF NOT EXISTS "EmmSend" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "EmmSendStatus" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmmSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmmSend_campaignId_contactId_key" ON "EmmSend"("campaignId", "contactId");
CREATE INDEX IF NOT EXISTS "EmmSend_campaignId_idx" ON "EmmSend"("campaignId");

-- 8) Klucze obce (idempotentnie).
DO $$ BEGIN
  ALTER TABLE "EmmList" ADD CONSTRAINT "EmmList_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EmmList" ADD CONSTRAINT "EmmList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EmmContact" ADD CONSTRAINT "EmmContact_listId_fkey" FOREIGN KEY ("listId") REFERENCES "EmmList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EmmCampaign" ADD CONSTRAINT "EmmCampaign_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EmmCampaign" ADD CONSTRAINT "EmmCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EmmCampaign" ADD CONSTRAINT "EmmCampaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "EmmList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EmmSend" ADD CONSTRAINT "EmmSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmmCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EmmSend" ADD CONSTRAINT "EmmSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
