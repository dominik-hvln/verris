-- P-6 — per-account PHP version (CloudLinux PHP Selector via PHP_APPLY node task).

ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'PHP_APPLY';

ALTER TABLE "Account"
  ADD COLUMN "phpVersion"   TEXT,
  ADD COLUMN "phpAppliedAt" TIMESTAMP(3);
