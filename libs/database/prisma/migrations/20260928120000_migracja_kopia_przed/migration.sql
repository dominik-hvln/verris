-- Migrator: data kopii bezpieczeństwa konta docelowego przed pierwszym krokiem workera.
-- Do 28.09 „Wznów automat” / „Ponów krok” / zmiana statusu przez obsługę ustawiały RUNNING także
-- zleceniu, którego kopia się nie udała — worker nadpisywał konto (rsync --delete) bez kopii.
ALTER TABLE "MigrationRequest" ADD COLUMN "preBackupAt" TIMESTAMP(3);

-- Zlecenia, które już przeszły przez scheduler (mają startedAt), miały kopię wykonaną.
UPDATE "MigrationRequest" SET "preBackupAt" = "startedAt"
WHERE "startedAt" IS NOT NULL AND "status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');
