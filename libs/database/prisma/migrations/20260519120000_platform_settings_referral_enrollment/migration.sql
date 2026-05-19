-- CreateEnum
CREATE TYPE "ReferralProgramEnrollmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ReferralProgramEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReferralProgramEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "termsVersion" TEXT,

    CONSTRAINT "ReferralProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProgramEnrollment_userId_key" ON "ReferralProgramEnrollment"("userId");

-- CreateIndex
CREATE INDEX "ReferralProgramEnrollment_status_appliedAt_idx" ON "ReferralProgramEnrollment"("status", "appliedAt");

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramEnrollment" ADD CONSTRAINT "ReferralProgramEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramEnrollment" ADD CONSTRAINT "ReferralProgramEnrollment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed defaults
INSERT INTO "platform_settings" ("key", "value", "updatedAt") VALUES
  ('eco.pointsPerTree', '1000', CURRENT_TIMESTAMP),
  ('eco.badgeImpressionsPerPoint', '100', CURRENT_TIMESTAMP),
  ('eco.pointsPer10Credits', '100', CURRENT_TIMESTAMP),
  ('session.clientIdleMinutes', '60', CURRENT_TIMESTAMP),
  ('session.staffIdleMinutes', '30', CURRENT_TIMESTAMP),
  ('session.adminIdleMinutes', '15', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
