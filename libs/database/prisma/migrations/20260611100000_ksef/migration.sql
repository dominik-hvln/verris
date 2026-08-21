-- B-1: KSeF (Krajowy System e-Faktur) — statusy i numery faktur ustrukturyzowanych.
CREATE TYPE "KsefStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'OFFLINE');

ALTER TABLE "Invoice" ADD COLUMN "ksefStatus" "KsefStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "Invoice" ADD COLUMN "ksefNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ksefElementRef" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ksefSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "ksefAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "ksefError" TEXT;

CREATE UNIQUE INDEX "Invoice_ksefNumber_key" ON "Invoice"("ksefNumber");
CREATE INDEX "Invoice_ksefStatus_idx" ON "Invoice"("ksefStatus");
