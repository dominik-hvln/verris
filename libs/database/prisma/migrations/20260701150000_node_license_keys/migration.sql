-- NODE-5 — zaszyfrowane klucze licencyjne wstrzykiwane do bootstrapu
-- (AES-256-GCM jak daPasswordEnc). Podawane przez admina w wizardzie.

ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "daLicenseKeyEnc" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "clActivationKeyEnc" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "lsSerialEnc" TEXT;
