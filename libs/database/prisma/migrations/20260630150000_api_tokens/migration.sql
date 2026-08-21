-- API-1 — publiczne API klienta: tokeny (hash + prefiks + scopes).

CREATE TABLE IF NOT EXISTS "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiToken_prefix_key" ON "ApiToken"("prefix");
CREATE INDEX IF NOT EXISTS "ApiToken_userId_idx" ON "ApiToken"("userId");

DO $$ BEGIN
  ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
