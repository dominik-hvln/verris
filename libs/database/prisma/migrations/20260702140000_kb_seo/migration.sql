-- KB-SEO — FAQ (JSONB) + powiązane artykuły (slugi) na KbArticle. Idempotentnie.
ALTER TABLE "KbArticle" ADD COLUMN IF NOT EXISTS "faq" JSONB;
ALTER TABLE "KbArticle" ADD COLUMN IF NOT EXISTS "relatedSlugs" TEXT[] NOT NULL DEFAULT '{}';
