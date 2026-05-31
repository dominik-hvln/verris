-- Autoscaling block-billing episode tracking on the Account.
-- `scaledSince` marks the start of the current scaled episode; `scaledBilledUntil`
-- is the end of the last billed 15-minute block. Both are NULL when the account
-- is at baseline (no active autoscaling delta).
ALTER TABLE "Account" ADD COLUMN "scaledSince" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "scaledBilledUntil" TIMESTAMP(3);

-- Backfill: any account that is currently scaled but has no episode start gets
-- one as of now, so the new block biller starts charging from this point
-- forward (it will never retroactively bill historical hours).
UPDATE "Account"
SET "scaledSince" = NOW(), "scaledBilledUntil" = NOW()
WHERE ("scaledCpu" > 0 OR "scaledRamMb" > 0 OR "scaledDiskMb" > 0)
  AND "scaledSince" IS NULL;
