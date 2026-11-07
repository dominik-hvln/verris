-- Paczka 119 (7.11.2026) – Verris Kreator: strony klienta budowane przez AI z modelu JSON (@verris/kreator),
-- historia wersji (do 200 na stronę, przycinane najstarsze ręczne) i miesięczny licznik zużycia kreatora
-- (limity z PLANY_KREATORA, koszt AI z rozbiciem na zapis i odczyt cache).

-- CreateEnum
CREATE TYPE "KreatorStatus" AS ENUM ('SZKIC', 'GENEROWANIE', 'BLAD', 'GOTOWA');

-- CreateEnum
CREATE TYPE "KreatorZrodloWersji" AS ENUM ('AI_GENERACJA', 'AI_ZMIANA', 'RECZNA', 'PRZYWROCENIE');

-- CreateTable
CREATE TABLE "KreatorStrona" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nazwa" TEXT NOT NULL,
    "model" JSONB NOT NULL,
    "wersjaModelu" INTEGER NOT NULL,
    "odcisk" TEXT NOT NULL,
    "branza" TEXT,
    "status" "KreatorStatus" NOT NULL DEFAULT 'SZKIC',
    "bladOpis" TEXT,
    "opublikowanaAt" TIMESTAMP(3),
    "domena" TEXT,
    "propozycje" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KreatorStrona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KreatorWersja" (
    "id" TEXT NOT NULL,
    "stronaId" TEXT NOT NULL,
    "numer" INTEGER NOT NULL,
    "model" JSONB NOT NULL,
    "zrodlo" "KreatorZrodloWersji" NOT NULL,
    "opis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KreatorWersja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KreatorZuzycie" (
    "userId" TEXT NOT NULL,
    "miesiac" TEXT NOT NULL,
    "generacje" INTEGER NOT NULL DEFAULT 0,
    "zmiany" INTEGER NOT NULL DEFAULT 0,
    "wejTokeny" INTEGER NOT NULL DEFAULT 0,
    "wyjTokeny" INTEGER NOT NULL DEFAULT 0,
    "cacheZapis" INTEGER NOT NULL DEFAULT 0,
    "cacheOdczyt" INTEGER NOT NULL DEFAULT 0,
    "kosztUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KreatorZuzycie_pkey" PRIMARY KEY ("userId","miesiac")
);

-- CreateIndex
CREATE INDEX "KreatorStrona_userId_idx" ON "KreatorStrona"("userId");

-- CreateIndex
CREATE INDEX "KreatorStrona_branza_createdAt_idx" ON "KreatorStrona"("branza", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KreatorWersja_stronaId_numer_key" ON "KreatorWersja"("stronaId", "numer");

-- AddForeignKey
ALTER TABLE "KreatorStrona" ADD CONSTRAINT "KreatorStrona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorWersja" ADD CONSTRAINT "KreatorWersja_stronaId_fkey" FOREIGN KEY ("stronaId") REFERENCES "KreatorStrona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorZuzycie" ADD CONSTRAINT "KreatorZuzycie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
