-- AS-2: per-resource autoscaling toggles on subscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoscalingScaleCpu" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoscalingScaleRam" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoscalingScaleDisk" BOOLEAN NOT NULL DEFAULT true;

-- AS-2: max overscale ratio per resource on plan (multiplier of base limit)
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "autoscalingMaxOverscaleCpu" DOUBLE PRECISION NOT NULL DEFAULT 3;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "autoscalingMaxOverscaleRam" DOUBLE PRECISION NOT NULL DEFAULT 3;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "autoscalingMaxOverscaleDisk" DOUBLE PRECISION NOT NULL DEFAULT 3;

-- Email category for autoscaling product notifications
ALTER TYPE "EmailCategory" ADD VALUE IF NOT EXISTS 'PRODUCT_UPDATE';
