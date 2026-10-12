-- K4 (PB-53.6, 12.10) — proforma z linkiem do płatności. Proforma nie jest dokumentem księgowym: własna seria PRO
-- (licznik w "InvoiceCounter", rozłączny z VFV/VFK/VDR/VDK), osobna tabela — KSeF czyta wyłącznie "Invoice".
-- Addytywna i idempotentna (nowa tabela); stary kod jej nie czyta, więc „migrate deploy, potem kod” jest bezpieczne.

CREATE TABLE IF NOT EXISTS "Proforma" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WYSTAWIONA',
    "amount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "lineItems" JSONB NOT NULL,
    "vatMeta" JSONB NOT NULL,
    "sellerSnapshot" JSONB,
    "buyerSnapshot" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "walletTxId" TEXT,
    "invoiceId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Proforma_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Proforma_status_check" CHECK ("status" IN ('WYSTAWIONA', 'OPLACONA', 'ANULOWANA')),
    CONSTRAINT "Proforma_kwota_check" CHECK ("amount" > 0 AND "netAmount" + "vatAmount" = "amount"),
    -- OPŁACONA ma wpłatę, ANULOWANA ma powód — stan bez dowodu nie przejdzie nawet z ręcznego UPDATE.
    CONSTRAINT "Proforma_oplacona_check" CHECK ("status" <> 'OPLACONA' OR ("paidAt" IS NOT NULL AND "walletTxId" IS NOT NULL)),
    CONSTRAINT "Proforma_anulowana_check" CHECK ("status" <> 'ANULOWANA' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "Proforma_number_key" ON "Proforma"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Proforma_walletTxId_key" ON "Proforma"("walletTxId");
CREATE UNIQUE INDEX IF NOT EXISTS "Proforma_invoiceId_key" ON "Proforma"("invoiceId");
CREATE INDEX IF NOT EXISTS "Proforma_userId_issuedAt_idx" ON "Proforma"("userId", "issuedAt");

DO $$ BEGIN
  ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
