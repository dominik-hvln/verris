# `X-01` — CI uruchamiające testy

| | |
|---|---|
| **Sprint** | 1 (2026-08-24 – 2026-08-28) |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 6 h · rzeczywisty ? h |
| **Zależy od** | — |
| **Status** | do zrobienia |
| **Data zamknięcia** | |

---

## Problem

Reklasyfikacja: brak CI nie spełnia żadnego z czterech warunków blokera — nie powoduje utraty danych, nie łamie prawa, nie blokuje dokumentu księgowego. Zostaje pozycją nr 1 do zrobienia, bo bez niej pozostałe naprawy nie mają jak być potwierdzone.

## Dowód przed

```
katalog .github NIE ISTNIEJE; brak .gitlab-ci, Jenkinsfile, .circleci, .husky
```

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

_Do uzupełnienia w trakcie pracy. Zapisz też podejścia odrzucone i dlaczego._

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| | |

Migracje bazy: —  
Zmienne środowiskowe: —

## Testy

| Test | Co sprawdza |
|---|---|
| | |

**Czy test najpierw czerwienił się na starym kodzie?** —

## Dowód po

_`plik:linia` wskazujące na implementację — to trafia do macierzy._

**Osiągnięty poziom dowodu:**
- [ ] D1 — kod istnieje
- [ ] D2 — test przechodzi w CI
- [ ] D3 — zaobserwowane na produkcji (data)
- [ ] D4 — powtarzalna procedura z właścicielem i datą

**Stan w macierzy po:** 

## Definicja ukończenia

> Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.

## Czego to nadal nie robi

_Jeżeli lista nie jest pusta, stan w macierzy to `CZĘŚCIOWE`, a brakująca część wraca do backlogu z nowym ID._

## Ryzyko i wycofanie

_Co może pójść źle i jak cofnąć._

## Wpływ na inne pozycje

_Które ID z macierzy to zamyka, otwiera albo zmienia._
