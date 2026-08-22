-- Z-05 — zdarzenie webhooka dostaje STAN.
--
-- Do dziś wiersz w tej tabeli nie miał stanu, więc jego ISTNIENIE znaczyło
-- „widziałem to zdarzenie", a kod czytał je jako „obsłużyłem to zdarzenie".
-- Handler, który rzucił wyjątkiem, zostawiał wiersz na miejscu; ponowienie ze
-- Stripe'a trafiało w unikalny indeks, dostawało odpowiedź „duplikat" i kod 200,
-- a Stripe przestawał ponawiać. Klient zapłacił, saldo się nie pojawiło.

CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

ALTER TABLE "StripeWebhookEvent"
  ADD COLUMN "status"          "StripeWebhookEventStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "payload"         JSONB,
  ADD COLUMN "attempts"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError"       TEXT,
  ADD COLUMN "claimedAt"       TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt"   TIMESTAMP(3),
  ADD COLUMN "processedAt"     TIMESTAMP(3),
  ADD COLUMN "alertedAt"       TIMESTAMP(3),
  ADD COLUMN "payloadPurgedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── Wiersze historyczne ──────────────────────────────────────────────────────
--
-- Oznaczamy je jako PROCESSED, i to jest decyzja, nie oczywistość. Uzasadnienie:
-- pod STARYM kodem samo istnienie wiersza powodowało odrzucanie ponowień, czyli
-- system JUŻ zachowywał się tak, jakby te zdarzenia były obsłużone. Nadanie im
-- stanu PENDING kazałoby schedulerowi ponowić miesiące starych zdarzeń — a te
-- nie mają zapisanej treści, więc ponowienie i tak by się nie udało, za to
-- zasypałoby adminów alertami.
--
-- CZEGO TA MIGRACJA NIE ROBI: nie mówi nic o tym, czy któreś z tych zdarzeń
-- naprawdę zostało obsłużone. Tego nie da się odczytać z tej tabeli, bo stary
-- wiersz nie przechowywał ani treści, ani identyfikatora sesji, więc nie ma jak
-- go skorelować z transakcją portfela.
--
-- Odpowiedzią na przeszłość jest osobne narzędzie, nie ta migracja:
-- `ops/scripts/uzgodnij-platnosci-stripe.mjs` porównuje opłacone sesje Stripe'a
-- z transakcjami portfela po kluczu idempotencji i wypisuje płatności bez
-- pokrycia. Procedura opisana w docs/zadania/Z-05-*.md.
UPDATE "StripeWebhookEvent"
SET "status"      = 'PROCESSED',
    "processedAt" = "createdAt",
    "attempts"    = 1
WHERE "processedAt" IS NULL;

CREATE INDEX "StripeWebhookEvent_status_nextAttemptAt_idx"
  ON "StripeWebhookEvent"("status", "nextAttemptAt");
CREATE INDEX "StripeWebhookEvent_status_claimedAt_idx"
  ON "StripeWebhookEvent"("status", "claimedAt");
