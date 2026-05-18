-- Sprint 5 / R-11+B-7 — szczegółowy status provisioningu widoczny dla klienta
-- (queued / running / retrying / failed / completed) oraz dane do obserwacji
-- przebiegu (próby, ostatni błąd, czasy startu/końca).
ALTER TABLE "Subscription" ADD COLUMN "provisioningStage" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "provisioningAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "provisioningLastError" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "provisioningStartedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "provisioningCompletedAt" TIMESTAMP(3);
