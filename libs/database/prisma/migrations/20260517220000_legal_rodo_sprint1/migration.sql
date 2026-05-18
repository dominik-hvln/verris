-- Sprint 1 — Legal & RODO
-- Adds versioned legal documents, per-user consent audit trail with IP/UA,
-- marketing opt-in preferences, GDPR data-subject requests (Art. 17 deletion,
-- Art. 20 export). User row gains 6 RODO columns.

-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('TERMS', 'PRIVACY', 'COOKIES', 'DPA');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('REGISTRATION', 'RE_CONSENT', 'SETTINGS', 'ADMIN_MANUAL');

-- CreateEnum
CREATE TYPE "DataExportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'EXPIRED', 'FAILED');

-- AlterTable: User — RODO columns
ALTER TABLE "User"
    ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
    ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
    ADD COLUMN "lastConsentVersionTerms" TEXT,
    ADD COLUMN "lastConsentVersionPrivacy" TEXT,
    ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
    ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'pl',
    "title" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "changelogMarkdown" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentKind" "LegalDocumentKind" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'pl',
    "documentId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "source" "ConsentSource" NOT NULL DEFAULT 'SETTINGS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPreferences" (
    "userId" TEXT NOT NULL,
    "marketingEmail" BOOLEAN NOT NULL DEFAULT false,
    "productUpdatesEmail" BOOLEAN NOT NULL DEFAULT false,
    "partnerOffersEmail" BOOLEAN NOT NULL DEFAULT false,
    "loginAlertsEmail" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribeToken" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingPreferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DataExportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DataExportStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "downloadToken" TEXT,
    "downloadedAt" TIMESTAMP(3),
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "anonymizedById" TEXT,
    "reason" TEXT,
    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "LegalDocument_kind_locale_isCurrent_idx" ON "LegalDocument"("kind", "locale", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_kind_version_locale_key" ON "LegalDocument"("kind", "version", "locale");

-- CreateIndex
CREATE INDEX "UserConsent_userId_documentKind_grantedAt_idx" ON "UserConsent"("userId", "documentKind", "grantedAt");

-- CreateIndex
CREATE INDEX "UserConsent_documentKind_documentVersion_idx" ON "UserConsent"("documentKind", "documentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingPreferences_unsubscribeToken_key" ON "MarketingPreferences"("unsubscribeToken");

-- CreateIndex
CREATE UNIQUE INDEX "DataExportRequest_downloadToken_key" ON "DataExportRequest"("downloadToken");

-- CreateIndex
CREATE INDEX "DataExportRequest_userId_requestedAt_idx" ON "DataExportRequest"("userId", "requestedAt");

-- CreateIndex
CREATE INDEX "DataExportRequest_status_idx" ON "DataExportRequest"("status");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_scheduledFor_anonymizedAt_idx" ON "AccountDeletionRequest"("scheduledFor", "anonymizedAt");

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConsent" ADD CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConsent" ADD CONSTRAINT "UserConsent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPreferences" ADD CONSTRAINT "MarketingPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_anonymizedById_fkey" FOREIGN KEY ("anonymizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill (dev/staging only): existing accounts created before Sprint 1 are
-- flagged as 0.0.0-legacy so the re-consent flow forces them through the
-- modal on next login. New accounts will get real versions assigned by
-- AuthService.register transactionally.
-- ---------------------------------------------------------------------------
UPDATE "User"
SET "termsAcceptedAt" = "createdAt",
    "privacyAcceptedAt" = "createdAt",
    "lastConsentVersionTerms" = '0.0.0-legacy',
    "lastConsentVersionPrivacy" = '0.0.0-legacy'
WHERE "termsAcceptedAt" IS NULL
   OR "privacyAcceptedAt" IS NULL;
