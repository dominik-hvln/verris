-- CloudLinux CageFS runtime status reported by the verris-lve node agent.
ALTER TABLE "Server" ADD COLUMN "cagefsEnabled" BOOLEAN;
ALTER TABLE "Server" ADD COLUMN "cagefsEnabledCount" INTEGER;
ALTER TABLE "Server" ADD COLUMN "cagefsCheckedAt" TIMESTAMP(3);
