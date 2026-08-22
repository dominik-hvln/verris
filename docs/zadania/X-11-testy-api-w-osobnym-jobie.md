# `X-11` — Testy API w osobnym jobie CI

| | |
|---|---|
| **Sprint** | 2 (2026-08-21) |
| **Priorytet** | ŚREDNIA |
| **Nakład** | planowany 6 h · rzeczywisty 1 h |
| **Zależy od** | `X-01` |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 |

---

## Problem

Testy API stały jako ostatni krok joba `Static checks (lint + typecheck)`, zaraz za typecheckiem. Dowolny błąd typów w dowolnym z sześciu workspace'ów kasował jedyny krok, który daje poziom dowodu D2.

To nie jest teoria — zdarzyło się przy pierwszym przebiegu.

## Dowód przed

Przebieg **CI #17**, pierwszy w historii tego repozytorium. Typecheck wywalił się na `apps/www/src/app/sitemap.ts` — pliku, którego cała ówczesna praca nie dotyczyła — i job zakończył się przed krokiem z testami:

```yaml
      - name: Typecheck (all workspaces via Turbo)
        run: pnpm typecheck          # ← tu się wywaliło

      - name: API unit tests
        run: pnpm --filter api test  # ← nigdy nie wykonane
```

Efekt: CI działało, świeciło na czerwono z powodu literówki w typach w panelu marketingowym, a **194 testy nie uruchomiły się ani razu.** Przez kilkadziesiąt minut mieliśmy działające CI i zero dowodu D2 — a to była dokładnie ta rzecz, którą CI miało dostarczyć.

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

Testy API dostały własny job `api-tests` o nazwie **`API unit tests`**, z własnym checkoutem, instalacją i generowaniem klienta Prismy.

**Zasada, którą to utrwala:** krok, który **dowodzi**, nie może stać za krokiem, który tylko **sprawdza higienę**. Lint i typecheck są ważne, ale ich porażka nie powinna zabierać informacji o tym, czy produkt działa.

**Koszt:** jeden dodatkowy `pnpm install` (około 30 sekund, cache pnpm jest współdzielony). Oba joby i tak biegną równolegle, więc czas całego przebiegu nie rośnie — rośnie tylko zużycie minut.

**Czego świadomie nie zmieniłem:** `deploy.yml` ma własną bramkę `test-gate`, w której typecheck i testy siedzą w jednym jobie. Tam kolejność nie szkodzi, bo zadaniem bramki jest **zablokować** wdrożenie, a nie **udowodnić** działanie. Jeżeli typecheck się wywali, wdrożenie i tak ma nie ruszyć — nie tracimy przy tym żadnej informacji, której byśmy potrzebowali.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `.github/workflows/ci.yml` | nowy job `api-tests`; krok „API unit tests" usunięty z `static-checks` |

Migracje bazy: brak
Zmienne środowiskowe: brak

## Testy

CI nie ma własnego testu jednostkowego — dowodem jest przebieg. Weryfikacja: w zakładce Actions mają być teraz **pięć** checków zamiast czterech, a `API unit tests` ma się wykonać nawet wtedy, gdy `Static checks` jest czerwone.

**Sprawdzenie w drugą stronę** (do wykonania przy najbliższej okazji): celowo zepsuć typ w dowolnym panelu i potwierdzić, że `Static checks` świeci na czerwono, a `API unit tests` mimo to przechodzi. To jest dokładnie ta sytuacja, przed którą to zadanie broni.

## Dowód po

`.github/workflows/ci.yml` — job `api-tests`

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [ ] D2 — po pierwszym przebiegu z rozdzielonymi jobami
- [ ] D3 — nie dotyczy
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** `DZIAŁA`

## Czego to nadal nie robi

~~**Nowy check trzeba dopisać do rulesetu z `X-02`.**~~ **Zrobione 2026-08-21**, w tej samej sesji. Ruleset wymaga teraz czterech checków: `Static checks (lint + typecheck)`, `Build (api + panels)`, `Prisma migrate deploy (smoke)` i `API unit tests`.

Warto odnotować, dlaczego to było ryzykowne: rozdzielenie jobów **otwierało dziurę** — przez chwilę testy były widoczne, ale niewymagane do scalenia, więc PR z czerwonymi testami przeszedłby, gdyby pozostałe trzy checki były zielone. Zmiana, która poprawia widoczność kosztem egzekwowania, jest gorsza niż stan wyjściowy. Dlatego oba kroki należą do jednego zadania, a nie do dwóch.

**Lint nadal jest `continue-on-error: true`.** Świadome: baza lintowa nie jest czysta, a twardy lint zablokowałby wszystko. Do rozstrzygnięcia osobno — albo posprzątać i zaostrzyć, albo przyznać wprost, że lint jest informacyjny.

## Ryzyko i wycofanie

Ryzyko: minuty Actions. Przy pięciu jobach na każdy push do każdej gałęzi zużycie rośnie zauważalnie — przy pierwszym wdrożeniu widzieliśmy już kolejkowanie, gdy obok CI ruszyły trzy przebiegi Dependabota. Jeżeli minuty zaczną być problemem, pierwszą rzeczą do ograniczenia są wyzwalacze `push: ['**']`, nie ten podział.

Wycofanie: przeniesienie kroku z powrotem do `static-checks` i usunięcie joba.

## Wpływ na inne pozycje

- Zamyka `X-11`.
- Rozszerza ruleset z `X-02` o czwarty wymagany check — zrobione tego samego dnia, bo bez tego zmiana otwierałaby dziurę zamiast ją zamykać.
