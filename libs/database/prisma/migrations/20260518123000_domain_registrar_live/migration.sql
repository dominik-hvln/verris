CREATE TYPE "DomainRegistrarOrderType" AS ENUM (
  'REGISTER',
  'TRANSFER',
  'RENEW'
);

CREATE TYPE "DomainRegistrarOrderStatus" AS ENUM (
  'PENDING_PAYMENT',
  'QUEUED',
  'SUBMITTED',
  'COMPLETED',
  'FAILED',
  'CANCELED'
);

ALTER TABLE "Domain" ADD COLUMN "registrarProvider" TEXT;
ALTER TABLE "Domain" ADD COLUMN "registrarExternalId" TEXT;
ALTER TABLE "Domain" ADD COLUMN "registrarStatus" TEXT;
ALTER TABLE "Domain" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "Domain" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Domain" ADD COLUMN "nameservers" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Domain" ADD COLUMN "transferLock" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Domain" ADD COLUMN "lastRegistrarSyncAt" TIMESTAMP(3);

CREATE TABLE "DomainRegistrarOrder" (
  "id" TEXT NOT NULL,
  "domainName" TEXT NOT NULL,
  "type" "DomainRegistrarOrderType" NOT NULL,
  "status" "DomainRegistrarOrderStatus" NOT NULL DEFAULT 'QUEUED',
  "provider" TEXT,
  "providerOrderId" TEXT,
  "authCodeEnc" TEXT,
  "nameservers" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "years" INTEGER NOT NULL DEFAULT 1,
  "priceAmount" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'PLN',
  "lastError" TEXT,
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "userId" TEXT NOT NULL,
  "domainId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainRegistrarOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DomainRegistrarOrder_userId_createdAt_idx" ON "DomainRegistrarOrder"("userId", "createdAt");
CREATE INDEX "DomainRegistrarOrder_status_createdAt_idx" ON "DomainRegistrarOrder"("status", "createdAt");
CREATE INDEX "DomainRegistrarOrder_domainName_idx" ON "DomainRegistrarOrder"("domainName");

ALTER TABLE "DomainRegistrarOrder" ADD CONSTRAINT "DomainRegistrarOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DomainRegistrarOrder" ADD CONSTRAINT "DomainRegistrarOrder_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
