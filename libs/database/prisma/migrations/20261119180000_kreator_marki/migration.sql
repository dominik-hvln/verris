-- Paczka 131 (19.11.2026) – Kreator marki, faza 2: marki konta (KreatorMarka, dane = brief/Marka JSON), serie kierunków,
-- rejestr wydanych znaków (odciski zostają po usunięciu marki/konta bez powiązań – unikalność w obrębie Verris),
-- wgrane pliki logo (oryginał w magazynie obiektów), zużycie AI w miesiącu i zakupy jednorazowe (Pakiet, druga marka).

-- CreateEnum
CREATE TYPE "KreatorMarkaZakupRodzaj" AS ENUM ('PAKIET', 'DRUGA_MARKA');

-- CreateEnum
CREATE TYPE "KreatorMarkaZakupStatus" AS ENUM ('OCZEKUJE', 'OPLACONY', 'ANULOWANY');

-- CreateTable
CREATE TABLE "KreatorMarka" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nazwa" TEXT NOT NULL,
    "zrodlo" TEXT NOT NULL,
    "etap" TEXT NOT NULL,
    "wersja" INTEGER NOT NULL DEFAULT 1,
    "dane" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KreatorMarka_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KreatorMarkaSeria" (
    "id" TEXT NOT NULL,
    "markaId" TEXT NOT NULL,
    "rodzaj" TEXT NOT NULL,
    "kierunki" JSONB NOT NULL,
    "strategia" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KreatorMarkaSeria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KreatorMarkaOdcisk" (
    "id" TEXT NOT NULL,
    "markaId" TEXT,
    "userId" TEXT,
    "branzaKlucz" TEXT NOT NULL,
    "rodzina" TEXT NOT NULL,
    "odciskParametrow" TEXT,
    "pHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KreatorMarkaOdcisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KreatorMarkaPlik" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "markaId" TEXT,
    "typ" TEXT NOT NULL,
    "bajty" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "klucz" TEXT NOT NULL,
    "kluczPodgladu" TEXT,
    "oswiadczenieAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KreatorMarkaPlik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KreatorMarkaZuzycie" (
    "userId" TEXT NOT NULL,
    "miesiac" TEXT NOT NULL,
    "serie" INTEGER NOT NULL DEFAULT 0,
    "zmianyAi" INTEGER NOT NULL DEFAULT 0,
    "wejTokeny" INTEGER NOT NULL DEFAULT 0,
    "wyjTokeny" INTEGER NOT NULL DEFAULT 0,
    "cacheZapis" INTEGER NOT NULL DEFAULT 0,
    "cacheOdczyt" INTEGER NOT NULL DEFAULT 0,
    "kosztUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KreatorMarkaZuzycie_pkey" PRIMARY KEY ("userId","miesiac")
);

-- CreateTable
CREATE TABLE "KreatorMarkaZakup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rodzaj" "KreatorMarkaZakupRodzaj" NOT NULL,
    "status" "KreatorMarkaZakupStatus" NOT NULL DEFAULT 'OCZEKUJE',
    "metoda" TEXT NOT NULL,
    "kwotaBrutto" DECIMAL(10,2) NOT NULL,
    "walletTxId" TEXT,
    "zgodaTresciCyfrowejAt" TIMESTAMP(3) NOT NULL,
    "serie" INTEGER NOT NULL DEFAULT 0,
    "zmianyAi" INTEGER NOT NULL DEFAULT 0,
    "serieUzyte" INTEGER NOT NULL DEFAULT 0,
    "zmianyAiUzyte" INTEGER NOT NULL DEFAULT 0,
    "aktualizacjeDo" TIMESTAMP(3),
    "oplaconoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KreatorMarkaZakup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KreatorMarka_userId_updatedAt_idx" ON "KreatorMarka"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "KreatorMarkaSeria_markaId_createdAt_idx" ON "KreatorMarkaSeria"("markaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KreatorMarkaOdcisk_markaId_key" ON "KreatorMarkaOdcisk"("markaId");

-- CreateIndex
CREATE INDEX "KreatorMarkaOdcisk_branzaKlucz_createdAt_idx" ON "KreatorMarkaOdcisk"("branzaKlucz", "createdAt");

-- CreateIndex
CREATE INDEX "KreatorMarkaPlik_userId_createdAt_idx" ON "KreatorMarkaPlik"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KreatorMarkaPlik_markaId_idx" ON "KreatorMarkaPlik"("markaId");

-- CreateIndex
CREATE UNIQUE INDEX "KreatorMarkaZakup_walletTxId_key" ON "KreatorMarkaZakup"("walletTxId");

-- CreateIndex
CREATE INDEX "KreatorMarkaZakup_userId_rodzaj_status_idx" ON "KreatorMarkaZakup"("userId", "rodzaj", "status");

-- AddForeignKey
ALTER TABLE "KreatorMarka" ADD CONSTRAINT "KreatorMarka_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorMarkaSeria" ADD CONSTRAINT "KreatorMarkaSeria_markaId_fkey" FOREIGN KEY ("markaId") REFERENCES "KreatorMarka"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorMarkaOdcisk" ADD CONSTRAINT "KreatorMarkaOdcisk_markaId_fkey" FOREIGN KEY ("markaId") REFERENCES "KreatorMarka"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorMarkaOdcisk" ADD CONSTRAINT "KreatorMarkaOdcisk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorMarkaPlik" ADD CONSTRAINT "KreatorMarkaPlik_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorMarkaPlik" ADD CONSTRAINT "KreatorMarkaPlik_markaId_fkey" FOREIGN KEY ("markaId") REFERENCES "KreatorMarka"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorMarkaZuzycie" ADD CONSTRAINT "KreatorMarkaZuzycie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorMarkaZakup" ADD CONSTRAINT "KreatorMarkaZakup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

