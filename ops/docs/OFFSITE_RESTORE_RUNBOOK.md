# Runbook — self-restore konta z kopii off-site (S-1 / Disaster Recovery)

Uzupełnia self-restore z kopii **lokalnych** DA (dostępny w panelu klienta:
usługa → zakładka Backups) o ścieżkę odtwarzania **po awarii/utracie węzła**,
z niezależnego storage off-site (RODO art. 32 — zdolność przywrócenia dostępności).

## Warstwy backupu (przypomnienie)
1. **DA lokalne** (`/home/<user>/backups`) — codzienne, self-restore z panelu. Giną z węzłem.
2. **Off-site** (rclone → S3/B2/R2 w innym DC, WORM) — `node-offsite-backup.sh` (timer dzienny).
3. **Control-plane DB** — `backup-postgres.sh` (szyfrowane age + off-site + restore-drill).

## Odtworzenie konta z off-site

Na węźle docelowym (ten sam lub nowy, z zainstalowanym DirectAdmin i `/etc/verris-backup.conf`):

```bash
# 1) Zobacz dostępne archiwa off-site dla konta:
ops/scripts/node-account-restore.sh list <user>
#    (wersja z konkretnego dnia:)
ops/scripts/node-account-restore.sh list <user> 20260703

# 2) Pobierz + przywróć wybrane archiwum w DirectAdmin:
ops/scripts/node-account-restore.sh restore <user> <archiwum.tar.gz>

# 3) Zweryfikuj w DA → Admin → Backup/Transfer (dataskq przetwarza w tle).
```

Sam pobór bez restore (np. do ręcznej inspekcji): `... fetch <user> <archiwum>`.

## Scenariusz „utrata węzła"
1. Postaw nowy węzeł (onboarding Verris) LUB użyj zapasowego.
2. Odtwórz konta z off-site skryptem powyżej (pętla po userach z raportu/panelu).
3. Przełącz DNS/rekordy na nowy węzeł.
4. Potwierdź działanie stron/poczty klientów.

## Test DR (zalecany cyklicznie, przed LIVE obowiązkowy)
- Wybierz konto testowe, wykonaj `restore` z off-site na węzeł staging.
- Potwierdź: pliki + baza + poczta odtworzone, strona działa.
- Udokumentuj datę i wynik (jak restore-drill DB w `backup-verify.sh`).

## Roadmapa (self-service z panelu)
Obecnie restore z off-site jest operacją ops (skrypt). Pełne self-service z panelu
klienta wymaga: modelu zadań restore (async), typu zadania węzła „offsite-restore"
oraz UI wyboru archiwum. To kolejny, wydzielony krok — warstwa DR jest już domknięta
na poziomie węzła/ops (utrata węzła ≠ utrata danych).
