-- A4: WordPress installer as a per-account node task.
ALTER TYPE "NodeTaskKind" ADD VALUE 'WP_INSTALL';
ALTER TABLE "NodeTask" ADD COLUMN "accountId" TEXT;
