-- PB-29: węzeł przyjmuje klientów dopiero po zielonej weryfikacji onboardu.
-- PB-30: wersja manifestu stosu i domyślne PHP z telemetrii (raport zgodności floty).
ALTER TABLE "Server" ADD COLUMN "stackVersion" TEXT,
  ADD COLUMN "phpDefaultVersion" TEXT,
  ADD COLUMN "onboardVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "onboardReport" JSONB;
-- Węzły aktywne przed PB-29 przeszły onboard według runbooka — nie wyłączamy ich z przydziału kont.
UPDATE "Server" SET "onboardVerifiedAt" = NOW() WHERE "status" = 'ACTIVE';
