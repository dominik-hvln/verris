-- Passkey enforcement for privileged accounts (ADMIN/STAFF).
--
-- After a privileged user registers + uses their first passkey we set
-- `passkeyEnforcedAt`; from then on the password-only login path is rejected
-- for that account (must use passkey, or the audited break-glass fallback).
--
-- Break-glass codes are single-use, stored as a SHA-256 set inside an
-- AES-256-GCM envelope (same scheme as 2FA recovery codes). Using one
-- e-mails every ADMIN and writes an audit entry.

ALTER TABLE "User"
  ADD COLUMN "passkeyEnforcedAt"          TIMESTAMP(3),
  ADD COLUMN "staffBreakGlassCodesEnc"    TEXT,
  ADD COLUMN "staffBreakGlassGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "staffBreakGlassUsedAt"      TIMESTAMP(3);
