-- PB-27: indywidualne warunki usługi; PB-28: rozliczenie poza Verris
ALTER TABLE "Subscription" ADD COLUMN "individualPrice" DECIMAL(10,2),
  ADD COLUMN "autoscalingDiscountPct" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "individualTermsNote" TEXT,
  ADD COLUMN "individualTermsById" TEXT,
  ADD COLUMN "individualTermsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_autoscalingDiscountPct_check"
  CHECK ("autoscalingDiscountPct" BETWEEN 0 AND 100);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_individualPrice_check"
  CHECK ("individualPrice" IS NULL OR "individualPrice" >= 0);
ALTER TABLE "User" ADD COLUMN "billingOutside" BOOLEAN NOT NULL DEFAULT false;
