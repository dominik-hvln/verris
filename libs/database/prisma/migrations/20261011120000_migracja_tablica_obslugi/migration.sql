-- D11 (11.10) — tablica migracji obsługi: etap obsługi (osobny od statusu automatu), twarde terminy, Przerywacz,
-- przypisanie, okno poprawek, checklisty etapów, raport pomigracyjny i log kontaktów z klientem.
-- Same nowe kolumny z wartościami domyślnymi i nowa tabela — stary kod (przed podmianą) ich nie zna i działa dalej
-- („prisma migrate deploy” przed podmianą kodu). Idempotentna: IF NOT EXISTS / duplicate_object.

DO $$ BEGIN
  CREATE TYPE "MigracjaEtap" AS ENUM ('NOWA', 'TESTY', 'DO_ZMIANY_DNS', 'PO_PRZELACZENIU', 'ZAMKNIETA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MigracjaKanalKontaktu" AS ENUM ('TELEFON', 'MAIL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "MigrationRequest"
  ADD COLUMN IF NOT EXISTS "etapObslugi" "MigracjaEtap" NOT NULL DEFAULT 'NOWA',
  ADD COLUMN IF NOT EXISTS "etapOd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termin" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "wygasaUStaregoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "domenaWygasaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "przerywacz" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "przypisanyDoId" TEXT,
  ADD COLUMN IF NOT EXISTS "poprawkiDo" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checklista" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "raportWyslanyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terminAlert" TEXT;

CREATE INDEX IF NOT EXISTS "MigrationRequest_etapObslugi_idx" ON "MigrationRequest"("etapObslugi");

CREATE TABLE IF NOT EXISTS "MigracjaKontakt" (
    "id" TEXT NOT NULL,
    "migrationRequestId" TEXT NOT NULL,
    "kanal" "MigracjaKanalKontaktu" NOT NULL,
    "tresc" TEXT NOT NULL,
    "ticketId" TEXT,
    "autorId" TEXT,
    "kiedy" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MigracjaKontakt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MigracjaKontakt_migrationRequestId_kiedy_idx" ON "MigracjaKontakt"("migrationRequestId", "kiedy");

DO $$ BEGIN
  ALTER TABLE "MigracjaKontakt" ADD CONSTRAINT "MigracjaKontakt_migrationRequestId_fkey"
    FOREIGN KEY ("migrationRequestId") REFERENCES "MigrationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Migracje zakończone przed tablicą (dane przeniesione i DNS przełączony) — od razu „Zamknięta”, żeby tablica
-- nie zaczęła od alertów „po terminie” dla historii. Tylko wiersze, których etapu nikt jeszcze nie ruszał (etapOd NULL).
UPDATE "MigrationRequest"
SET "etapObslugi" = 'ZAMKNIETA', "etapOd" = "cutoverAt"
WHERE "etapObslugi" = 'NOWA' AND "etapOd" IS NULL AND "status" = 'COMPLETED' AND "cutoverAt" IS NOT NULL;
