-- F2.7 (11.10) — uchwyt abonenta (kontakt klienta u rejestratora) zapisany przy zamówieniu rejestracji i transferu.
-- Bez niego operator nie ponowi nieudanej rejestracji na dane klienta (A-13: abonent = klient, nie operator).
-- Sama kolumna NULL — stary kod (przed podmianą) jej nie zna i działa dalej; zamówienia sprzed zmiany zostają bez uchwytu.

ALTER TABLE "DomainRegistrarOrder" ADD COLUMN IF NOT EXISTS "ownerHandle" TEXT;
