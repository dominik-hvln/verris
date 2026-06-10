-- Audit F-07: node security-hardening status reported by the verris-lve agent
-- (marker /etc/verris-hardened from security-hardening-baseline.sh).
ALTER TABLE "Server" ADD COLUMN "hardenedEnabled" BOOLEAN;
ALTER TABLE "Server" ADD COLUMN "hardenedCheckedAt" TIMESTAMP(3);
