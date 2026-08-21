-- B2: ModSecurity WAF per-account mode.
ALTER TYPE "NodeTaskKind" ADD VALUE 'WAF_APPLY';

CREATE TYPE "WafMode" AS ENUM ('OFF', 'DETECTION', 'ON');

ALTER TABLE "Account" ADD COLUMN "wafMode" "WafMode" NOT NULL DEFAULT 'DETECTION';
ALTER TABLE "Account" ADD COLUMN "wafAppliedAt" TIMESTAMP(3);
