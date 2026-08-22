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

## Test DR — procedura obowiązkowa (H-20)

**Właściciel procedury:** Dominik Kowalski (dominik@hvln.pl)
**Częstotliwość:** co najmniej raz na **30 dni**, obowiązkowo przed startem sprzedaży
**Poziom dowodu:** D4 — data, wynik i właściciel zapisane w bazie, nie w czyjejś pamięci

### Dlaczego to jest bramka, a nie zalecenie

Do 2026-08-22 ta sekcja brzmiała „zalecany cyklicznie, przed LIVE obowiązkowy" i nie było
w repozytorium **żadnego śladu**, że drill kiedykolwiek się odbył. Procedura bez zapisu
wykonania nie liczy się wcale: „mamy skrypt" i „potrafimy odtworzyć bazę" to dwa różne zdania,
a odróżnia je wyłącznie fakt, że ktoś ten skrypt uruchomił.

Od tej pory brak aktualnej próby **zatrzymuje start sprzedaży** — pozycja `Próba odtworzenia
z kopii (D4)` w gotowości do startu jest blokująca, nie ostrzegawcza.

### Jak wykonać (baza control-plane)

```bash
cd /opt/verris
./ops/scripts/restore-drill-isolated.sh --owner "Imię Nazwisko"
```

Skrypt:

1. pobiera kopię z MinIO i odtwarza ją do **osobnej** bazy (`verris_restore_drill`) —
   produkcyjna nie jest dotykana, jest na to twarde sprawdzenie na starcie;
2. liczy wiersze w tabelach kontrolnych (`User`, `Plan`, `Subscription`, `Invoice`, `Account`)
   i **przerywa z błędem**, gdy któraś nie ma minimum. `psql` kończy się kodem zero także
   wtedy, gdy wgrał pusty plik — dlatego liczby, a nie kod wyjścia;
3. mierzy czas trwania. **To jest realne RTO** i trzeba je znać przed awarią, nie w jej
   trakcie;
4. zapisuje wynik do tabeli `RestoreDrill` — **również przy niepowodzeniu**, bo brak wpisu nie
   może znaczyć jednocześnie „nigdy nie było" i „padło";
5. usuwa bazę drillową (`--keep-db` ją zostawia do obejrzenia).

### Jak sprawdzić wynik

- panel admina → **Gotowość do startu** → pozycja `Próba odtworzenia z kopii (D4)`,
- `GET /admin/live-readiness/proby-odtworzenia` — pełna historia z czasami i liczbami wierszy.

### Kiedy przypomni się samo

Codziennie o 08:30 job sprawdza stan. Mail do wszystkich administratorów idzie, gdy:

| Stan | Kiedy | Blokuje start |
|---|---|---|
| brak próby | zawsze | **tak** |
| ostatnia próba nieudana | zawsze | **tak** |
| ostatnia udana starsza niż 30 dni | zawsze | **tak** |
| do terminu ≤ 7 dni | przypomnienie | nie |
| próba aktualna | mail NIE idzie | nie |

Ostatni wiersz jest celowy: alert wysyłany codziennie także wtedy, gdy wszystko jest
w porządku, po tygodniu przestaje być czytany — a wtedy przestaje działać także ten,
który coś znaczy.

### Czego ten drill NIE sprawdza

- **Odtworzenia konta hostingowego** (pliki, poczta, bazy klienta) — to osobna ścieżka,
  opisana wyżej w tym runbooku, i nadal wymaga ręcznego przejścia.
- **Czasu odtworzenia na maszynie zastępczej** — drill biegnie na tym samym hoście, więc
  zmierzony czas jest dolnym oszacowaniem RTO, nie jego wartością.
- **Poprawności danych** ponad to, że tabele nie są puste. Odtworzenie z uszkodzonym,
  ale niepustym dumpem przejdzie.

## Roadmapa (self-service z panelu)
Obecnie restore z off-site jest operacją ops (skrypt). Pełne self-service z panelu
klienta wymaga: modelu zadań restore (async), typu zadania węzła „offsite-restore"
oraz UI wyboru archiwum. To kolejny, wydzielony krok — warstwa DR jest już domknięta
na poziomie węzła/ops (utrata węzła ≠ utrata danych).
