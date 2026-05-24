-- CreateEnum
CREATE TYPE "UserAuthTokenPurpose" AS ENUM ('PASSWORD_RESET');

-- CreateTable
CREATE TABLE "UserAuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "UserAuthTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAuthToken_tokenHash_key" ON "UserAuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserAuthToken_userId_purpose_idx" ON "UserAuthToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "UserAuthToken_expiresAt_idx" ON "UserAuthToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserAuthToken" ADD CONSTRAINT "UserAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
