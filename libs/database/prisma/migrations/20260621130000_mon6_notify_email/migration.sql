-- MON-6 — per-usługa: czy wysyłać maile o awarii/powrocie/SSL (monitoring działa niezależnie).
ALTER TABLE "SiteMonitor" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true;
