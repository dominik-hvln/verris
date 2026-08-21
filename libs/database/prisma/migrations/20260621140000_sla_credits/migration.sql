-- #11 — Kredyty SLA: automatyczne uznanie portfela za przestój infrastruktury.

ALTER TABLE "ProbeIncident" ADD COLUMN "slaCreditedAt" TIMESTAMP(3);
CREATE INDEX "ProbeIncident_status_slaCreditedAt_idx" ON "ProbeIncident"("status", "slaCreditedAt");

CREATE TABLE "SlaCredit" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "downtimeS" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlaCredit_incidentId_subscriptionId_key" ON "SlaCredit"("incidentId", "subscriptionId");
CREATE INDEX "SlaCredit_userId_idx" ON "SlaCredit"("userId");
CREATE INDEX "SlaCredit_subscriptionId_idx" ON "SlaCredit"("subscriptionId");

ALTER TABLE "SlaCredit" ADD CONSTRAINT "SlaCredit_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ProbeIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaCredit" ADD CONSTRAINT "SlaCredit_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaCredit" ADD CONSTRAINT "SlaCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
