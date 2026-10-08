-- PB-48 — wnioski pracowników o operację wymagającą wyższego uprawnienia (decyzja właściciela 08.10).
-- Typ operacji to tekst z rejestru w kodzie (apps/api/src/wnioski/rejestr-wnioskow.ts), nie enum bazy —
-- jak katalog uprawnień: nowy typ wniosku nie wymaga migracji.

DO $$ BEGIN
  CREATE TYPE "OperatorRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "OperatorRequest" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customerId" TEXT,
    "subscriptionId" TEXT,
    "payload" JSONB NOT NULL,
    "justification" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "OperatorRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperatorRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OperatorRequest_status_createdAt_idx" ON "OperatorRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "OperatorRequest_customerId_createdAt_idx" ON "OperatorRequest"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "OperatorRequest_requestedById_createdAt_idx" ON "OperatorRequest"("requestedById", "createdAt");

DO $$ BEGIN
  ALTER TABLE "OperatorRequest" ADD CONSTRAINT "OperatorRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "OperatorRequest" ADD CONSTRAINT "OperatorRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "OperatorRequest" ADD CONSTRAINT "OperatorRequest_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
