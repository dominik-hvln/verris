# `X-04` — Testy integracyjne API

| | |
|---|---|
| **Sprint** | poza planem — wykonane przy sprincie 3 |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 40 h (L) · rzeczywisty ~5 h dla pierwszej warstwy |
| **Zależy od** | — |
| **Status** | częściowe |
| **Data** | 2026-08-22 |

---

## Problem

W projekcie nie było ani jednego testu integracyjnego. Wszystkie 415 testów API podstawiało
fałszywą Prismę — dowodziły, że logika jest poprawna, nie że zapytanie do bazy zwraca to,
czego się po nim spodziewamy.

Różnica nie jest teoretyczna. `groupBy` z filtrem po statusie, `increment` w transakcji, wybór
najnowszej próbki na subskrypcję, typ, w jakim Postgres zwraca `Float` — to rzeczy, które
w atrapie działają **zawsze**.

## Dowód przed

```
apps/api/package.json:52-73  — zero @nestjs/testing, zero supertest nawet w devDependencies
```

**Stan w macierzy przed:** `BRAK` / `LUKA` / `WYSOKA`

## Rozwiązanie

### Co jest prawdziwe, a co fałszywe

Prawdziwe: baza, zapytania, transakcje, logika serwisów.
Fałszywe: wyłącznie to, co naprawdę jest na zewnątrz — DirectAdmin, poczta, dziennik audytu.

Ten podział jest całym sensem tych testów. Podstawienie atrapy pod Prismę zamieniłoby je
z powrotem w testy jednostkowe z droższym uruchomieniem.

### Izolacja

`TRUNCATE ... RESTART IDENTITY CASCADE` przed każdym testem, zamiast kasowania tabel po kolei.
Kolejność zależności jest długa i pominięcie jednej tabeli objawia się jako „u mnie przechodzi,
w CI pada".

`maxWorkers: 1` jest wymogiem poprawności, nie optymalizacją: testy dzielą jedną bazę.
Równoległe workery kasowałyby sobie dane nawzajem, a objawiłoby się to jako losowa czerwień —
najgorszy możliwy rodzaj, bo uczy zespół ignorować czerwień.

### Zakres pierwszej warstwy

| Plik | Co pokrywa |
|---|---|
| `node-selector.int-spec.ts` | 9 testów placementu — gęstość, nadsubskrypcja, `maxAccounts` wobec kont `DELETED`, okno świeżości telemetrii, wybór między węzłami, cordon, MAINTENANCE |
| `ksiega.int-spec.ts` | 6 testów cyklu życia księgi — zwolnienie przy usunięciu konta, limity efektywne wraz z nadwyżką, autoskalowanie w górę i w dół, pełny cykl z niezmiennikiem po każdym kroku |

### Co złapały, czego atrapy nie mogły

- **Postgres zwraca `Float` jako `number`**, nie jako `Decimal` — gdyby wracał inaczej, cała
  arytmetyka nadsubskrypcji liczyłaby się na tekście. Sprawdzane wprost (`typeof`).
