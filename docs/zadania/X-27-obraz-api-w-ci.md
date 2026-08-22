# `X-27` — Obraz, który trafia na serwer, powstawał dopiero po scaleniu

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI (blokował wdrożenie sprintu 2) |
| **Nakład** | S (~3 h) |
| **Zależy od** | `X-18` |
| **Status** | zamknięte |
| **Data** | 2026-08-22 |

---

## Jak to wyszło

Pierwsze wdrożenie po scaleniu sprintu 2 (`Deploy #63`, commit `a4f23d5`) padło. Wysypał się
build obrazu `verris-api` — czyli krok **przed** jakimkolwiek dotknięciem serwera. Produkcja
została nietknięta, migracje nie poszły, nic nie zostało podmienione.

```
Error: Could not resolve @prisma/client despite the installation that we just tried.
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @verris/database@1.0.0 db:generate: `prisma generate`
```

## Dwie przyczyny, nie jedna

### 1. Etap budowania rozganiał node_modules pakietów

```dockerfile
FROM deps AS build
COPY libs libs          # ← kładzie katalogi pakietów na te z etapu deps
COPY apps/api apps/api
RUN pnpm --filter @verris/database run db:generate && …
```

Etap `deps` układa `node_modules`, `COPY` je rozgania. Dopóki **każda** zależność lądowała
w `node_modules` katalogu głównego (linker `hoisted`), nie było tego widać — założenie
trzymało się przypadkiem.

### 2. Po `X-18` w drzewie stanęły dwa klienty Prismy

`apps/www` podniosło Payloada. Jego adapter postgresowy ciągnie `drizzle-orm`, a to ma
`@prisma/client` jako peer **opcjonalny**. pnpm dociąga takie peery samo
(`autoInstallPeers`), więc w drzewie pojawiła się wersja **7.9.1** obok naszej **6.19.3**.

W układzie `hoisted` na górze stanęła 7.9.1, a nasza zjechała do `libs/database/node_modules`.
Po `COPY` zostawała tylko ta z góry — a `prisma generate` z CLI 6.19.3 nie umie pracować
z klientem 7.x.

Sprawdzone: przed `X-18` w lockfile była **jedna** wersja `@prisma/client`.

## Dwie poprawki, bo to dwa różne błędy

**`pnpm.overrides`** sprowadza drzewo z powrotem do jednej wersji klienta. To naprawia ten
przypadek — i chroni także obraz runtime, który kopiuje `node_modules` katalogu głównego
i sam wywołuje `prisma generate`.

**Ponowna instalacja po `COPY`** w `Dockerfile.api` i `Dockerfile.panel` znosi założenie
o hoistowaniu. To chroni przed następnym pakietem, który wystąpi w dwóch wersjach. Przy
ciepłym magazynie kosztuje kilkanaście sekund.

`Dockerfile.panel` dostał tę samą poprawkę, mimo że jeszcze nie wybuchł. Naprawiona jedna
kopia i zostawiona druga to wzorzec, który dał w tym projekcie `Z-12`, `Z-16` i `X-24`.

## Znalezisko strukturalne: bramka nie obejmowała tego, co jedzie na serwer

Obraz `verris-api` — jedyny artefakt, który trafia na produkcję — powstawał **wyłącznie
w workflow wdrożeniowym**, czyli po scaleniu do `main`.

Bramka scalenia sprawdzała lint, typy, 605 testów jednostkowych, 61 integracyjnych, migracje
i asercje bazy. Nie sprawdzała tej jednej rzeczy.

Błąd był przy tym niewidoczny dla wszystkich pozostałych kroków: `pnpm build`
w repozytorium przechodzi, bo tam `node_modules` są kompletne. Rozjeżdżało się wyłącznie
w układzie plików **wewnątrz obrazu**.

CI dostało job `Obraz API (build bez push)`. Buduje bez pushowania — chodzi o to, czy build
przechodzi, nie o artefakt.

## Dwa razy uwierzyłem w wynik, który niczego nie dowodził

**Raz:** dodałem override i uruchomiłem instalację — 7.9.1 zostało. Wniosek „overrides nie
działają na peerach dociąganych automatycznie" był **fałszywy**: pnpm po prostu nie
przeliczył lockfile'a.

**Dwa:** powtórzyłem próbę na uproszczonym repozytorium — tym razem 7.9.1 zniknęło. Też nie
był to dowód: w tamtym katalogu nie było `package.json` z `apps/www`, czyli pakietu, który
7.9.1 ciągnie. Wynik wyglądał dobrze z niewłaściwego powodu.

Rozstrzygnięte dopiero na pełnym drzewie zależności. Ta sama rodzina co `Z-01` i `H-20`:
wynik, który zgadza się z oczekiwaniem, nie jest jeszcze dowodem.

## Testy

| Warstwa | Plik | Ile |
|---|---|---|
| jednostkowe | `apps/api/src/test/obrazy-dockera.spec.ts` | 14 |

**Czy czerwienią się na starym kodzie?** Tak — **7 z 14**: brak ponownej instalacji w obu
Dockerfile'ach (4) i brak joba w CI (3).

## Czego to nie robi

- **CI nie buduje obrazów paneli.** Mają własny Dockerfile, budują się ~2,5 minuty każdy
  i nie zawierają Prismy. Jeżeli kiedyś wywali się panel, ten job dostanie drugą pozycję
  w macierzy, a nie listę wyjątków.
- **Nie usuwa `@prisma/client` 7.x z drzewa u źródła.** Override wymusza 6.19.3 na
  opcjonalnym peerze, którego i tak nie używamy. Wyjście z Prismy 6 to `X-20`.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-18` | to jego skutek uboczny; podniesienie Payloada wciągnęło drugą Prismę |
| `X-20` | dopóki stoimy na Prismie 6, override musi zostać |
| `X-02` | bramka scalenia obejmuje teraz artefakt wdrożeniowy |
| `Z-12`, `Z-16`, `X-24` | ta sama rodzina: dwie kopie jednej reguły, poprawiona jedna |

## Dowód po

- `Dockerfile.api`, `Dockerfile.panel` — ponowna instalacja po `COPY libs libs`
- `package.json` — `pnpm.overrides` na `@prisma/client`
- `.github/workflows/ci.yml` — job `Obraz API (build bez push)`
- `apps/api/src/test/obrazy-dockera.spec.ts` — 14 testów

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

D3 powstanie przy pierwszym zielonym wdrożeniu.

**Stan w macierzy:** `DZIAŁA` / `PARYTET`
