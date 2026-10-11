-- F3.7 cz. 2 (11.10) — makra zgłoszeń (akcje przy szablonie odpowiedzi) i scalanie zgłoszeń.
-- Addytywna i idempotentna (nowe kolumny z wartością domyślną albo NULL); stary kod ich nie czyta,
-- więc migracja może wejść przed podmianą kodu („prisma migrate deploy” przed nowym obrazem API).

ALTER TABLE "CannedResponse" ADD COLUMN IF NOT EXISTS "makroStan" TEXT;
ALTER TABLE "CannedResponse" ADD COLUMN IF NOT EXISTS "makroTagi" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CannedResponse" ADD COLUMN IF NOT EXISTS "makroPrzypisz" TEXT;

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "scalonoDoId" TEXT;
