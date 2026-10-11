-- F3.5 (11.10) — obietnica zapłaty: do tej chwili harmonogram nie zawiesza zaległej usługi za brak płatności.
-- Addytywna i idempotentna; stary kod kolumny nie czyta (NULL = brak obietnicy, zachowanie jak dotąd).

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentPromiseUntil" TIMESTAMP(3);
