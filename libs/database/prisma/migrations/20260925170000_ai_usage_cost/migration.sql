-- Dwupoziomowy asystent AI: zużycie tokenów i szacowany koszt każdego wywołania.
ALTER TABLE "AiInteractionLog" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "AiInteractionLog" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "AiInteractionLog" ADD COLUMN "costUsd" DECIMAL(12,6);
