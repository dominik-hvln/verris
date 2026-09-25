-- PROD-03 — konta wewnętrzne (testowe) poza metrykami i kolejką faktur.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;
