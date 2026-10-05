-- A-14 — ukrycie danych abonenta w WHOIS (WHOIS privacy protection u OpenProvidera).
-- Stan usługi na domenie + osobny typ zamówienia (opłata z portfela, zwrot przy błędzie rejestratora).
ALTER TABLE "Domain" ADD COLUMN "whoisPrivacy" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "DomainRegistrarOrderType" ADD VALUE IF NOT EXISTS 'WHOIS_PRIVACY';
