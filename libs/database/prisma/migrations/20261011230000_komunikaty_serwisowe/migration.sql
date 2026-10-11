-- F3.8 (ON-01, ON-05, 11.10) — komunikaty serwisowe do klientów węzła albo planu (incydent, prace serwisowe).
-- Addytywna i idempotentna (nowe tabele); stary kod ich nie czyta, więc migracja może wejść przed podmianą kodu
-- („prisma migrate deploy” przed nowym obrazem API).

CREATE TABLE IF NOT EXISTS "KomunikatSerwisowy" (
    "id" TEXT NOT NULL,
    "zakres" TEXT NOT NULL,
    "serverId" TEXT,
    "planId" TEXT,
    "temat" VARCHAR(200) NOT NULL,
    "tresc" TEXT NOT NULL,
    "powod" VARCHAR(500) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WYSYLANY',
    "odbiorcow" INTEGER NOT NULL DEFAULT 0,
    "wyslano" INTEGER NOT NULL DEFAULT 0,
    "bledow" INTEGER NOT NULL DEFAULT 0,
    "pominieto" INTEGER NOT NULL DEFAULT 0,
    "utworzylId" TEXT,
    "zakonczono" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KomunikatSerwisowy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KomunikatSerwisowy_status_createdAt_idx" ON "KomunikatSerwisowy"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "KomunikatSerwisowyOdbiorca" (
    "id" TEXT NOT NULL,
    "komunikatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CZEKA',
    "emailLogId" TEXT,
    "zmieniono" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KomunikatSerwisowyOdbiorca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KomunikatSerwisowyOdbiorca_komunikatId_userId_key" ON "KomunikatSerwisowyOdbiorca"("komunikatId", "userId");
CREATE INDEX IF NOT EXISTS "KomunikatSerwisowyOdbiorca_komunikatId_status_idx" ON "KomunikatSerwisowyOdbiorca"("komunikatId", "status");

DO $$ BEGIN
  ALTER TABLE "KomunikatSerwisowyOdbiorca" ADD CONSTRAINT "KomunikatSerwisowyOdbiorca_komunikatId_fkey"
    FOREIGN KEY ("komunikatId") REFERENCES "KomunikatSerwisowy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
