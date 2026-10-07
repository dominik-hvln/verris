-- Sondy platformy (panel klienta, strona www, API) nie są przypięte do węzła.
ALTER TABLE "ServiceProbe" ALTER COLUMN "serverId" DROP NOT NULL;
ALTER TABLE "ServiceProbe" ADD COLUMN "grupa" TEXT;

-- Unikalność (serverId, kind, target) nie działa dla NULL — sondy platformy pilnuje osobny indeks.
CREATE UNIQUE INDEX "ServiceProbe_platforma_key" ON "ServiceProbe"("kind", "target") WHERE "serverId" IS NULL;
