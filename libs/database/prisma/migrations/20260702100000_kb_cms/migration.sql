-- KB-CMS — Baza Wiedzy: kategorie/podkategorie + artykuły (Markdown, status,
-- SEO). Idempotentnie (IF NOT EXISTS / DO-EXCEPTION), zgodnie z konwencją repo.

-- 1) Enum statusu artykułu.
DO $$ BEGIN
  CREATE TYPE "KbArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) KbCategory (self-relacja parentId → podkategorie).
CREATE TABLE IF NOT EXISTS "KbCategory" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "icon"        TEXT,
  "parentId"    TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KbCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KbCategory_slug_key" ON "KbCategory"("slug");
CREATE INDEX IF NOT EXISTS "KbCategory_parentId_idx" ON "KbCategory"("parentId");

-- 3) KbArticle.
CREATE TABLE IF NOT EXISTS "KbArticle" (
  "id"             TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "categoryId"     TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "excerpt"        TEXT,
  "bodyMarkdown"   TEXT NOT NULL,
  "status"         "KbArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "seoTitle"       TEXT,
  "seoDescription" TEXT,
  "authorUserId"   TEXT,
  "authorName"     TEXT,
  "order"          INTEGER NOT NULL DEFAULT 0,
  "views"          INTEGER NOT NULL DEFAULT 0,
  "publishedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KbArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KbArticle_slug_key" ON "KbArticle"("slug");
CREATE INDEX IF NOT EXISTS "KbArticle_categoryId_status_idx" ON "KbArticle"("categoryId", "status");
CREATE INDEX IF NOT EXISTS "KbArticle_status_publishedAt_idx" ON "KbArticle"("status", "publishedAt");

-- 4) Klucze obce (idempotentnie).
DO $$ BEGIN
  ALTER TABLE "KbCategory"
    ADD CONSTRAINT "KbCategory_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "KbCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "KbArticle"
    ADD CONSTRAINT "KbArticle_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "KbCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
