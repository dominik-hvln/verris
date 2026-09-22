# `X-43` — Cała czerwień `ci.yml` na `main`, przejrzana zanim wygaśnie

| | |
|---|---|
| **Sprint** | poza planem — audyt historii bramki |
| **Priorytet** | ŚREDNIA |
| **Nakład** | ~1 h |
| **Zależy od** | `X-42` (pozycja 1 z jego backlogu) |
| **Status** | zamknięte |
| **Data** | 2026-08-26 |

---

## Po co

`X-42` zapisało wprost: *„Nie wiemy, czy `ci.yml` nie był czerwony także wcześniej
z innych powodów. Widzieliśmy czerwień przy `X-35` i `X-38`; tamtych przebiegów nie
otwieraliśmy."* Ta pozycja to domknięcie tamtego zdania.

Pytanie było jedno: **czy `X-42` naprawił jedyną przyczynę czerwieni, czy ostatnią z kilku.**

## Metoda

`gh run list --workflow=ci.yml --branch main`, potem `gh run view --log-failed` dla każdego
czerwonego przebiegu. Istotny szczegół: pierwsze zapytanie miało `--limit 40`, a przebiegów
na `main` jest **43**. Trzy najstarsze wypadły poza okno i trzeba było o nie zapytać osobno.

**Wniosek metodyczny, zanim jakikolwiek merytoryczny:** limit zapytania jest częścią wyniku.
„To są wszystkie czerwienie" i „to są czerwienie z ostatnich czterdziestu przebiegów" to dwa
różne zdania, a odróżnia je wyłącznie to, czy ktoś sprawdził, ile jest wszystkich.

## Wynik: cztery przyczyny, nie jedna

| Przebiegi | Job → krok | Przyczyna | Stan |
|---|---|---|---|
| #109, #117, #118 | `Static checks` → `Lint` | brak wtyczki `react-hooks` dla `.cjs` | `X-42`, potwierdzone #120 |
| #107 | `Static checks` → `Typecheck` | TS6059 — spec sięgał do innej paczki ścieżką względną | `X-38`, zamknięte |
| #101 | `API unit tests` → `API unit tests` | strażnik przeczył celowej zmianie z `X-35` | zamknięte, patrz niżej |
| #1–#15 (maj) | trzy joby naraz, bez nazwy kroku | **nieodtwarzalna** — logi wygasły | zamknięte bez diagnozy |

### #101 — strażnik przeciw własnemu zadaniu

```
routing-alertow.spec.ts:141
  expect(blok).toMatch(/noDataState:\s*Alerting/)
  ← w rules.yaml stoi  noDataState: OK
Test Suites: 1 failed, 66 passed, 67 total
Tests: 2 failed, 728 passed, 730 total
```

`X-35` zmieniło `noDataState` z `Alerting` na `OK` — z pełnym uzasadnieniem, bo `noDataState`
nie odróżnia „filtr nikogo nie przepuścił, bo jest dobrze" od „metryki nie ma wcale".
Asercja w `routing-alertow.spec.ts` nadal wymagała `Alerting`. Zmiana i jej strażnik
rozjechały się **wewnątrz jednego zadania**.

Przebieg czasu, odtworzony z obu workflow:

| commit | co się stało |
|---|---|
| `9edc2356` — `X-35`, reguła backupu | `deploy.yml` #75 czerwone na kroku `API unit tests`; `ci.yml` **bez werdyktu** |
| `5a725fe2` — poprawka `.gitignore` po `X-35` | `ci.yml` #101 i `deploy.yml` #76 — oba czerwone, ta sama asercja |
| `ab7522f8` — `X-35`, strażnicy ciszy | bramka testowa **przeszła**; `deploy.yml` #77 padło dopiero na `Deploy over SSH` |
| `a5f48dbc` | `deploy.yml` #78 zielone |

Dwie rzeczy z tej tabeli warto zapisać osobno.

**Czerwień zaczyna się na własnym commicie `X-35`, nie na poprawce po nim.** Gdybyśmy patrzyli
tylko na `ci.yml`, wyszłoby, że winna jest zmiana w `.gitignore` — bo to jej przebieg jest
pierwszym czerwonym, jaki `ci.yml` w ogóle zdążył zaraportować.

**`ci.yml` nie ma werdyktu dla `9edc2356`.** Kolejny push padł trzy minuty później i przebieg
najpewniej został anulowany przez grupę współbieżności. **Brak przebiegu nie jest zielonym
przebiegiem** — a w liście `gh run list` jedno i drugie wygląda tak samo, czyli nie wygląda
wcale.

### Maj — zamknięte bez diagnozy

`#1`, `#2`, `#3` (15 maja) też są czerwone; razem z `#4`–`#15` bramka była wtedy praktycznie
stale czerwona. Logów już nie ma:

