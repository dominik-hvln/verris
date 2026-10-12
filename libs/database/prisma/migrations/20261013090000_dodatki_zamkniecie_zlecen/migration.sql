-- M-33 (12.10) — dodatki-zlecenia (dedykowane IP, konfiguracja przez specjalistę) zamykane przez zespół:
-- „Zrealizowano” (status DONE + notatka dla klienta) albo „Odmowa ze zwrotem” (status REFUNDED + powód, zwrot na portfel).
-- Status jest tekstem (nie enumem), więc nowe wartości nie wymagają zmiany typu. Dochodzą kolumny zamknięcia i indeks
-- po zgłoszeniu (strona zgłoszenia „Dodatek: …” w panelu obsługi szuka zlecenia po ticketId).
-- Addytywna i idempotentna (kolumny dopuszczają NULL, bez wartości domyślnej); stary kod ich nie czyta ani nie pisze,
-- więc kolejność „migrate deploy, potem kod” jest bezpieczna.

ALTER TABLE "PurchasedAddon" ADD COLUMN IF NOT EXISTS "resolvedNote" TEXT;
ALTER TABLE "PurchasedAddon" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "PurchasedAddon" ADD COLUMN IF NOT EXISTS "resolvedById" TEXT;

CREATE INDEX IF NOT EXISTS "PurchasedAddon_ticketId_idx" ON "PurchasedAddon"("ticketId");
