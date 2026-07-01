-- NODE-1 — Wznawialny bootstrap węzła (odporny na restarty). Fazy pchane przez
-- oneshot na węźle przy każdym starcie aż do DONE. + historia faz.

ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "bootstrapPhase" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "bootstrapState" JSONB;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "bootstrapError" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "bootstrapStartedAt" TIMESTAMP(3);
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "bootstrapUpdatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "NodeBootstrapEvent" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NodeBootstrapEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NodeBootstrapEvent_serverId_createdAt_idx" ON "NodeBootstrapEvent"("serverId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "NodeBootstrapEvent" ADD CONSTRAINT "NodeBootstrapEvent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
