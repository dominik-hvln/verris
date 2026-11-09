-- Paczka 124 (9.11.2026) – Verris Kreator: zdjęcia generowane przez AI. Licznik miesięczny per konto
-- (limit z PLANY_KREATORA: próba 3, hosting 20, Pro 100); koszt obrazów w AiInteractionLog (feature 'kreator-obraz').

-- AlterTable
ALTER TABLE "KreatorZuzycie" ADD COLUMN "obrazyAi" INTEGER NOT NULL DEFAULT 0;
