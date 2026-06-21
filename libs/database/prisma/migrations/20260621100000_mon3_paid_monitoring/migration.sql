-- MON-3 — płatny tier monitoringu (szybsze sprawdzanie), rozliczany miesięcznie
-- z portfela. paidTier=false → darmowy interwał (z ustawień admina).
ALTER TABLE "SiteMonitor" ADD COLUMN "paidTier" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteMonitor" ADD COLUMN "paidActivatedAt" TIMESTAMP(3);
ALTER TABLE "SiteMonitor" ADD COLUMN "paidNextChargeAt" TIMESTAMP(3);
ALTER TABLE "SiteMonitor" ADD COLUMN "paidCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "SiteMonitor_paidTier_paidNextChargeAt_idx" ON "SiteMonitor"("paidTier", "paidNextChargeAt");
