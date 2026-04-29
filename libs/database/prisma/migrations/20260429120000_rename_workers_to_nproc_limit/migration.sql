-- Rename legacy "workers" columns to explicit CloudLinux NPROC naming.
ALTER TABLE "Plan" RENAME COLUMN "workers" TO "nprocLimit";
ALTER TABLE "Account" RENAME COLUMN "workers" TO "nprocLimit";
