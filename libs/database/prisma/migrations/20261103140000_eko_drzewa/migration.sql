-- W6 (3.11.2026, decyzja 12) — wkład w drzewa i zamówienia sadzenia u partnera (posadzimy.pl).
-- Jednostka udziału: część = 1/10 000 drzewa. Tylko nowe tabele i typy — bez zmian w istniejących danych.

-- CreateEnum
CREATE TYPE "EcoWkladZrodlo" AS ENUM ('USLUGA', 'PUNKTY');

-- CreateEnum
CREATE TYPE "EcoSadzenieRodzaj" AS ENUM ('PULA', 'WLASNE');

-- CreateEnum
CREATE TYPE "EcoSadzenieStatus" AS ENUM ('OCZEKUJE', 'WYSYLANE', 'NIEPEWNE', 'ZLOZONE', 'POSADZONE');

-- CreateTable
CREATE TABLE "EcoWkladDrzewa" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "zrodlo" "EcoWkladZrodlo" NOT NULL,
    "czesci" INTEGER NOT NULL,
    "referenceId" VARCHAR(200),
    "subscriptionId" TEXT,
    "kwotaNettoGrosze" INTEGER,
    "zamowienieId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoWkladDrzewa_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EcoWkladDrzewa_czesci_dodatnie" CHECK ("czesci" > 0)
);

-- CreateTable
CREATE TABLE "EcoZamowienieSadzenia" (
    "id" TEXT NOT NULL,
    "rodzaj" "EcoSadzenieRodzaj" NOT NULL,
    "userId" TEXT,
    "liczbaDrzew" INTEGER NOT NULL,
    "status" "EcoSadzenieStatus" NOT NULL DEFAULT 'OCZEKUJE',
    "proby" INTEGER NOT NULL DEFAULT 0,
    "nastepnaProbaPo" TIMESTAMP(3),
    "ostatniBlad" TEXT,
    "nazwaNaCertyfikacie" VARCHAR(120) NOT NULL,
    "tekstCertyfikatu" VARCHAR(300),
    "kosztDrzewaGrosze" INTEGER NOT NULL,
    "punktyWydane" INTEGER,
    "srodowisko" VARCHAR(16) NOT NULL,
    "orderId" INTEGER,
    "certificateUrl" TEXT,
    "certificateImageUrl" TEXT,
    "wyslaneAt" TIMESTAMP(3),
    "posadzoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcoZamowienieSadzenia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EcoZamowienieSadzenia_liczba_dodatnia" CHECK ("liczbaDrzew" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "EcoWkladDrzewa_referenceId_key" ON "EcoWkladDrzewa"("referenceId");

-- CreateIndex
CREATE INDEX "EcoWkladDrzewa_zamowienieId_createdAt_idx" ON "EcoWkladDrzewa"("zamowienieId", "createdAt");

-- CreateIndex
CREATE INDEX "EcoWkladDrzewa_userId_createdAt_idx" ON "EcoWkladDrzewa"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EcoZamowienieSadzenia_srodowisko_orderId_key" ON "EcoZamowienieSadzenia"("srodowisko", "orderId");

-- CreateIndex
CREATE INDEX "EcoZamowienieSadzenia_status_nastepnaProbaPo_idx" ON "EcoZamowienieSadzenia"("status", "nastepnaProbaPo");

-- CreateIndex
CREATE INDEX "EcoZamowienieSadzenia_userId_status_idx" ON "EcoZamowienieSadzenia"("userId", "status");

-- AddForeignKey
ALTER TABLE "EcoWkladDrzewa" ADD CONSTRAINT "EcoWkladDrzewa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcoWkladDrzewa" ADD CONSTRAINT "EcoWkladDrzewa_zamowienieId_fkey" FOREIGN KEY ("zamowienieId") REFERENCES "EcoZamowienieSadzenia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcoZamowienieSadzenia" ADD CONSTRAINT "EcoZamowienieSadzenia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
