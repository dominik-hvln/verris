-- Etap G follow-up: idempotencja nagród EKO po referenceId (wallet tx, faktura, zamówienie domeny)
ALTER TABLE "EcoPointsLedgerEntry" ADD COLUMN "referenceId" VARCHAR(128);

CREATE INDEX "EcoPointsLedgerEntry_userId_reason_referenceId_idx"
  ON "EcoPointsLedgerEntry"("userId", "reason", "referenceId");
