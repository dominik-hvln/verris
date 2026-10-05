-- G-08 — sprzedaż płatnych certyfikatów SSL (DV) przez resellera rejestratora domen.
-- Klucz prywatny tylko zaszyfrowany; opłata z portfela (CHARGE_USAGE), zwrot przy odrzuceniu.
CREATE TYPE "SslOrderStatus" AS ENUM ('PENDING', 'VALIDATING', 'ISSUED', 'INSTALLED', 'FAILED');

CREATE TABLE "SslOrder" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "subscriptionId"   TEXT NOT NULL,
  "domain"           TEXT NOT NULL,
  "wildcard"         BOOLEAN NOT NULL DEFAULT false,
  "productId"        INTEGER NOT NULL,
  "productName"      TEXT NOT NULL,
  "years"            INTEGER NOT NULL DEFAULT 1,
  "validation"       TEXT NOT NULL,
  "approverEmail"    TEXT,
  "status"           "SslOrderStatus" NOT NULL DEFAULT 'PENDING',
  "providerOrderId"  TEXT,
  "privateKeyEnc"    TEXT NOT NULL,
  "csr"              TEXT NOT NULL,
  "certificate"      TEXT,
  "caBundle"         TEXT,
  "dnsRecord"        JSONB,
  "dnsRecordAddedAt" TIMESTAMP(3),
  "priceAmount"      DECIMAL(10,2) NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'PLN',
  "walletTxId"       TEXT,
  "lastError"        TEXT,
  "expiresAt"        TIMESTAMP(3),
  "installedAt"      TIMESTAMP(3),
  "reminderSentAt"   TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SslOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SslOrder_userId_createdAt_idx" ON "SslOrder"("userId", "createdAt");
CREATE INDEX "SslOrder_status_idx" ON "SslOrder"("status");
CREATE INDEX "SslOrder_subscriptionId_idx" ON "SslOrder"("subscriptionId");
-- Dwuklik / dwie karty: jedno zamówienie w toku na domenę usługi (drugie = konflikt, bez drugiego obciążenia).
CREATE UNIQUE INDEX "SslOrder_w_toku_key" ON "SslOrder"("subscriptionId", "domain") WHERE "status" IN ('PENDING', 'VALIDATING');

ALTER TABLE "SslOrder"
  ADD CONSTRAINT "SslOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SslOrder"
  ADD CONSTRAINT "SslOrder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
