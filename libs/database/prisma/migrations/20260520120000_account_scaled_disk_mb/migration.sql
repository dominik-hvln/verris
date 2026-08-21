-- Autoscaling disk delta (MB) on top of plan base disk limit.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "scaledDiskMb" INTEGER NOT NULL DEFAULT 0;
