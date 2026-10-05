-- O-07 — narzut resellera doliczany do ceny klienta; część narzutu to prowizja resellera.
ALTER TABLE "Subscription" ADD COLUMN "resellerMarkupPct" INTEGER;
ALTER TYPE "PartnerCommissionKind" ADD VALUE IF NOT EXISTS 'RESELLER_MARKUP';
