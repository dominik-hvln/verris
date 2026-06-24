-- DB-1 — silnik i wersja bazy danych węzła, raportowane przez agenta verris-lve.
ALTER TABLE "Server" ADD COLUMN "dbEngine" TEXT;
ALTER TABLE "Server" ADD COLUMN "dbVersion" TEXT;
ALTER TABLE "Server" ADD COLUMN "dbCheckedAt" TIMESTAMP(3);
