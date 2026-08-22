-- Z-01 — faktura VAT dla płatności portfelem.
--
-- Do dziś dokument księgowy powstawał WYŁĄCZNIE ze zdarzeń `invoice.*` ze
-- Stripe'a. Obciążenie portfela — odnowienie abonamentu, domena, VPS,
-- monitoring, autoskalowanie — nie tworzyło niczego. Klient płacił realnie
-- i nie dostawał żadnego dokumentu, a operator nie miał czym wystawić go
-- ręcznie.

-- ── Powiązanie obciążenia z fakturą ─────────────────────────────────────────
-- NULL na wpisie obciążeniowym znaczy „czeka na fakturę zbiorczą" albo
-- „nie podlega fakturowaniu" (doładowanie, korekta admina).
ALTER TABLE "WalletTransaction"
  ADD COLUMN "invoiceId" TEXT;

ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WalletTransaction_invoiceId_idx" ON "WalletTransaction"("invoiceId");
CREATE INDEX "WalletTransaction_type_invoiceId_createdAt_idx"
  ON "WalletTransaction"("type", "invoiceId", "createdAt");

-- ── Ponawianie finalizacji faktury ──────────────────────────────────────────
-- Finalizacja to PDF + wysłanie do MinIO + zgłoszenie do KSeF-a + mail. Do
-- 2026-08-22 wywoływano ją raz, z `.catch(log)`. Błąd generowania PDF-u
-- kończył się wpisem w logu i fakturą bez pliku, o której nikt się nie
-- dowiadywał — ta sama klasa błędu co Z-05 w webhooku płatności, tylko
-- w dokumentach zamiast w pieniądzach.
ALTER TABLE "Invoice"
  ADD COLUMN "finalizeAttempts"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "finalizeLastError"     TEXT,
  ADD COLUMN "finalizeNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "finalizeAlertedAt"     TIMESTAMP(3);

-- Faktury opłacone, którym brakuje PDF-u, zostaną podjęte przez scheduler.
-- Nie wypełniamy `finalizeNextAttemptAt` — NULL znaczy „od razu przy
-- najbliższym przebiegu", i tak ma być: to są dokumenty, których klient nie
-- dostał, więc nie ma powodu ich odkładać.
CREATE INDEX "Invoice_status_storageKey_idx" ON "Invoice"("status", "storageKey");
CREATE INDEX "Invoice_status_finalizeNextAttemptAt_idx"
  ON "Invoice"("status", "finalizeNextAttemptAt");
