# `H-20` — Próba odtworzenia z kopii: mechanizm gotowy, dowód wymaga jednego uruchomienia

| | |
|---|---|
| **Sprint** | 7 — Dowód odtworzenia |
| **Priorytet** | BLOKER STARTU (**nadal otwarty**) |
| **Nakład** | M (~16 h) |
| **Zależy od** | — |
| **Status** | mechanizm zamknięty (D2), pozycja czeka na **jedno uruchomienie** na produkcji |
| **Data** | 2026-08-22 |

---

## Dlaczego ta pozycja NIE jest zamknięta

Zrobiłem wszystko poza jedną rzeczą, której nie mogę zrobić za kogoś: **nikt nadal nie odtworzył
bazy z kopii**.

Reguła audytu jest jednoznaczna — backupy i DR wymagają poziomu **D4: data, wynik, właściciel**.
Mechanizm zapisujący datę, wynik i właściciela jest gotowy i przetestowany, ale zapis powstaje
dopiero wtedy, gdy ktoś uruchomi drill. Do tego czasu tabela jest pusta, a pusta tabela znaczy
dokładnie to, co znaczyła przed tą zmianą: **nie wiemy, czy potrafimy odtworzyć bazę.**

Oznaczenie tej pozycji jako `DZIAŁA` byłoby rozumowaniem, które ten projekt zakazał pod nazwą
„warunkowe GO": mamy narzędzie, więc uznajmy, że mamy wynik.

**Co się realnie zmieniło:** blokada przestała być notatką w runbooku, a stała się bramką
w kodzie. Wcześniej można było wystartować sprzedaż bez drilla i nikt by nie zauważył. Teraz
gotowość do startu zwraca `go: false`, dopóki próby nie ma.

## Jak zamknąć

Na control-plane, jedno polecenie:

```bash
cd /opt/verris && ./ops/scripts/restore-drill-isolated.sh --owner "Dominik Kowalski"
```

Skrypt sam zapisze wynik. Pozycja domknie się, gdy w panelu admina, w gotowości do startu,
`Próba odtworzenia z kopii (D4)` zaświeci na zielono.

---

## Co było

```
ops/scripts/restore-drill-isolated.sh   — istniał jako procedura ręczna
live-readiness.service.ts:175-177       — sprawdzał tylko, czy backup się WYKONAŁ
OFFSITE_RESTORE_RUNBOOK.md:37-40        — wymagał drilla przed LIVE
```

W repozytorium nie było **żadnego śladu**, że drill kiedykolwiek się odbył. Runbook wymagał,
kod nie sprawdzał, nikt nie zapisywał.

### Dwie ciche wady samego skryptu

**Liczył i nie sprawdzał.** Skrypt wykonywał `SELECT COUNT(*) FROM "User"` i wypisywał wynik
do logu — po czym i tak drukował `RESTORE DRILL OK`. `psql` kończy się kodem zero także wtedy,
gdy wgrał pusty plik, więc odtworzenie **niczego** meldowało sukces. To ta sama klasa co `X-14`:
kontrola istnieje, ale niczego nie bramkuje.

**Patrzył na jedną tabelę.** Sam `User` nie mówi nic o tym, czy przetrwały faktury
i subskrypcje — a to one bolą przy utracie.

## Co jest teraz

### Ślad wykonania (`RestoreDrill`)

Data rozpoczęcia i zakończenia, **czas trwania**, wynik, odtwarzany obiekt, źródło, liczby
wierszy w tabelach kontrolnych, **właściciel** i notatki.

Czas trwania nie jest ozdobą: to **realne RTO**, a jest to liczba, którą trzeba znać przed
awarią, a nie w jej trakcie.

Dwa ograniczenia `CHECK` w bazie:

- `durationSec > 0` — zero sekund to zapis, nie pomiar,
- `length(btrim(owner)) > 0` — D4 wymaga właściciela; pusty napis spełniałby `NOT NULL`
  i nie spełniałby reguły.

### Skrypt asertuje i zapisuje

Progi wierszy na pięciu tabelach (`User`, `Plan`, `Subscription`, `Invoice`, `Account`).
Odtworzenie bez danych **przerywa** z konkretnym komunikatem, zamiast meldować sukces.

Progi są celowo minimalne — chodzi o odróżnienie „są dane" od „nie ma nic", nie o pilnowanie
wielkości bazy. Próg równy realnej liczbie kont zacząłby czerwienić się przy pierwszym
usunięciu konta.

Zapis idzie do bazy **produkcyjnej**, nie drillowej (tamta zaraz znika), i powstaje
**również przy niepowodzeniu** — łącznie z pułapką `trap ... ERR` na przerwanie w połowie.
Brak wpisu nie może znaczyć jednocześnie „nigdy nie było" i „padło".

### Bramka, nie ostrzeżenie

`live-readiness` dostał pozycję `restore_drill` z `blocking: true`.

| Stan | Wynik | Blokuje start |
|---|---|---|
| brak jakiejkolwiek próby | `fail` | **tak** |
| ostatnia próba nieudana | `fail` | **tak** |
| ostatnia udana starsza niż 30 dni | `fail` | **tak** |
| do terminu ≤ 7 dni | `warn` | nie |
| próba aktualna | `ok` | nie |

