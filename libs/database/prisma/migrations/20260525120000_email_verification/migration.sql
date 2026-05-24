-- Email verification (LIVE auth)
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Existing accounts: treat as already verified (no lock-out on deploy)
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

ALTER TYPE "UserAuthTokenPurpose" ADD VALUE 'EMAIL_VERIFICATION';