- **`groupBy` z `status: { not: 'DELETED' }`** faktycznie pomija te konta w prawdziwym SQL-u.
- **Okno świeżości telemetrii** działa na prawdziwym `ORDER BY` i prawdziwych znacznikach czasu.
- **Wybór najnowszej próbki na subskrypcję** nie sumuje okna — sześć próbek po 20 GB nie daje 120 GB.
- **`increment` w transakcji** faktycznie się zatwierdza i daje wartość, której oczekujemy.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/test/integration/setup.ts` | nowy — izolacja, fabryki, atrapy świata zewnętrznego |
| `apps/api/test/integration/node-selector.int-spec.ts` | nowy — 9 testów |
| `apps/api/test/integration/ksiega.int-spec.ts` | nowy — 6 testów |
| `apps/api/jest.integration.cjs` | nowy — osobna konfiguracja, `maxWorkers: 1` |
| `.github/workflows/ci.yml` | nowy job `API integration tests` z Postgresem 16 |

## Testy

**15 testów, uruchomione naprawdę — nie tylko napisane.** Postawiłem Postgresa 16,
zaaplikowałem wszystkie 100 migracji, wygenerowałem klienta Prismy i puściłem pakiet: 15/15
zielonych.

**Czy czerwienią się na regresji?** Tak. Usunięcie zwolnienia pojemności z
`account-deletion.service.ts` — czyli przywrócenie przecieku sprzed `Z-16` — czerwieni
**4 z 6** testów księgi.

## Dowód po

- `apps/api/test/integration/` — 15 testów
- `.github/workflows/ci.yml` — job `API integration tests`

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [ ] D2 — test przechodzi w CI
- [ ] D3 · [ ] D4

**D2 jeszcze nie.** Testy przechodzą u mnie, na środowisku, które sam postawiłem — CI ich
jeszcze nie uruchomiło ani razu. Poziom podniesie się do D2 po pierwszym zielonym przebiegu
joba na `main`, nie wcześniej.

**Stan w macierzy po:** `CZĘŚCIOWE` / `CZĘŚCIOWY`

## Dlaczego CZĘŚCIOWE, a nie DZIAŁA

Pozycja w macierzy nazywa się „testy integracyjne / e2e API". Pokryte są dwa obszary:
placement i księga pojemności. **Nie są** pokryte:

- ścieżki HTTP przez `supertest` — nic nie sprawdza, czy kontroler, guard i walidacja DTO
  działają razem na prawdziwym żądaniu,
- provisioning end-to-end,
- płatności i webhooki (`Z-05`),
- faktury i KSeF.

Zgodnie z zasadą audytu: lista niepusta oznacza `CZĘŚCIOWE`.

## Job w CI nie jest wymagany do scalenia — celowo

Ruleset z `X-02` wymaga zielonych checków do merge'a. Dopisanie do niego joba, który w tym
repozytorium nie przebiegł ani razu, zablokowałoby scalanie na ślepo, gdyby coś w konfiguracji
GitHuba różniło się od mojego środowiska.

Kolejność: pierwszy zielony przebieg na `main` → dopiero wtedy check trafia do rulesetu.
Do tego czasu job jest widoczny, ale niewymagany — tak samo jak skany bezpieczeństwa na start.

## Ograniczenie warsztatu, warte zapisania

Tych testów **nie da się uruchomić** ani na maszynie PM-a, ani domyślnie w kontenerze:

- **maszyna PM-a** — klient Prismy jest wygenerowany pod `darwin-arm64`, a sandbox z dostępem
  do plików to `linux-arm64`; `PrismaClient` nie startuje,
- **kontener** — `binaries.prisma.sh` jest poza listą dozwolonych hostów, więc
  `prisma generate` nie pobierze silników.

Uruchomienie wymagało zbudowania środowiska od zera: przeniesienia repozytorium, `pnpm install`,
własnego Postgresa, obejścia pobierania silnika schematu i zbudowania bibliotek workspace'u do
`dist/`. **CI jest jedynym miejscem, gdzie te testy biegną rutynowo** — i to jest argument za
tym, żeby check trafił do rulesetu, gdy tylko przebiegnie zielono.

## Ryzyko i wycofanie

**Ryzyko:** job dokłada ~3–5 minut do każdego przebiegu CI i stawia kontener Postgresa. Przy
jednoosobowym zespole to bez znaczenia; przy większym ruchu warto go ograniczyć do zmian
w `apps/api` i `libs/database`.

**Ryzyko drugie:** testy czyszczą bazę wskazaną przez `DATABASE_URL`. `setup.ts` odmawia startu
bez tej zmiennej, ale nie umie odróżnić bazy testowej od produkcyjnej. Nazwa bazy w CI to
`verris_test` i tak ma zostać.

**Wycofanie:** usunięcie joba z `ci.yml`. Pliki testów mogą zostać — nie wpływają na build ani
na pakiet jednostkowy (osobny `testRegex`).

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `Z-12`, `Z-16` | domyka lukę w dowodzie — arytmetyka księgi sprawdzona przeciwko prawdziwej bazie, nie symulacji |
| `X-15` | uzupełnia — tam arytmetyka, tu okablowanie |
| `X-05`, `X-06`, `X-09`, `X-10` | zasila — harness istnieje, kolejne obszary to dopisanie plików, nie budowanie fundamentu |
| `Z-05` | ułatwia — odporność webhooka płatności da się wreszcie sprawdzić na prawdziwej transakcji |
