-- AlterEnum
ALTER TYPE "PromoKind" ADD VALUE 'SERVICE_PERCENT_OFF';

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN "appliesToRenewals" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "listPriceAmount" DECIMAL(10,2),
ADD COLUMN "appliedPromoCodeId" TEXT;

-- AlterTable
ALTER TABLE "PromoRedemption" ADD COLUMN "subscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "PromoRedemption_subscriptionId_idx" ON "PromoRedemption"("subscriptionId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_appliedPromoCodeId_fkey" FOREIGN KEY ("appliedPromoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
