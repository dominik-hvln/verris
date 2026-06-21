-- MON-5 — śledzenie wygasania certyfikatu TLS strony klienta.
ALTER TABLE "SiteMonitor" ADD COLUMN "tlsExpiresAt" TIMESTAMP(3);
ALTER TABLE "SiteMonitor" ADD COLUMN "tlsCheckedAt" TIMESTAMP(3);
ALTER TABLE "SiteMonitor" ADD COLUMN "tlsExpiryNotifiedFor" TIMESTAMP(3);
