-- Domena konta unikalna tylko wśród kont nieusuniętych: usunięte konto (DELETED) nie blokuje
-- ponownego założenia usługi na tę samą domenę (np. klient wraca albo węzeł wycofano).
DROP INDEX IF EXISTS "Account_domain_key";
CREATE UNIQUE INDEX "Account_domain_aktywne_key" ON "Account"("domain") WHERE "status" <> 'DELETED';
CREATE INDEX IF NOT EXISTS "Account_domain_idx" ON "Account"("domain");
