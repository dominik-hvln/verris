-- F2.4 (10.10) — notatki wewnętrzne o kliencie: wiele, z autorem, datą i przypięciem (wcześniej jedno pole
-- User.adminInternalNote). Dotychczasowa notatka przechodzi jako pierwsza: przypięta, bez autora, z datą
-- ostatniej zmiany konta. Kolumna adminInternalNote zostaje (zgodność wsteczna, stara karta w panelu obsługi).

CREATE TABLE IF NOT EXISTS "CustomerNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerNote_userId_pinned_createdAt_idx" ON "CustomerNote"("userId", "pinned", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO "CustomerNote" ("id", "userId", "authorId", "body", "pinned", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", NULL, u."adminInternalNote", true, u."updatedAt", CURRENT_TIMESTAMP
FROM "User" u
WHERE btrim(coalesce(u."adminInternalNote", '')) <> ''
  AND u."anonymizedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "CustomerNote" n WHERE n."userId" = u."id");
