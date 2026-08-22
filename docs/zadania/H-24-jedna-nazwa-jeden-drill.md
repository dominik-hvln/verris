# `H-24` — Dwa skrypty do jednego zadania i jedna nazwa w czterech miejscach

| | |
|---|---|
| **Sprint** | 2 — poza planem, znalezione przy `H-20` |
| **Priorytet** | KRYTYCZNY (dotyczy warstwy DR) |
| **Nakład** | S (~3 h) |
| **Zależy od** | `H-23` |
| **Status** | zamknięte |
| **Data** | 2026-08-22 |

---

## Jak to wyszło

Pierwsze prawdziwe uruchomienie drilla odtworzeniowego z `H-20`:

```
mc: <ERROR> Unable to stat `verris/verris-backups/postgres/latest.sql.gz`.
            Object does not exist.
```

Pierwsza reakcja była taka, że nie ma kopii — i to okazało się prawdą (`H-23`).
Ale przy szukaniu, jak naprawić drill, wyszło coś osobnego i gorszego.

## Dwa skrypty do jednego zadania

| | `ops/backup-verify.sh` | `ops/scripts/restore-drill-isolated.sh` |
|---|---|---|
| nazwa obiektu | `latest.sql.gz.age` ✓ | `latest.sql.gz` ✗ |
| weryfikacja SHA-256 | jest ✓ | brak ✗ |
| deszyfrowanie age | jest ✓ | brak ✗ |
| odtworzenie do osobnej bazy | jest ✓ | jest ✓ |
| sprawdzane tabele | 2 | 5 ✓ |
| ślad w bazie, właściciel, czas | brak ✗ | jest ✓ |
| **wołany przez cokolwiek** | **NIE** | tak |

`backup-verify.sh` robił wszystko poprawnie i **nie wołał go nikt**. Jedyne wystąpienia nazwy tego
pliku w całym repozytorium to jego własny nagłówek — żaden cron, runbook ani dokument.

Obok stał drugi skrypt: z błędną nazwą obiektu, bez sumy kontrolnej, bez deszyfrowania — za to
wpięty w runbook, w mail przypominający do administratora i w bramkę gotowości do startu.

**Utwardzanie `H-20` poszło w tę drugą kopię.** Dołożyłem progi wierszy na pięciu tabelach, tabelę
`RestoreDrill`, właściciela, pomiar czasu i blokującą pozycję w `live-readiness` — przykręcając to
wszystko do skryptu, który nie mógł zadziałać, stojąc obok skryptu, który potrafił odtworzyć backup,
tylko nie zostawiał po sobie śladu.

To moja pomyłka, na pozycji, której całym sensem było sprawdzenie, czy naprawdę potrafimy odtworzyć
bazę. Rodzina „bliźniaczych miejsc" — `Z-12`, `Z-16`, `M-06`, `X-24` — tym razem najdroższa, bo
dotyczyła warstwy DR.

Testy `H-20` tego nie złapały, bo sprawdzały, czy skrypt **mówi** właściwe rzeczy: czy ma `MIN_ROWS`,
czy zapisuje ślad, czy wymaga właściciela. Żaden nie sprawdzał, czy sięga po obiekt, który naprawdę
istnieje. Strażnik czytający tekst pliku potwierdza kształt, nie kontakt z rzeczywistością.

## Jedna nazwa w czterech miejscach

`latest.sql.gz` było wpisane osobno w drillu, w `prod-health-snapshot.sh`, w `restore-postgres.sh`
i w metryce Prometheusa. Backup wysyła `latest.sql.gz.age`, bo szyfrowanie jest w produkcji
obowiązkowe — więc trzy z czterech pytały o obiekt, którego produkcja nigdy nie tworzy.

**Precyzyjnie o skutku, bo łatwo tu przesadzić.** W sierpniu 2026 metryka pokazywała zero **zgodnie
z prawdą** — kopii nie było w ogóle. Zła nazwa nie ukryła tamtej awarii.

Ukryłaby następną. Po naprawie kopii metryka nadal czytałaby nieistniejący obiekt i zostałaby na
zerze; alert `VerrisPostgresBackupStale` krzyczałby bez końca przy działających kopiach — a wtedy
ktoś by go wyciszył. Alarm, który kłamie, kończy tak samo jak alarm, którego nie ma.

## Co jest teraz

**Jedno źródło nazwy.** `backup_crypto_latest_object()` w `ops/lib/backup-crypto.sh`, tuż obok
`backup_crypto_enabled()` — żeby odpowiedź na „czy `.age`" brała się z tego samego miejsca co decyzja
o szyfrowaniu, a nie z drugiego wpisu, który można zapomnieć.

TypeScript nie zaimportuje funkcji basha, więc stała `OBIEKT_KOPII_LATEST` jest **wiązana testem**
czytającym oba pliki naraz. Ta sama technika co przy `X-24` (ścieżki panelu vs trasy API) i `Z-03`.

**Jeden drill.** `ops/backup-verify.sh` usunięty; jego mechanika — nazwa obiektu, weryfikacja
SHA-256, deszyfrowanie age — przeniesiona do `restore-drill-isolated.sh`, który zachował swoje:
progi na pięciu tabelach, ślad w `RestoreDrill`, właściciela i pomiar czasu.

Weryfikacja sumy kontrolnej nie jest ozdobą: bez niej drill dowodziłby, że da się odtworzyć **to, co
pobrał** — a nie to, co zapisała kopia.

## Testy

| Warstwa | Plik | Ile |
|---|---|---|
| jednostkowe | `apps/api/src/test/nazwa-obiektu-kopii.spec.ts` | 12 |

**Czy czerwienią się na starym kodzie?** Tak — **4 z 12**: zaszyta nazwa w TS, brak sumy kontrolnej
w drillu, brak deszyfrowania, obecność drugiego skryptu.

## Czego to nie robi

- **Nie odpowiada, dlaczego krytyczny alert nie dotarł do nikogo przez miesiąc.** Reguła
  `VerrisPostgresBackupStale` istnieje, ma `severity: critical` i poprawny warunek. To konfiguracja
  Alertmanagera — poza kodem repozytorium.
- **Nie dokłada sprawdzenia świeżości kopii do gotowości do startu.** Łańcuch, który już istnieje,
  wystarcza: gdy kopie przestaną się wykonywać, następny drill padnie, wpis w `RestoreDrill` będzie
  `FAILED`, bramka `restore_drill` zapali się na czerwono i pójdzie mail. Dokładanie trzeciego
  mechanizmu obok dwóch działających byłoby powtórzeniem błędu, który ta pozycja naprawia.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `H-23` | to przez tę pozycję kopia była nieweryfikowalna nawet po naprawie |
| `H-20` | drill może wreszcie zadziałać; sama pozycja czeka na wykonanie |
| `Z-12`, `Z-16`, `M-06`, `X-24` | ta sama rodzina: dwie kopie jednej reguły |

## Dowód po

- `ops/lib/backup-crypto.sh` — `backup_crypto_latest_object()`
- `ops/scripts/restore-drill-isolated.sh` — suma kontrolna + deszyfrowanie
- `ops/scripts/prod-health-snapshot.sh`, `ops/restore-postgres.sh` — nazwa z biblioteki
- `apps/api/src/storage/object-storage.service.ts` — `OBIEKT_KOPII_LATEST`
- usunięty `ops/backup-verify.sh`
- `apps/api/src/test/nazwa-obiektu-kopii.spec.ts` — 12 testów

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

D3 powstanie przy pierwszym udanym drillu na produkcji — czyli razem z `H-20`.

**Stan w macierzy:** `DZIAŁA` / `PARYTET`
