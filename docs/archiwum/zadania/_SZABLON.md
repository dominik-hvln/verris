# `ID` — Tytuł zadania

> Skopiuj ten plik jako `docs/zadania/<ID>-<krótki-slug>.md`, np. `Z-01-faktura-dla-portfela.md`.
> Sekcje „Problem" i „Dowód przed" wypełnij **przed** rozpoczęciem pracy — z macierzy audytu.
> Resztę w trakcie i po zakończeniu. Usuń ten blok cytatu.

| | |
|---|---|
| **Sprint** | |
| **Priorytet** | BLOKER STARTU / WYSOKA / ŚREDNIA / NISKA |
| **Nakład** | planowany X h · rzeczywisty Y h |
| **Zależy od** | ID lub „—" |
| **Status** | do zrobienia / w toku / zrobione |
| **Data zamknięcia** | |

---

## Problem

Co konkretnie jest nie tak. Jedno–dwa zdania, bez rozgrzewki. Nie „brakuje funkcji X", tylko co się dzieje albo nie dzieje z punktu widzenia klienta lub operatora.

## Dowód przed

Stan zastany z macierzy audytu — `plik:linia` i cytat, który to pokazuje. Bez tego nie da się później stwierdzić, czy zmiana faktycznie coś naprawiła.

```
apps/api/src/…/plik.ts:123
  // fragment pokazujący problem
```

**Stan w macierzy przed:** `ATRAPA` / `BRAK` / `ENDPOINT BEZ UI` / `CZĘŚCIOWE` / `FLAGA`

## Rozwiązanie

Co zostało zrobione i **dlaczego tak, a nie inaczej**. Jeżeli odrzuciłeś jakieś podejście, napisz które i z jakiego powodu — za trzy miesiące to jest jedyna rzecz, której nie da się odtworzyć z kodu.

Jeżeli zapadła decyzja architektoniczna wykraczająca poza to zadanie, jej miejsce jest w `docs/architektura/`, a tutaj zostaje link.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/…` | |

Migracje bazy: `nazwa` albo „brak".
Zmienne środowiskowe: nazwa, wartość domyślna, czy wymagana na produkcji — albo „brak".

## Testy

| Test | Co sprawdza |
|---|---|
| `…spec.ts` | |

**Czy test najpierw czerwienił się na starym kodzie?** TAK / NIE — a jeśli nie, to dlaczego.
To nie jest formalność. Test napisany po naprawie i od razu zielony nie dowodzi, że sprawdza właściwą rzecz.

## Dowód po

`plik:linia` wskazujące na implementację. To trafia do kolumny „Dowód" w macierzy.

**Osiągnięty poziom dowodu:**
- [ ] D1 — kod istnieje
- [ ] D2 — test przechodzi w CI
- [ ] D3 — zaobserwowane na produkcji (data, timestamp)
- [ ] D4 — powtarzalna procedura z właścicielem i datą wykonania

Pieniądze, dane klienta i dostęp wymagają D3. Backupy i DR — wyłącznie D4.

**Stan w macierzy po:** `DZIAŁA` / `CZĘŚCIOWE` / …

## Czego to nadal nie robi

Ograniczenia, które zostają. Jeżeli lista nie jest pusta, stan w macierzy to `CZĘŚCIOWE`, nie `DZIAŁA`, a brakująca część wraca do backlogu z własnym ID.

## Ryzyko i wycofanie

Co może pójść źle po wdrożeniu i po czym to poznamy. Jak cofnąć zmianę — czy migracja jest odwracalna, czy wystarczy poprzedni obraz kontenera.

## Wpływ na inne pozycje

Czy to zamyka, otwiera albo zmienia coś w innych ID z macierzy. Nowa praca odkryta przy okazji → nowe ID, nie dopisek tutaj.
