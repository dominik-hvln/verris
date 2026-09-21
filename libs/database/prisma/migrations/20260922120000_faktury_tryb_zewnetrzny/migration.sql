-- FAK-01 — faktury VAT wystawia program księgowy, panel wystawia dokument
-- rozliczeniowy. Decyzja: docs/architektura/ADR-2026-09-22-faktury-w-programie-ksiegowym.md
--
-- Istniejące wiersze dostają FAKTURA_VAT — wszystkie powstały w serii VFV/VFK
-- albo jako placeholder Stripe i tym właśnie są.

ALTER TABLE "Invoice"
  ADD COLUMN "rodzajPrawny"          TEXT NOT NULL DEFAULT 'FAKTURA_VAT',
  ADD COLUMN "externalInvoiceNumber" TEXT,
  ADD COLUMN "externalInvoiceAt"     TIMESTAMP(3),
  ADD COLUMN "externalInvoiceById"   TEXT;

CREATE UNIQUE INDEX "Invoice_externalInvoiceNumber_key"
  ON "Invoice"("externalInvoiceNumber");

-- Kod można obejść nowym serwisem, ograniczenia nie (ta sama zasada co M-06
-- i M-16). Trzy reguły:

-- 1. Tylko dwa rodzaje.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_rodzajPrawny_check"
  CHECK ("rodzajPrawny" IN ('FAKTURA_VAT', 'DOKUMENT_ROZLICZENIOWY'));

-- 2. Numer mówi prawdę o rodzaju: seria VDR/VDK wtedy i tylko wtedy, gdy
--    dokument jest rozliczeniowy. Dokument rozliczeniowy z numerem VFV to
--    dokładnie ta druga numeracja faktur, której FAK-01 ma zapobiec.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_rodzajPrawny_seria_check"
  CHECK (
    ("rodzajPrawny" = 'DOKUMENT_ROZLICZENIOWY')
    = ("number" LIKE 'VDR/%' OR "number" LIKE 'VDK/%')
  );

-- 3. Numer faktury zewnętrznej ma sens tylko przy dokumencie rozliczeniowym,
--    i zawsze razem z datą dopisania.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_externalInvoice_check"
  CHECK (
    "externalInvoiceNumber" IS NULL
    OR ("rodzajPrawny" = 'DOKUMENT_ROZLICZENIOWY' AND "externalInvoiceAt" IS NOT NULL)
  );
