-- I-04/I-05 — aktualizacje WordPressa (zadanie WP_UPDATE) i ustawienia automatycznych aktualizacji.
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'WP_UPDATE';

CREATE TABLE "WpAutoUpdate" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "core" TEXT NOT NULL DEFAULT 'minor',
    "plugins" BOOLEAN NOT NULL DEFAULT false,
    "themes" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WpAutoUpdate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WpAutoUpdate_accountId_domain_key" ON "WpAutoUpdate"("accountId", "domain");

ALTER TABLE "WpAutoUpdate" ADD CONSTRAINT "WpAutoUpdate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
