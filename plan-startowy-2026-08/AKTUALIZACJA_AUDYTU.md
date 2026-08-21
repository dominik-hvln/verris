# Aktualizacja plików audytu — procedura

**Po co to istnieje.** Audyt z 2026-08-20 wykazał wzorzec, który w tym projekcie już raz kosztował: status „zrobione" nadawany na podstawie części zakresu, bez uruchomienia testów. Jeżeli macierz nie jest aktualizowana razem z kodem, po trzech sprintach nikt nie wie, co jest zrobione — i wracamy dokładnie tam, skąd wyszliśmy. Ta procedura jest zabezpieczeniem przed tym, nie biurokracją.

Zasada jedna: **pozycja zmienia status w macierzy w tym samym sprincie, w którym zmienia się w kodzie.** Nie na koniec fazy, nie „jak będzie chwila".

---

## Co jest gdzie

| Plik | Rola | Kto edytuje |
|---|---|---|
| **`audyt/dane/macierz.csv`** | **352 pozycje — źródło prawdy o stanie produktu** | **aktualizowana na koniec sprintu** |
| `audyt/generate.py` | generator wszystkich widoków | uruchamiany, nie edytowany przy zwykłej pracy |
| `audyt-parytetu-2026-08/VERRIS_PARYTET_FUNKCJI_2026-08.xlsx` | widok macierzy | generowany |
| `plan-startowy-2026-08/VERRIS_BACKLOG_STARTOWY.xlsx` | backlog 60 zadań — kolumna **Status** | edytowana na bieżąco w trakcie sprintu |
| `plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md` | plan sprintów, definicje ukończenia | zmieniany tylko przy zmianie planu |
| `audyt-parytetu-2026-08/VERRIS_LUKI_DASHBOARD.html` | widok macierzy | generowany, nie edytowany ręcznie |
| `plan-startowy-2026-08/VERRIS_PLAN_DASHBOARD.html` | widok planu | generowany, nie edytowany ręcznie |

Wszystko poza `audyt/dane/` i kolumną Status w backlogu jest **widokiem**, nie danymi. Ręczna edycja zostanie nadpisana przy następnej regeneracji.

Jedyny wyjątek: **raport audytu** (`VERRIS_AUDYT_PARYTETU_2026-08.md`) jest pisany ręcznie — to narracja z wnioskami, nie zestawienie.

---

## W trakcie sprintu

Jedno pole: kolumna **Status** w backlogu XLSX. Trzy wartości: `do zrobienia` · `w toku` · `zrobione`.

`zrobione` ustawiamy dopiero wtedy, gdy spełniona jest **definicja ukończenia** z kolumny N tego samego wiersza. Nie „kod napisany", nie „działa u mnie". Podsumowanie w arkuszu przeliczy się samo.

---

## Na koniec sprintu — pięć kroków

**1. Przejdź pozycje sprintu w macierzy.** Dla każdej zaktualizuj trzy kolumny:

- `Verris — stan` → nowa wartość ze słownika: `DZIAŁA` · `CZĘŚCIOWE` · `FLAGA` · `ATRAPA` · `ENDPOINT BEZ UI` · `BRAK`
- `Dowód (plik:linia)` → **nowy** plik i linia, ta która realizuje funkcję po zmianie. Stary dowód wskazywał na brak; teraz ma wskazywać na implementację.
- `Uwagi` → co dokładnie zrobiono i czego nadal nie ma. Jeżeli funkcja działa tylko częściowo, to należy tu, a stan zostaje `CZĘŚCIOWE`.

**2. Przelicz werdykt.** `LUKA` → `PARYTET`, gdy funkcja dorównuje medianie rynku PL. `→ PRZEWAGA` tylko wtedy, gdy mediana tego nie ma — nie dlatego, że zrobiliśmy to dobrze.

**3. Zbij krytyczność.** Zamknięty bloker przestaje być blokerem. To jedyna liczba, na podstawie której podejmujemy decyzję o starcie, więc musi być prawdziwa w obie strony.

**4. Dopisz nowe pozycje, jeśli sprint coś ujawnił.** Nowe ID w tej samej konwencji (`Z-08`, `M-34`…). Praca odkryta w sprincie nie znika dlatego, że nie było jej w planie.

**5. Zregeneruj widoki.**

```bash
python3 audyt/generate.py --sprawdz   # najpierw walidacja
python3 audyt/generate.py             # potem budowa
```

