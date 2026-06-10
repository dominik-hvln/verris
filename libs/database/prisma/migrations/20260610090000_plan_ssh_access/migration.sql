-- B6: per-plan SSH/Git shell access (CageFS-jailed), off by default.
ALTER TABLE "Plan" ADD COLUMN "sshAccess" BOOLEAN NOT NULL DEFAULT false;
