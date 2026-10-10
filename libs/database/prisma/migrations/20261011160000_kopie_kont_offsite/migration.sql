-- F3.3 (11.10) — stan ostatniej kopii konta poza serwerem z raportu węzła (lista kont w /agent/backup/offsite-report).
-- Addytywna i idempotentna; stary kod tych kolumn nie czyta (migracja przed podmianą kodu jest bezpieczna).

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "offsiteBackupOkAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "offsiteBackupBytes" BIGINT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "offsiteBackupFailedAt" TIMESTAMP(3);
