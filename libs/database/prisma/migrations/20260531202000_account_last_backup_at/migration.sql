-- Tracks the last backup trigger for an account; feeds the health-score
-- backup-freshness signal.
ALTER TABLE "Account" ADD COLUMN "lastBackupAt" TIMESTAMP(3);