```
failed to get run log: HTTP 410
```

GitHub trzyma logi przebiegów około 90 dni. To jest okres sprzed `X-01`, czyli sprzed
istnienia tej bramki jako czegokolwiek wiążącego, więc strata jest niewielka — ale sam
mechanizm już nie.

**Dowód z CI ma datę ważności.** „Obejrzymy tamte przebiegi później" nie jest planem, tylko
sposobem na utratę materiału. Czerwony przebieg na `main` albo zostaje otwarty, albo jego
przyczyna zostaje zapisana tego samego dnia.

## Korekta do `X-42`

`X-42` twierdzi, że bramka wdrożenia była słabsza od bramki gałęzi. **To prawda, ale tylko
dla lintu.** Zestawienie obu workflow commit po commicie:

| commit | `ci.yml` | `deploy.yml` |
|---|---|---|
| `9450e26b` (`X-40`) | #109 czerwone | #84 **zielone** |
| `6cdb45d0` (`X-41`) | #117 czerwone | #85/#86 **zielone** |
| `48cabcf3` (`X-41`) | #118 czerwone | #87 **zielone** |
| `d0f7d7ff` (`X-38`) | #107 czerwone | #82 czerwone |
| `5a725fe2` (po `X-35`) | #101 czerwone | #76 czerwone |

Trzy zielone wdrożenia obok czerwonego CI — dokładnie te, o których pisze `X-42`, teraz
potwierdzone co do commita. Tam, gdzie padał typecheck albo test, wdrożenie padało razem
z CI, bo te kroki miało. Luka była jedna i była nią wyłącznie nieobecność lintu.

## Hipoteza, którą warto zapisać, bo była błędna

Zobaczywszy, że `deploy.yml` padał na `#72`, `#77`, `#79` przy commitach, których `ci.yml`
nie zapalił, napisałem, że to zapewne bramki wdrożeniowe, których CI z definicji nie ma —
czyli asymetria w drugą stronę, zgodna z regułą „wdrożeniu wolno więcej".

Odczyt mówi co innego. Wszystkie trzy padły na kroku **`Deploy over SSH`**, czyli na samym
wdrożeniu na hoście. To nie jest żadna asymetria bramek — to `X-36`, kontrola zatrzymująca
własne wdrożenia, opisana tam i tam naprawiona.

Zgadywałem strukturę zamiast ją odczytać, i to na danych, które miałem już pod ręką. Druga
taka pomyłka w tej samej sesji po `X-42` (tam: `pnpm install` jako przyczyna awarii ESLinta).
Obie kosztowały minutę, bo obie dało się sprawdzić — i obie zostały sprawdzone, zanim coś
z nich wynikło.

## Czego to nie robi

- **Nie dodaje żadnego strażnika.** To audyt, nie naprawa. Wszystkie cztery przyczyny są
  już zamknięte przez inne pozycje albo nieodtwarzalne.
- **Nie sprawdza `deploy.yml` w całości.** Zestawienie obejmuje okno od 24 sierpnia, bo tyle
  wystarczyło do rozstrzygnięcia pytania o `X-42`. Wcześniejsza historia wdrożeń nie została
  przejrzana.
- **Nie tłumaczy maja.** Logi wygasły i nic tego nie odwróci.
- **Nie zapobiega anulowaniu przebiegów.** Grupa współbieżności nadal może skasować werdykt
  dla commita, jeśli kolejny push przyjdzie w trakcie. Nie mamy nic, co by to zauważyło.

## Do backlogu

1. **Przebieg bez werdyktu jest niewidoczny.** Anulowany `ci.yml` nie różni się w liście od
   nieistniejącego. Warto rozważyć odczyt `conclusion == "cancelled"` przy zamykaniu pozycji
   na D2 — dziś sprawdzamy tylko, czy jest zielony przebieg, nie czy któryś zniknął.
2. **`deploy.yml` przed 24 sierpnia** — nieprzejrzane.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-42` | domyka pozycję 1 jego backlogu; zawęża jego tezę — luką był wyłącznie lint |
| `X-35` | koryguje — trafiło na `main` z czerwoną bramką, pierwsze zobaczyło to wdrożenie |
| `X-38` | potwierdza — #107 to TS6059, żadnej dodatkowej przyczyny tam nie ma |
| `X-36` | wyjaśnia — trzy czerwone wdrożenia na `Deploy over SSH` to jego sprawa |
| `X-17` | uzupełnia — jego D2 czekało trzy dni na przebieg, którego blokowała ta czerwień |

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**D2, bo dowodem są przebiegi CI** — 43 przebiegi `ci.yml` na `main` i okno `deploy.yml`
od 24 sierpnia, odczytane z `gh run view --log-failed`, nie z pamięci. D3 nie istnieje:
pozycja nie dotyka produkcji.
