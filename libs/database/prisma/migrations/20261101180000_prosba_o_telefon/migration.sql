-- 1.11 — pas „Wolisz porozmawiać?” na verris.pl: prośba o telefon zwrotny (imię, numer, pora dnia), bez adresu e-mail.
-- Addytywna i idempotentna — „migrate deploy, potem kod” bezpieczne (stary kod zawsze zapisuje email).
ALTER TYPE "SiteLeadKind" ADD VALUE IF NOT EXISTS 'CALLBACK';
ALTER TABLE "SiteLead" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "preferredTime" TEXT;
