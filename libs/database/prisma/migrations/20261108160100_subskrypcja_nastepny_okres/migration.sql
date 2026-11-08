-- Paczka 123 (8.11.2026) – zmiana okresu rozliczenia (miesiąc ↔ rok) od następnego odnowienia (dziś: Kreator Pro).
-- Odnowienie z portfela pobiera cenę nowego okresu i przestawia `interval`; kartą (Stripe) zmiana ceny subskrypcji
-- tuż przed końcem okresu (renewal.scheduler.ts). NULL = bez zmiany.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "nastepnyInterwal" "BillingInterval";
