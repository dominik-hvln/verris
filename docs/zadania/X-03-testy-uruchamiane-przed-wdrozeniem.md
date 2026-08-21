# `X-03` — Testy uruchamiane przed wdrożeniem

| | |
|---|---|
| **Sprint** | 1 (2026-08-21) |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 6 h · rzeczywisty 2 h |
| **Zależy od** | `X-01` |
| **Status** | częściowo zrobione |
| **Data zamknięcia** | — (ścieżka ręczna zostaje otwarta) |

---

## Problem

Push na gałąź wdrożeniową budował obraz i wypychał go na produkcję, nie sprawdzając po drodze niczego poza tym, czy build się skompiluje. Czerwony test nigdy nie zatrzymał wdrożenia, bo żaden test nie był uruchamiany.

## Dowód przed

`.github/workflows/deploy.yml` — job `build-push` startował bezpośrednio z wyzwalacza, bez `needs:` wskazującego na cokolwiek weryfikującego. Osobno:

```
ops/scripts/prod-deploy-ghcr.sh — zero wywołań pnpm test
```

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

Do `deploy.yml` dołożony job `test-gate`, a `build-push` dostał od niego zależność:

```yaml
jobs:
  test-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @verris/database db:generate
      - run: pnpm typecheck
      - run: pnpm --filter api test

  build-push:
    needs: test-gate
    ...
```

**Czego nie ruszyłem i dlaczego.** Wyzwalacze `deploy.yml` zostają dokładnie takie, jakie były (`main`, `master`, `live-release-readiness`). Prośba PM-a brzmiała: „zrób porządek, ale żeby działało wszystko jak teraz, czyli push uruchamia build na serwerze". Bramka zmienia **warunek**, nie **zdarzenie** — po zielonym zestawie wdrożenie idzie tak samo jak dotąd.

**Dlaczego osobny job, a nie krok w `build-push`.** Osobny job daje czytelny podział w interfejsie Actions: widać, czy zatrzymał nas test, czy build. Przy jednym jobie trzeba rozwijać logi. Koszt: drugi `pnpm install`, około dwóch minut. Warte tego.

**Dlaczego nie wystarczy `ci.yml`.** `ci.yml` i `deploy.yml` to dwa niezależne workflow — zielony jeden nie wstrzymuje drugiego. Bez `needs:` w tym samym pliku deploy ruszałby równolegle z testami i zdążyłby wypchnąć obraz, zanim test zdąży się wywalić.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `.github/workflows/deploy.yml` | nowy job `test-gate`; `build-push` dostał `needs: test-gate` |

Migracje bazy: brak
Zmienne środowiskowe: brak

## Testy

Jak przy `X-01` — dowodem jest przebieg, nie test jednostkowy.

**Czy test najpierw czerwienił się na starym kodzie?** Nie dotyczy.

## Dowód po

`.github/workflows/deploy.yml` — job `test-gate` oraz `needs: test-gate` w `build-push`

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [ ] D2 — potwierdzone przebiegiem
- [ ] D3 — nie dotyczy
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** `CZĘŚCIOWE`

## Czego to nadal nie robi

**`ops/scripts/prod-deploy-ghcr.sh` nadal nie uruchamia żadnych testów.** To ręczna ścieżka wdrożenia — używana, gdy trzeba wypchnąć coś z konsoli control-plane bez przechodzenia przez GitHuba. Dopóki istnieje, bramka jest omijalna jednym poleceniem.

Świadomie nie zamykam tego w tym sprincie. Dopisanie `pnpm test` do skryptu, który uruchamia się na control-plane, wymaga tam pełnego `node_modules` i wygenerowanej Prismy — czyli zmiany w tym, co ten serwer w ogóle ma u siebie. To osobna decyzja infrastrukturalna, nie poprawka jednej linii. Do rozstrzygnięcia z PM-em: albo skrypt dostaje twardą odmowę uruchomienia bez zielonego przebiegu w GitHubie (sprawdzenie przez API), albo zostaje świadomie jako „wyjście awaryjne" z wpisem w runbooku.

Dlatego stan to `CZĘŚCIOWE`, a nie `DZIAŁA`, i pozycja nie znika z macierzy.

## Ryzyko i wycofanie

Ryzyko: wdrożenie awaryjne w środku incydentu zablokowane przez test niezwiązany z awarią. Zawór bezpieczeństwa istnieje i jest nim właśnie `prod-deploy-ghcr.sh` — co jest argumentem za pozostawieniem go, ale świadomym i opisanym, a nie przez zapomnienie.

Wycofanie: usunięcie `needs: test-gate`. Jedna linia.

## Wpływ na inne pozycje

- Zależy od `X-01` — bez CI chodzącego na gałęziach bramka nie miałaby czego pilnować.
- Nie zamyka `X-02` (branch protection) — to jest ustawienie po stronie GitHuba.
