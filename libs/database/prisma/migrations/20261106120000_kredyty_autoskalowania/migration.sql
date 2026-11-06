-- Decyzja 6.11.2026 — „rabat na start” zastąpiony kredytami na autoskalowanie przy pierwszym zakupie hostingu.
-- Osobna pula poza portfelem (nie zmienia User.walletBalance): wydaje ją tylko rozliczenie autoskalowania,
-- ważna 12 miesięcy od przyznania. Jedna pula na klienta.

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "kredytAutoskalowaniaKwota" DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS "KredytAutoskalowania" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kwota" DECIMAL(12,2) NOT NULL,
    "pozostalo" DECIMAL(12,2) NOT NULL,
    "przyznanoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wygasaAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KredytAutoskalowania_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KredytAutoskalowania_pozostalo_check" CHECK ("pozostalo" >= 0 AND "pozostalo" <= "kwota")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KredytAutoskalowania_userId_key" ON "KredytAutoskalowania"("userId");
ALTER TABLE "KredytAutoskalowania" ADD CONSTRAINT "KredytAutoskalowania_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "KredytAutoskalowaniaUzycie" (
    "id" TEXT NOT NULL,
    "kredytId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kwota" DECIMAL(12,2) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KredytAutoskalowaniaUzycie_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KredytAutoskalowaniaUzycie_idempotencyKey_key" ON "KredytAutoskalowaniaUzycie"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "KredytAutoskalowaniaUzycie_kredytId_idx" ON "KredytAutoskalowaniaUzycie"("kredytId");
CREATE INDEX IF NOT EXISTS "KredytAutoskalowaniaUzycie_subscriptionId_createdAt_idx" ON "KredytAutoskalowaniaUzycie"("subscriptionId", "createdAt");
ALTER TABLE "KredytAutoskalowaniaUzycie" ADD CONSTRAINT "KredytAutoskalowaniaUzycie_kredytId_fkey"
    FOREIGN KEY ("kredytId") REFERENCES "KredytAutoskalowania"("id") ON DELETE CASCADE ON UPDATE CASCADE;
