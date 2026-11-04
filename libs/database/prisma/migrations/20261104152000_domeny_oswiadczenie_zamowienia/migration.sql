-- Decyzja 21 (4.11.2026): oświadczenie o natychmiastowym wykonaniu i utracie prawa odstąpienia (art. 38 ust. 1 pkt 1
-- upk, Regulamin §12 ust. 8) składane przy każdym zamówieniu domeny — treść i chwila złożenia przy zamówieniu.
ALTER TABLE "DomainRegistrarOrder" ADD COLUMN "withdrawalWaiverText" TEXT;
ALTER TABLE "DomainRegistrarOrder" ADD COLUMN "withdrawalWaiverAt" TIMESTAMP(3);
