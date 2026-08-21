-- Incydent Hetzner 2026-06-11: alerty bezpieczeństwa z węzła (wychodzący skan itp.).
ALTER TABLE "Server" ADD COLUMN "lastSecurityAlertAt" TIMESTAMP(3);
ALTER TABLE "Server" ADD COLUMN "lastSecurityAlertKind" TEXT;
ALTER TABLE "Server" ADD COLUMN "lastSecurityAlertInfo" TEXT;
