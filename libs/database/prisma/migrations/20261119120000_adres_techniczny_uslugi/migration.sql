-- Paczka 129 (19.11.2026) – adres techniczny usługi hostingowej (`<identyfikator>.<HOSTING_TECH_DOMAIN>`).
-- Zamówienie hostingu bez domeny zakłada konto na tym adresie; usługa z własną domeną dostaje go jako alias.
-- NULL dla usług sprzed paczki – nadawany tylko nowym (bez migracji kont na węzłach).

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "adresTechniczny" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_adresTechniczny_key" ON "Subscription"("adresTechniczny");
