-- VER-UPG — upgrade silnika MariaDB węzła z panelu admina (NodeTask DB_UPGRADE).
-- Nowy rodzaj zadania węzła + docelowa wersja DB zapisywana na serwerze.

ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'DB_UPGRADE';

ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "targetDbVersion" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "dbUpgradeRequestedAt" TIMESTAMP(3);
