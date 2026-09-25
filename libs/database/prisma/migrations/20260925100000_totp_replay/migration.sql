-- Ochrona przed ponownym użyciem kodu TOTP: zapamiętany krok ostatnio przyjętego kodu.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorLastStep" INTEGER;
