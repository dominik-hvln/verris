-- 21.10 — wdrożenia z Gita: budowanie po pobraniu kodu i zmienne środowiskowe (.env) per domena/katalog.
-- Addytywna i idempotentna (nowa tabela); stary kod jej nie czyta, więc „migrate deploy, potem kod” jest bezpieczne.

CREATE TABLE IF NOT EXISTS "GitKonfiguracja" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dir" TEXT NOT NULL DEFAULT '',
    "budowanie" TEXT NOT NULL DEFAULT '',
    "zmienneEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GitKonfiguracja_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GitKonfiguracja_budowanie_check" CHECK ("budowanie" IN ('', 'npm-build', 'npm-ci', 'composer'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "GitKonfiguracja_accountId_domain_dir_key" ON "GitKonfiguracja"("accountId", "domain", "dir");

DO $$ BEGIN
  ALTER TABLE "GitKonfiguracja" ADD CONSTRAINT "GitKonfiguracja_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
