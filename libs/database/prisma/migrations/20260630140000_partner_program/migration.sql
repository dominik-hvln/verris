-- RESELL — Program partnerski (afiliacja): prowizje % + bonusy + wypłaty.

-- Nowy typ transakcji portfela (wypłata prowizji do portfela).
-- Uwaga: ALTER TYPE ... ADD VALUE nie może działać w bloku transakcji/DO.
-- Prisma Migrate wykonuje instrukcje bez opakowania w transakcję, więc OK.
ALTER TYPE "WalletTxType" ADD VALUE IF NOT EXISTS 'COMMISSION_CREDIT';

-- Enumy programu partnerskiego.
DO $$ BEGIN
  CREATE TYPE "PartnerCommissionKind" AS ENUM ('RECURRING_PCT', 'MILESTONE_BONUS');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PartnerCommissionStatus" AS ENUM ('PENDING', 'AVAILABLE', 'PAID', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PartnerPayoutMethod" AS ENUM ('WALLET', 'BANK');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PartnerPayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Wypłaty partnerskie (tworzone przed prowizjami z FK, więc najpierw tabela payout).
CREATE TABLE IF NOT EXISTS "PartnerPayout" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "method" "PartnerPayoutMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "status" "PartnerPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "bankAccount" TEXT,
    "walletTxId" TEXT,
    "note" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedByUserId" TEXT,
    CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerPayout_partnerUserId_status_idx" ON "PartnerPayout"("partnerUserId", "status");
CREATE INDEX IF NOT EXISTS "PartnerPayout_status_requestedAt_idx" ON "PartnerPayout"("status", "requestedAt");

-- Prowizje partnerskie.
CREATE TABLE IF NOT EXISTS "PartnerCommission" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "referredUserId" TEXT,
    "kind" "PartnerCommissionKind" NOT NULL DEFAULT 'RECURRING_PCT',
    "dedupeKey" TEXT NOT NULL,
    "baseAmount" DECIMAL(12,2),
    "pct" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "status" "PartnerCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommission_dedupeKey_key" ON "PartnerCommission"("dedupeKey");
CREATE INDEX IF NOT EXISTS "PartnerCommission_partnerUserId_status_idx" ON "PartnerCommission"("partnerUserId", "status");
CREATE INDEX IF NOT EXISTS "PartnerCommission_referredUserId_idx" ON "PartnerCommission"("referredUserId");

-- Klucze obce.
DO $$ BEGIN
  ALTER TABLE "PartnerPayout" ADD CONSTRAINT "PartnerPayout_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "PartnerPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
