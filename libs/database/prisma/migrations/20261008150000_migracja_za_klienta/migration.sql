-- PB-45 — migracja przygotowana przez obsługę za klienta, start dopiero po jego zgodzie (link z tokenem).
ALTER TABLE "MigrationRequest"
  ADD COLUMN "consentTokenHash" TEXT,
  ADD COLUMN "consentExpiresAt" TIMESTAMP(3),
  ADD COLUMN "consentDecidedAt" TIMESTAMP(3),
  ADD COLUMN "consentIp" TEXT,
  ADD COLUMN "requestedByOperatorId" TEXT,
  ADD COLUMN "operatorReason" TEXT;

CREATE UNIQUE INDEX "MigrationRequest_consentTokenHash_key" ON "MigrationRequest"("consentTokenHash");
