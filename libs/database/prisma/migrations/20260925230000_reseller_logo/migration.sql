-- O-09 — logo resellera widoczne dla jego klientów (panel i maile).
ALTER TABLE "ResellerProfile" ADD COLUMN "logoData" BYTEA;
ALTER TABLE "ResellerProfile" ADD COLUMN "logoMime" TEXT;
ALTER TABLE "ResellerProfile" ADD COLUMN "logoVersion" INTEGER NOT NULL DEFAULT 0;
