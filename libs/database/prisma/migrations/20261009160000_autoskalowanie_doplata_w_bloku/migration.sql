-- Autoskalowanie: opłacony poziom bieżącego bloku 15 min — podstawa dopłaty, gdy poziom rośnie w trakcie bloku.
-- NULL = nieznane (konta skalowane przed wdrożeniem): bieżący poziom zostaje przyjęty jako opłacony, bez dopłaty.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "scaledBlockPaidPln" DECIMAL(12,6);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "scaledBlockPaidCpu" INTEGER;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "scaledBlockPaidRamMb" INTEGER;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "scaledBlockPaidDiskMb" INTEGER;
