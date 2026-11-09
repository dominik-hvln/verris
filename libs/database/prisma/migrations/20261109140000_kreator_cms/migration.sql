-- Paczka 124 (9.11.2026) – Verris Kreator: przejście strony na WordPressa na hostingu klienta.
-- Nowy rodzaj zadania węzła (node-kreator-wp.sh: podgląd, zamiana, cofnięcie) i stan przejścia strony.

-- AlterEnum
ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'KREATOR_WP';

-- CreateEnum
CREATE TYPE "KreatorCmsStan" AS ENUM ('PODGLAD_W_TOKU', 'PODGLAD', 'ZAMIANA_W_TOKU', 'PRZENIESIONA', 'COFANIE_W_TOKU', 'COFNIETA', 'BLAD');

-- CreateTable
CREATE TABLE "KreatorCms" (
    "id" TEXT NOT NULL,
    "stronaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cel" TEXT NOT NULL,
    "stan" "KreatorCmsStan" NOT NULL,
    "domena" TEXT NOT NULL,
    "subskrypcjaId" TEXT NOT NULL,
    "katalog" TEXT NOT NULL,
    "klucz" TEXT NOT NULL,
    "zadanieId" TEXT,
    "bazaNazwa" TEXT,
    "bazaUzytkownik" TEXT,
    "adminLogin" TEXT,
    "kopia" TEXT,
    "kopiaWp" TEXT,
    "blad" TEXT,
    "bladEtap" TEXT,
    "podgladAt" TIMESTAMP(3),
    "przeniesionaAt" TIMESTAMP(3),
    "cofnietaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KreatorCms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KreatorCms_stronaId_key" ON "KreatorCms"("stronaId");

-- CreateIndex
CREATE INDEX "KreatorCms_userId_idx" ON "KreatorCms"("userId");

-- AddForeignKey
ALTER TABLE "KreatorCms" ADD CONSTRAINT "KreatorCms_stronaId_fkey" FOREIGN KEY ("stronaId") REFERENCES "KreatorStrona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
