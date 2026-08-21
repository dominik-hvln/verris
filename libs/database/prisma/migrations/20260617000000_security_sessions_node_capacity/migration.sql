-- SEC-6 / SEC-9 / SEC-10 + node capacity guardrails
ALTER TABLE "User" ADD COLUMN "requireStrongAuth" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;

ALTER TYPE "UserAuthTokenPurpose" ADD VALUE 'EMAIL_CHANGE';

CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "loginMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Server" ADD COLUMN "acceptsNewAccounts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Server" ADD COLUMN "maxAccounts" INTEGER;
ALTER TABLE "Server" ADD COLUMN "reservedHeadroomPercent" INTEGER NOT NULL DEFAULT 0;
