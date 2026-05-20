-- Add DISK to autoscaling catalog; retire IO/TRANSFER from active pricing.
ALTER TYPE "AutoscalingResource" ADD VALUE IF NOT EXISTS 'DISK';

UPDATE "AutoscalingPriceRule"
SET "isActive" = false, "validUntil" = NOW()
WHERE "resource" IN ('IO', 'TRANSFER') AND "isActive" = true;
