-- F3.1 (D4, 10.10) — blokada wysyłki poczty konta przez obsługę (stan: kto, kiedy, powód) i zadanie węzła
-- MAIL_QUEUE (kolejka exima). Idempotentna; nowa wartość enumu nie jest używana w tej samej transakcji.

ALTER TYPE "NodeTaskKind" ADD VALUE IF NOT EXISTS 'MAIL_QUEUE';

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "mailBlockedAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "mailBlockedById" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "mailBlockedReason" TEXT;
