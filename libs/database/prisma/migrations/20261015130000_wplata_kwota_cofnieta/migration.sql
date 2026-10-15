-- Decyzja 15.10 (#2): znacznik cofnięcia na wpłacie — prowizja partnera liczy się od gotówki po zwrotach i sporach.
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "kwotaCofnieta" DECIMAL(12,2);
