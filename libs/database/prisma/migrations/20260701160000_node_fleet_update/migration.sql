-- NODE-6 — wersje stacku per węzeł + FLEET_UPDATE (aktualizacja floty).

ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "daVersion" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "clVersion" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "lsVersion" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "versionsCheckedAt" TIMESTAMP(3);

-- Nowa wartość enuma (poza blokiem DO — ADD VALUE nie może być w DO).
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'FLEET_UPDATE';
