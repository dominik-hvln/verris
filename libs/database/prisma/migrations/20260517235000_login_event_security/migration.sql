-- LoginEvent — security audit log (Sprint 2.5)
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "countryCode" VARCHAR(2),
    "deviceFingerprint" TEXT,
    "isNewDevice" BOOLEAN NOT NULL DEFAULT false,
    "loginMethod" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt" DESC);
CREATE INDEX "LoginEvent_deviceFingerprint_idx" ON "LoginEvent"("deviceFingerprint");

ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
