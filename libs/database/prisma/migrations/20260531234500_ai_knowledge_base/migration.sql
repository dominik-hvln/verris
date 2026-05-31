-- AI knowledge base (RAG) for the hosting chatbot + staff assistant.

CREATE TYPE "AiKnowledgeAudience" AS ENUM ('CLIENT', 'STAFF', 'ALL');
CREATE TYPE "AiKnowledgeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "AiKnowledgeDoc" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'TEXT',
    "sourceRef" TEXT,
    "audience" "AiKnowledgeAudience" NOT NULL DEFAULT 'ALL',
    "status" "AiKnowledgeStatus" NOT NULL DEFAULT 'ACTIVE',
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiKnowledgeDoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiKnowledgeChunk" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiKnowledgeDoc_audience_status_idx" ON "AiKnowledgeDoc"("audience", "status");
CREATE INDEX "AiKnowledgeDoc_createdAt_idx" ON "AiKnowledgeDoc"("createdAt");
CREATE INDEX "AiKnowledgeChunk_docId_ordinal_idx" ON "AiKnowledgeChunk"("docId", "ordinal");

ALTER TABLE "AiKnowledgeDoc" ADD CONSTRAINT "AiKnowledgeDoc_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiKnowledgeChunk" ADD CONSTRAINT "AiKnowledgeChunk_docId_fkey" FOREIGN KEY ("docId") REFERENCES "AiKnowledgeDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
