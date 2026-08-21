-- SUP-1/2 — ticket topic + canned response topic/active/audit.

ALTER TABLE "Ticket"
  ADD COLUMN "topic" TEXT;

ALTER TABLE "CannedResponse"
  ADD COLUMN "topic"       TEXT,
  ADD COLUMN "isActive"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "CannedResponse_topic_isActive_idx" ON "CannedResponse"("topic", "isActive");
