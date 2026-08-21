# `Z-02` — Blokada zamówienia usługi bez opłaty przez klienta

| | |
|---|---|
| **Sprint** | 1 (2026-08-24 – 2026-08-28) |
| **Priorytet** | BLOKER STARTU |
| **Nakład** | planowany 6 h · rzeczywisty ? h |
| **Zależy od** | — |
| **Status** | do zrobienia |
| **Data zamknięcia** | |

---

## Problem

Dowolne konto po rejestracji zamawia nieograniczoną liczbę aktywnych usług za 0 zł, bez faktury i bez śladu płatności. Ta sama luka jest zamknięta przy zmianie planu (plan-change.service.ts:206-213), ale nie przy zakupie. Brak rate-limitu na POST /subscriptions.

## Dowód przed

```
subscriptions.controller.ts:29-30 (tylko JwtAuthGuard, zero @Roles) + :97 @Post(); dto/subscription.dto.ts:48 @IsEnum przyjmuje MANUAL; subscriptions.service.ts:361 → :368 provisionWithoutCharge (:1271) ustawia ACTIVE bez obciążenia; komentarz :81-82 mówi wprost że to ścieżka operatorska
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
