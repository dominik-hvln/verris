-- P-8 — one-time add-on store.

ALTER TABLE "User"
  ADD COLUMN "prioritySupport"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "prioritySupportUntil" TIMESTAMP(3);

CREATE TABLE "PurchasedAddon" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "amount"         DECIMAL(10,2) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'PLN',
  "subscriptionId" TEXT,
  "status"         TEXT NOT NULL DEFAULT 'APPLIED',
  "ticketId"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchasedAddon_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchasedAddon_userId_createdAt_idx" ON "PurchasedAddon"("userId", "createdAt");

ALTER TABLE "PurchasedAddon"
  ADD CONSTRAINT "PurchasedAddon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
