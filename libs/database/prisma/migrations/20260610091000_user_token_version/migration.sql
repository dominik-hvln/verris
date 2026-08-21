-- C3: token version for "logout all devices" / forced session invalidation.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
