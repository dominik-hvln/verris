-- Etap G: księga punktów EKO + referral + token badge

CREATE TABLE "EcoPointsLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoPointsLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EcoPointsLedgerEntry_userId_createdAt_idx" ON "EcoPointsLedgerEntry"("userId", "createdAt" DESC);

ALTER TABLE "EcoPointsLedgerEntry" ADD CONSTRAINT "EcoPointsLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredByUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "ecoBadgeToken" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX "User_ecoBadgeToken_key" ON "User"("ecoBadgeToken");

ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
