-- H-03 — retencja kopii poza serwerem wybierana przez klienta w granicach planu (min. 30 dni w cenie).
ALTER TABLE "Plan" ADD COLUMN "offsiteRetentionMaxDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "BackupSchedule" ADD COLUMN "offsiteRetentionDays" INTEGER NOT NULL DEFAULT 30;
