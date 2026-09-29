-- Retencja kont (29.09.2026) — usunięte konto (status DELETED) nie trzyma już domeny: Account.domain
-- jest unikalne, więc klient wracający z tą samą domeną nie mógł założyć hostingu. Kod od teraz zwalnia
-- domenę przy oznaczaniu DELETED (zwolnionaDomena w account-deletion.service.ts); tu te same zmiany dla
-- kont usuniętych wcześniej. Format identyczny: "<domena>~usuniete-<id konta>" — `~` nie występuje w nazwach
-- DNS, id gwarantuje unikalność, a początek napisu to wciąż oryginalna domena (odwracalne).
UPDATE "Account"
SET "domain" = "domain" || '~usuniete-' || "id"
WHERE "status" = 'DELETED' AND position('~' in "domain") = 0;
