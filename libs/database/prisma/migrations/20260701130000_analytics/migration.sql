-- AN — Analityka stron (privacy-first). Bez cookies, bez IP; dzienny hash
-- odwiedzającego. Modele: AnalyticsSite (property) + AnalyticsEvent (odsłony).

CREATE TABLE IF NOT EXISTS "AnalyticsSite" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "siteKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalyticsSite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsSite_siteKey_key" ON "AnalyticsSite"("siteKey");
CREATE INDEX IF NOT EXISTS "AnalyticsSite_subscriptionId_idx" ON "AnalyticsSite"("subscriptionId");
CREATE INDEX IF NOT EXISTS "AnalyticsSite_userId_idx" ON "AnalyticsSite"("userId");

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "refHost" TEXT,
  "country" TEXT,
  "deviceType" TEXT,
  "visitorHash" TEXT NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_siteId_ts_idx" ON "AnalyticsEvent"("siteId", "ts");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_siteId_path_idx" ON "AnalyticsEvent"("siteId", "path");

DO $$ BEGIN
  ALTER TABLE "AnalyticsSite" ADD CONSTRAINT "AnalyticsSite_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "AnalyticsSite" ADD CONSTRAINT "AnalyticsSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "AnalyticsSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
