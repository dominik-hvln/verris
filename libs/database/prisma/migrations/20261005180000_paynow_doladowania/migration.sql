-- 2026-10-05 — Paynow (mBank) jako główna bramka doładowań portfela w PLN.
-- Rekord płatności: kwota, kod promocyjny i stawka VAT ustalone przy tworzeniu (Paynow nie trzyma metadanych).
CREATE TABLE "PaynowPlatnosc" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kwotaMinor" INTEGER NOT NULL,
    "waluta" TEXT NOT NULL DEFAULT 'PLN',
    "paymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "meta" JSONB NOT NULL,
    "walletTxId" TEXT,
    "zwroconoMinor" INTEGER NOT NULL DEFAULT 0,
    "zwrotyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaynowPlatnosc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaynowPlatnosc_paymentId_key" ON "PaynowPlatnosc"("paymentId");
CREATE UNIQUE INDEX "PaynowPlatnosc_walletTxId_key" ON "PaynowPlatnosc"("walletTxId");
CREATE INDEX "PaynowPlatnosc_userId_createdAt_idx" ON "PaynowPlatnosc"("userId", "createdAt");

ALTER TABLE "PaynowPlatnosc" ADD CONSTRAINT "PaynowPlatnosc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
