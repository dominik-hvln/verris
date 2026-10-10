-- F3.1 (11.10) — dobowy limit wysyłki konta ustawiony przez obsługę, potwierdzony przez węzeł. NULL = domyślny serwera.
-- Addytywna i idempotentna; stary kod kolumny nie czyta.

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "mailSendLimit" INTEGER;
