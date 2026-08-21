-- Z-06 — klucz idempotencji zakupu dodatku.
--
-- Do 2026-08-21 klucz przekazywany do księgi portfela zawierał Date.now(), więc
-- każde kliknięcie tworzyło inny klucz i mechanizm ochrony przed podwójnym
-- obciążeniem nie miał czego porównywać. Unikalny indeks poniżej przenosi tę
-- gwarancję do bazy: dwa równoległe żądania z tym samym kluczem nie mogą
-- utworzyć dwóch zakupów.
--
-- Kolumna jest NULLABLE, bo rekordy sprzed tej daty klucza nie mają.
-- W PostgreSQL UNIQUE dopuszcza wiele NULL-i, więc stare wiersze nie kolidują.
ALTER TABLE "PurchasedAddon" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "PurchasedAddon_idempotencyKey_key" ON "PurchasedAddon"("idempotencyKey");