Walidator wyłapie: niedozwoloną wartość w kolumnie, bloker bez przypisanego sprintu, odwołanie do nieistniejącego ID, przeciążony sprint, `POZA ZAKRESEM` bez uzasadnienia oraz stan `DZIAŁA` bez dowodu `plik:linia`. Dwie ostatnie reguły istnieją, bo dokładnie te błędy audyt znalazł sam w sobie.

**Commit obejmuje i dane, i przebudowane widoki.** Inaczej rozjadą się przy pierwszym `git pull`.

**6. Napisz podsumowanie sprintu** w `docs/sprinty/SPRINT-NN.md` — wzór w `_SZABLON.md`. Tabela „Zmiany w macierzy audytu" w tym pliku ma zawierać stan przed i po dla każdej dotkniętej pozycji oraz liczbę blokerów przed i po. To jest zapis, dzięki któremu za pół roku da się odtworzyć, na jakiej podstawie coś przestało być blokerem.

---

## Kiedy pozycja NIE zasługuje na `DZIAŁA`

Lista wzięta z tego, co audyt faktycznie znalazł — każdy z tych przypadków wyglądał na działający:

- Kontroler nie rejestruje trasy, którą woła panel. Sprawdź dekorator i prefiks kontrolera, nie nazwę metody serwisu.
- Komponent istnieje, ale nikt go nie importuje. Sprawdź, czy trasa prowadzi tam, gdzie myślisz — `/dashboard/dns` przekierowuje gdzie indziej.
- Front ma cichy fallback („chwilowo niedostępne") zamiast błędu. To najgroźniejszy wzorzec: nie zostawia śladu w logach i nie generuje zgłoszeń.
- Funkcja zależy od zmiennej środowiskowej, której nikt nie ustawił. Wtedy `FLAGA` z podaną wartością domyślną, nie `DZIAŁA`.
- Skrypt obsługuje tryb, którego control-plane nigdy nie przekazuje.
- Test istnieje, ale sprawdza metadane dekoratora, nie zachowanie guardu.

---

## Przegląd kwartalny

Raz na kwartał — pełne przejście, nie tylko pozycje dotknięte sprintami:

- **Rynek się zmienia.** Kolumny konkurencji mają datę. Dokument starszy niż 30 dni traci status dowodu, a cennik i parametry hostingów zmieniają się kilka razy w roku.
- **Pass adwersaryjny na nowo** — na pozycjach `PARYTET` i `PRZEWAGA`. Pierwsze przejście tego audytu obaliło 11 z 66 twierdzeń o przewadze i znalazło 7 pozycji krytycznych, których nie widziało. Nie ma powodu zakładać, że drugie przejście będzie inne.
- **Sprawdź decyzje `POZA ZAKRESEM`.** 12 pozycji jest tam świadomie. Jeżeli klienci zaczęli o którąś pytać, decyzja wraca do przeglądu.
- **Metoda jest spakowana** jako skill `hosting-feature-parity-audit` — taksonomia, skala dowodu, werdykty i reguły degradacji. Kolejny przegląd ma używać tej samej metody, inaczej wyniki nie będą porównywalne w czasie.

---

## Dokumentacja zadań

Szkielety plików `docs/zadania/` na kolejny sprint tworzy generator, wypełniając od razu problem, dowód przed i definicję ukończenia z macierzy:

```bash
python3 audyt/generate.py --zadania 9    # szkielety dla sprintu 9
```

Nie nadpisuje istniejących plików, więc można go uruchomić ponownie bez ryzyka. Sekcje „Problem" i „Dowód przed" są gotowe — resztę wypełniasz w trakcie pracy, nie po niej.

## Kiedy potrzebna jest pomoc z zewnątrz

Generator poradzi sobie ze wszystkim, co jest przeliczeniem danych. Trzy rzeczy wymagają napisania od nowa i nie da się ich wygenerować:

- **raport audytu** — narracja z wnioskami i rekomendacją GO/NO-GO,
- **pass adwersaryjny** — próba obalenia własnych twierdzeń o parytecie i przewadze,
- **przegląd kolumn konkurencji** — rynek się zmienia, cenniki i parametry hostingów kilka razy w roku.

Przy każdej z nich wystarczy powiedzieć, co się zmieniło od ostatniego razu (np. „sprint 9 zamknięty, D-04 do D-07 działają, D-11 nadal atrapa") — reszta odtwarza się z `audyt/dane/`.
