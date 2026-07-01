-- RSL — reseller white-label: profil resellera + powiązanie klientów.

DO $$ BEGIN
  CREATE TYPE "ResellerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ResellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ResellerStatus" NOT NULL DEFAULT 'ACTIVE',
    "brandName" TEXT,
    "markupPct" INTEGER NOT NULL DEFAULT 20,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResellerProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResellerProfile_userId_key" ON "ResellerProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ResellerProfile_code_key" ON "ResellerProfile"("code");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resellerOwnerId" TEXT;
CREATE INDEX IF NOT EXISTS "User_resellerOwnerId_idx" ON "User"("resellerOwnerId");

DO $$ BEGIN
  ALTER TABLE "ResellerProfile" ADD CONSTRAINT "ResellerProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_resellerOwnerId_fkey"
    FOREIGN KEY ("resellerOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
