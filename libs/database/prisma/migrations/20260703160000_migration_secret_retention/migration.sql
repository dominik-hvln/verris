-- Retencja sekretów migracji: znacznik wyczyszczenia zaszyfrowanego bundla
-- (hasła źródła kasowane po zakończeniu migracji + oknie na delta-sync).

ALTER TABLE "MigrationRequest" ADD COLUMN "secretsPurgedAt" TIMESTAMP(3);

CREATE INDEX "MigrationRequest_secretsPurgedAt_completedAt_idx"
  ON "MigrationRequest"("secretsPurgedAt", "completedAt");
