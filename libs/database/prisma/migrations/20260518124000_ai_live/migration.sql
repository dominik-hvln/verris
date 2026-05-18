CREATE TYPE "AiInteractionStatus" AS ENUM (
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "AiInteractionLog" (
  "id" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "status" "AiInteractionStatus" NOT NULL,
  "promptHash" TEXT NOT NULL,
  "inputSummary" JSONB,
  "output" JSONB,
  "errorMessage" TEXT,
  "ticketId" TEXT,
  "subscriptionId" TEXT,
  "userId" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiInteractionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiInteractionLog_feature_createdAt_idx" ON "AiInteractionLog"("feature", "createdAt");
CREATE INDEX "AiInteractionLog_userId_createdAt_idx" ON "AiInteractionLog"("userId", "createdAt");
CREATE INDEX "AiInteractionLog_ticketId_idx" ON "AiInteractionLog"("ticketId");
CREATE INDEX "AiInteractionLog_subscriptionId_idx" ON "AiInteractionLog"("subscriptionId");

ALTER TABLE "AiInteractionLog" ADD CONSTRAINT "AiInteractionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
