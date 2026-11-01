-- 1.11 — asystent AI na verris.pl: rozmowy bez konta, retencja 30 dni (AsystentRetencjaScheduler).
-- Tylko nowe tabele — „migrate deploy, potem kod” bezpieczne.
CREATE TABLE IF NOT EXISTS "AsystentRozmowa" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "liczbaWymian" INTEGER NOT NULL DEFAULT 0,
    "kosztUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AsystentRozmowa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AsystentWiadomosc" (
    "id" TEXT NOT NULL,
    "rozmowaId" TEXT NOT NULL,
    "rola" TEXT NOT NULL,
    "tresc" TEXT NOT NULL,
    "zrodla" JSONB,
    "nieWiem" BOOLEAN NOT NULL DEFAULT false,
    "kosztUsd" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AsystentWiadomosc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AsystentRozmowa_ipHash_updatedAt_idx" ON "AsystentRozmowa"("ipHash", "updatedAt");
CREATE INDEX IF NOT EXISTS "AsystentRozmowa_createdAt_idx" ON "AsystentRozmowa"("createdAt");
CREATE INDEX IF NOT EXISTS "AsystentWiadomosc_rozmowaId_createdAt_idx" ON "AsystentWiadomosc"("rozmowaId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AsystentWiadomosc" ADD CONSTRAINT "AsystentWiadomosc_rozmowaId_fkey" FOREIGN KEY ("rozmowaId") REFERENCES "AsystentRozmowa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
