-- Wiadomości systemowe węzła przekazywane klientowi (mail Verris + panel): ostatni przetworzony numer per konto.
ALTER TABLE "Account" ADD COLUMN "daMessageSeen" INTEGER;
