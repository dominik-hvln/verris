-- Sprint 4 / A-08 — maintenance mode metadata na poziomie węzła.
-- Wartości używane przez NodeSelector (filtr w panelu klienta) i UI admina.
ALTER TABLE "Server" ADD COLUMN "maintenanceReason" TEXT;
ALTER TABLE "Server" ADD COLUMN "maintenanceStartedAt" TIMESTAMP(3);
ALTER TABLE "Server" ADD COLUMN "maintenanceStartedById" TEXT;
