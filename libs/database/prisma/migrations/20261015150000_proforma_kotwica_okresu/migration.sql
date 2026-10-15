-- Decyzja 15.10 (#7): kotwica okresu proformy „odnowienie” — sprawdzana przy księgowaniu wpłaty.
ALTER TABLE "Proforma" ADD COLUMN IF NOT EXISTS "okresOd" TIMESTAMP(3);
