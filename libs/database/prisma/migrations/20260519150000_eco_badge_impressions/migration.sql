-- AlterTable
ALTER TABLE "User" ADD COLUMN "ecoBadgeImpressions" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EcoBadgeImpressionDedup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoBadgeImpressionDedup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EcoBadgeImpressionDedup_bucketKey_key" ON "EcoBadgeImpressionDedup"("bucketKey");

-- CreateIndex
CREATE INDEX "EcoBadgeImpressionDedup_userId_idx" ON "EcoBadgeImpressionDedup"("userId");

-- AddForeignKey
ALTER TABLE "EcoBadgeImpressionDedup" ADD CONSTRAINT "EcoBadgeImpressionDedup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
