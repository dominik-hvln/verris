# audyt/ — źródło prawdy o stanie produktu

Ten katalog trzyma **dane**. Wszystko, co widzisz w `audyt-parytetu-2026-08/` i `plan-startowy-2026-08/`, jest z nich generowane. XLSX-y i dashboardy to **widoki** — ręczna zmiana w nich zniknie przy następnym uruchomieniu generatora.

```
audyt/dane/*.csv     →  audyt/generate.py  →  audyt-parytetu-2026-08/   (macierz XLSX, dashboard luk)
                                            →  plan-startowy-2026-08/   (backlog XLSX, plan MD, dashboard planu)
```

Jedyny wyjątek: **raport audytu** (`VERRIS_AUDYT_PARYTETU_2026-08.md`) jest pisany ręcznie. To narracja z wnioskami, nie zestawienie danych — generowanie jej mijałoby się z celem.

## Uruchomienie

```bash
pip install openpyxl            # jednorazowo
python3 audyt/generate.py       # zbuduj wszystko
```

Dwa tryby pomocnicze:

```bash
python3 audyt/generate.py --sprawdz   # walidacja spójności, nic nie zapisuje
python3 audyt/generate.py --status    # ile blokerów, gdzie stoją, ile godzin zostało
```

`--sprawdz` uruchamiaj **przed** commitem zmian w `dane/`. Wyłapuje: niedozwolone wartości w kolumnach, bloker bez przypisanego sprintu, odwołanie do nieistniejącego ID, przeciążony sprint, `POZA ZAKRESEM` bez uzasadnienia oraz stan `DZIAŁA` bez dowodu `plik:linia`. Ostatnie dwie reguły istnieją, bo dokładnie te dwa błędy audyt znalazł w samym sobie.

## Pliki danych

| Plik | Co trzyma |
|---|---|
| `dane/macierz.csv` | 352 pozycje funkcjonalne — stan, dowód, werdykt, krytyczność. **To jest źródło prawdy o produkcie.** |
| `dane/sprinty.csv` | 19 sprintów: cel, przypisane pozycje, ryzyko |
| `dane/zadania_pb.csv` | 13 zadań spoza audytu (marketing, legal, ops, unit economics) |
| `dane/epiki.csv` | 16 epików roadmapy po starcie |
| `dane/fazy.csv` | 4 fazy grupujące sprinty |
| `dane/konfiguracja.json` | pojemność sprintu, data startu, słownik kategorii, definicje ukończenia wg stanu, zależności między zadaniami |

### Zapis pozycji w `sprinty.csv`

Kolumna `pozycje_audytu` to lista ID rozdzielona średnikiem. Pozycja rozbita na dwa sprinty ma zapis `ID:godziny`:

```
Z-01:30          → sprint 4, 30 z 40 godzin
Z-01:10;M-17     → sprint 5, reszta Z-01 plus całe M-17
```

Bez dwukropka brany jest pełny nakład z kolumny `Nakład` w macierzy (`S`=6 h, `M`=16 h, `L`=40 h).

## Słowniki wartości

Walidator odrzuci wszystko spoza tych zbiorów.

**Stan w kodzie** — `DZIAŁA` · `CZĘŚCIOWE` · `FLAGA` · `ATRAPA` · `ENDPOINT BEZ UI` · `BRAK` · `b.d.`

Rozróżnienie, które w tym projekcie okazało się kosztowne: **ATRAPA** to UI wołające trasę, której nie rejestruje żaden kontroler (klik → 404). **ENDPOINT BEZ UI** to działający backend, którego żaden panel nie wywołuje. Pierwsze to dług, drugie to zwykle kilka godzin do odzyskania gotowej funkcji.

**Werdykt** — `PARYTET` · `PRZEWAGA` · `CZĘŚCIOWY` · `LUKA` · `POZA ZAKRESEM`

Liczony wobec kolumny **Rynek PL**, nie wobec sumy możliwości cPanela, Pleska i DirectAdmina. `PRZEWAGA` tylko wtedy, gdy mediana rynku tego nie ma — nie dlatego, że zrobiliśmy coś dobrze.

**Krytyczność** — `BLOKER STARTU` · `WYSOKA` · `ŚREDNIA` · `NISKA` · `—`

Bloker spełnia co najmniej jeden warunek: utrata danych klienta bez ścieżki odtworzenia, niezgodność z prawem, brak możliwości wystawienia poprawnego dokumentu księgowego, brak możliwości zatrzymania szkody przez operatora. **Liczba blokerów jest jedyną liczbą, na podstawie której podejmuje się decyzję o starcie.**

## Skala dowodu

| Poziom | Znaczenie |
|---|---|
| D0 | zapisane w dokumencie |
| D1 | istnieje kod |
| **D2** | **test przechodzi w CI** |
| D3 | zaobserwowane na produkcji z timestampem |
| D4 | powtarzalna procedura z właścicielem i datą wykonania |

Nic poniżej D2 nie jest „zrobione". Pieniądze, dane klienta i dostęp → D3. Backupy i DR → wyłącznie D4. Dokument starszy niż 30 dni traci status dowodu i wraca do D0.

## Rytm pracy

1. W trakcie sprintu edytujesz **kolumnę Status** w `plan-startowy-2026-08/VERRIS_BACKLOG_STARTOWY.xlsx`.
2. Na koniec sprintu aktualizujesz `dane/macierz.csv` — stan, dowód `plik:linia`, uwagi, werdykt, krytyczność.
3. `python3 audyt/generate.py --sprawdz`, potem `python3 audyt/generate.py`.
4. Commit obejmuje **i dane, i przebudowane widoki** — inaczej rozjadą się przy pierwszym `git pull`.

Pełna procedura z listą przypadków, w których pozycja **nie** zasługuje na `DZIAŁA`: `plan-startowy-2026-08/AKTUALIZACJA_AUDYTU.md`.

## Dlaczego dane leżą w CSV, a nie w XLSX

Bo `git diff` na CSV pokazuje, co dokładnie zmieniło się między sprintami — kto, kiedy i na jakiej podstawie przestawił pozycję na `DZIAŁA`. Na pliku binarnym diff nie pokazuje nic, a to właśnie ten brak śladu pozwolił wcześniej nadawać statusy bez pokrycia.
