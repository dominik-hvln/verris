-- Autoskalowanie: reszta groszy przenoszona między blokami rozliczeniowymi (zamiast zaokrąglania każdego bloku osobno).
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "scaledCostCarryPln" DECIMAL(12,6) NOT NULL DEFAULT 0;
