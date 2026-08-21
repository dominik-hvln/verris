-- Audit F-04: verify DA API TLS certificates by default.
-- Existing nodes that already have DA configured keep working (self-signed
-- certs were the previous implicit behaviour) — the admin panel + node audit
-- will flag them until a proper certificate is deployed on :2222.
ALTER TABLE "Server" ADD COLUMN "daAllowInvalidCert" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Server" SET "daAllowInvalidCert" = true WHERE "daPasswordEnc" IS NOT NULL;
