-- Sprint 2.2 — własne faktury VAT PDF (PL).
--
-- Dorzucenie pól wymaganych przez ustawę o VAT (art. 106e):
--   netAmount, vatAmount, vatRate     — rozbicie kwoty brutto (już istniejące `amount`)
--   sellerSnapshot, buyerSnapshot     — JSON-snapshoty stron transakcji
--   lineItems                         — JSON listy pozycji
--   storageKey                        — referencja do MinIO bucketu `verris-invoices`
--
-- Plus model InvoiceCounter dla atomowej numeracji VFV/YYYY/MM/{seq}.

-- Existing Invoice — non-breaking: wszystkie nowe kolumny nullable, więc
-- istniejące rekordy nie wymagają backfillu. Pierwszy nowy generated PDF
-- wpisze nowe kolumny komplet.
ALTER TABLE "Invoice"
  ADD COLUMN "netAmount"      DECIMAL(12, 2),
  ADD COLUMN "vatAmount"      DECIMAL(12, 2),
  ADD COLUMN "vatRate"        DECIMAL(5, 2),
  ADD COLUMN "sellerSnapshot" JSONB,
  ADD COLUMN "buyerSnapshot"  JSONB,
  ADD COLUMN "lineItems"      JSONB,
  ADD COLUMN "storageKey"     TEXT;

-- Atomowa numeracja faktur. ON CONFLICT (year, month) DO UPDATE SET seq = seq+1
-- RETURNING seq w transakcji = unique number bez luk pod konkurencją.
CREATE TABLE "InvoiceCounter" (
  "id"        TEXT      PRIMARY KEY,
  "year"      INTEGER   NOT NULL,
  "month"     INTEGER   NOT NULL,
  "seq"       INTEGER   NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "InvoiceCounter_year_month_key"
  ON "InvoiceCounter" ("year", "month");