**Ostatnia próba, nie ostatnia udana.** Gdyby ocena patrzyła tylko na udane, wczorajsza awaria
odtwarzania byłaby niewidoczna, a raport pokazywałby zieloną próbę sprzed dwóch tygodni.

**Dowód się starzeje.** Odtworzenie sprzed roku nie mówi nic o kopii zrobionej wczoraj —
schemat się zmienił, migracje doszły, format dumpa mógł się zmienić razem z wersją Postgresa.
Stąd trzydziestodniowy termin ważności.

Blokująca, a nie ostrzegawcza, bo ostrzeżenie zamiast bramki to trzecie wystąpienie tego samego
błędu w tym projekcie: macierz wytknęła je przy `H-19` („ostrzeżenie nie blokuje go-live —
dodać twardą bramkę"), naprawiałem je w `X-23` przy jobie bezpieczeństwa, i tu wracało.

### Przypomnienie, które nie zamęcza

Job codziennie o 08:30. Mail idzie **tylko** gdy jest co robić — stan „aktualna" nie generuje
niczego. Alert wysyłany codziennie także wtedy, gdy wszystko jest w porządku, po tygodniu
przestaje być czytany, a wtedy przestaje działać także ten, który coś znaczy.

### Runbook z właścicielem i częstotliwością

`OFFSITE_RESTORE_RUNBOOK.md` — sekcja „Test DR" przepisana: właściciel z imienia i adresu,
cykl 30 dni, opis co skrypt robi i **czego nie sprawdza**.

## Testy

| Warstwa | Plik | Ile |
|---|---|---|
| jednostkowe | `apps/api/src/admin-readiness/proba-odtworzenia.spec.ts` | 20 |
| integracyjne | `apps/api/test/integration/proba-odtworzenia.int-spec.ts` | 8 |

Wśród jednostkowych siedem strażników na sam skrypt: czy asertuje, czy zapisuje ślad, czy
zapisuje go też przy błędzie, czy mierzy czas, czy wymaga właściciela, czy nie dotyka bazy
produkcyjnej.

**Czy czerwienią się na starym kodzie?**

| Wersja | Czerwone |
|---|---|
| brak sprawdzenia w gotowości | 5 z 8 integracyjnych |
| sprawdzenie obecne, ale `blocking: false` | 3 z 8 |
| skrypt bez asercji progów | 4 z 20 jednostkowych |

### Test, który najpierw nic nie dowodził — po raz drugi

Pierwsza wersja testów integracyjnych sprawdzała `raport.go === false`. W środowisku testowym
brakuje kluczy, Stripe'a i dokumentów prawnych, więc `go` jest fałszem **niezależnie** od próby
odtworzenia — asercja przechodziła także po zdjęciu blokady z tej pozycji. Zamiana bramki na
ostrzeżenie zapalała wtedy **jeden** test zamiast trzech.

Poprawione na `check.blocking && check.status === 'fail'` — czyli na twierdzenie, o które
naprawdę chodzi. Ta sama lekcja co przy `Z-01`: test, który przechodzi na obu wersjach kodu,
nie mówi nic o żadnej z nich.

## Czego to nadal nie robi

- **Nie odtwarza konta hostingowego** (pliki, poczta, bazy klienta) — to osobna ścieżka
  w runbooku i nadal wymaga ręcznego przejścia.
- **Nie mierzy RTO na maszynie zastępczej.** Drill biegnie na tym samym hoście, więc zmierzony
  czas jest **dolnym oszacowaniem**, nie wartością.
- **Nie sprawdza poprawności danych** ponad to, że tabele nie są puste. Odtworzenie
  z uszkodzonym, ale niepustym dumpem przejdzie.
- **Nie uruchamia się samo.** Świadomie: drill zajmuje zasoby control-plane i kasuje bazę
  drillową; uruchamianie go cyklicznie bez nadzoru na maszynie produkcyjnej to nie jest coś, co
  powinno dziać się w tle. Przypomina, nie wykonuje.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `H-19` | dziedziczy wzorzec — twarda bramka zamiast ostrzeżenia |
| `X-23` | ta sama klasa: alarm, który nie zatrzymuje, przestaje być czytany |
| `X-14` | ta sama klasa: kontrola, która liczy i nie sprawdza |
| `PB-12` | dokłada punkt do runbooka startu: wykonać drill i obejrzeć wpis |

## Dowód po

- `libs/database/prisma/migrations/20260823000000_proba_odtworzenia/`
- `apps/api/src/admin-readiness/proba-odtworzenia.ts` — ocena stanu i progi
- `apps/api/src/admin-readiness/live-readiness.service.ts` — bramka `restore_drill`
- `apps/api/src/admin-readiness/proba-odtworzenia.scheduler.ts` — przypomnienie
- `ops/scripts/restore-drill-isolated.sh` — asercje i zapis śladu
- `ops/docs/OFFSITE_RESTORE_RUNBOOK.md` — procedura z właścicielem i cyklem
- 20 testów jednostkowych + 8 integracyjnych

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**D2 dla mechanizmu, D4 dla pozycji — i D4 jeszcze nie ma.** To jest różnica, o którą chodzi
w tej pozycji, i dlatego zostaje otwarta.

**Stan w macierzy po:** `CZĘŚCIOWE` / `CZĘŚCIOWY`, nadal `BLOKER STARTU`
