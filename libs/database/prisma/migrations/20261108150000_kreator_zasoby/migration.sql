-- Paczka 122 (8.11.2026) – Verris Kreator: zdjęcia w bibliotece konta. Wgrane przez klienta albo zaimportowane
-- z bibliotek zewnętrznych (Pixabay, Openverse, Pexels) – plik zawsze w magazynie Verris (nigdy hotlink),
-- z autorem i licencją. Pliki w magazynie obiektów (oryginał znormalizowany + warianty webp/jpg); tu metadane,
-- rozmiar do limitu miejsca na konto i skrót sha256.

-- CreateEnum
CREATE TYPE "KreatorZrodloZasobu" AS ENUM ('WLASNE', 'PIXABAY', 'OPENVERSE', 'PEXELS', 'AI');

-- CreateTable
CREATE TABLE "KreatorZasob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stronaId" TEXT,
    "zrodlo" "KreatorZrodloZasobu" NOT NULL,
    "autor" TEXT,
    "licencja" TEXT,
    "licencjaUrl" TEXT,
    "zrodloUrl" TEXT,
    "szerokosc" INTEGER NOT NULL,
    "wysokosc" INTEGER NOT NULL,
    "bajty" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "alt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KreatorZasob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KreatorZasob_userId_createdAt_idx" ON "KreatorZasob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KreatorZasob_stronaId_idx" ON "KreatorZasob"("stronaId");

-- AddForeignKey
ALTER TABLE "KreatorZasob" ADD CONSTRAINT "KreatorZasob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreatorZasob" ADD CONSTRAINT "KreatorZasob_stronaId_fkey" FOREIGN KEY ("stronaId") REFERENCES "KreatorStrona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
