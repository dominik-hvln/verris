# `X-01` — CI uruchamiające testy

| | |
|---|---|
| **Sprint** | 1 (2026-08-21) |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 6 h · rzeczywisty 3 h |
| **Zależy od** | — |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 (CI #18) |

---

## Problem

Testy istnieją, ale nikt ich nie uruchamia. Skutek jest taki, że każda naprawa w tym projekcie ma poziom dowodu D1 („kod istnieje") i żadna nie ma D2. Bez tego cały audyt jest zbiorem twierdzeń, a nie dowodów — i dokładnie tak powstał czerwcowy start z otwartymi blokerami.

## Dowód przed

**Najpierw sprostowanie, bo ono jest częścią tej historii.**

Pierwotny zapis w macierzy brzmiał:

```
katalog .github NIE ISTNIEJE; brak .gitlab-ci, Jenkinsfile, .circleci, .husky
```

**To był mój błąd.** Archiwum źródeł, na którym prowadziłem audyt, nie zawierało katalogu `.github` (wykluczyłem go przy pakowaniu). Podagent zameldował „nie ma tego w archiwum", a ja odczytałem to jako „nie ma tego w repozytorium". Różnica jest zasadnicza i przez kilka godzin szła jako nagłówek raportu.

**Stan faktyczny przed zmianą:** `.github/workflows/ci.yml` istniał i był sensowny — typecheck, testy API, build, smoke migracji Prisma, gitleaks, `pnpm audit`, Trivy, dependabot. Problem był inny i mniej oczywisty:

```yaml
# .github/workflows/ci.yml (przed)
on:
  push:
    branches: [main, master]
```

Praca toczy się na `feature/support-v2`, która jest **301 commitów przed `main`**. Workflow był poprawny i nie uruchamiał się nigdy. Efekt netto identyczny jak brak CI, przyczyna zupełnie inna — i gdyby audyt został przy „nie ma CI", ktoś napisałby drugi plik obok istniejącego.

**Stan w macierzy przed:** `BRAK` (błędnie) → faktycznie `CZĘŚCIOWE`

## Rozwiązanie

Jedna zmiana w wyzwalaczach:

```yaml
on:
  push:
    branches: ['**']
  pull_request:
  workflow_dispatch:
```

**Dlaczego `'**'`, a nie lista gałęzi.** Lista wymaga pamiętania o dopisywaniu do niej i to właśnie zawiodło. Wzorzec `'**'` nie ma stanu, który mógłby się rozjechać z rzeczywistością. Koszt: minuty CI na gałęziach roboczych — przy jednoosobowym zespole to nie jest problem.

`workflow_dispatch` dołożone, żeby dało się uruchomić przebieg ręcznie bez pustego commita.

**Czego świadomie nie zrobiłem.** Nie dotykałem zawartości jobów — istniejące kroki są dobre i przepisywanie ich przy okazji naprawy wyzwalacza mieszałoby dwie zmiany w jednym commicie. Nie dodawałem cache'owania pnpm ani macierzy wersji Node — to optymalizacja, a najpierw musi być cokolwiek zielonego.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `.github/workflows/ci.yml` | wyzwalacz `push` na wszystkie gałęzie + `pull_request` + `workflow_dispatch` |

Migracje bazy: brak
Zmienne środowiskowe: brak

> **Uwaga operacyjna.** Katalog `.github` jest chroniony przed zapisem z mostka do dysku, którym pracuję. Zmiana została dostarczona jako łatka `plan-startowy-2026-08/sprint1-workflows.patch` i nałożona przez PM-a poleceniem `git apply`. Przy kolejnych zmianach w workflow-ach ta sama droga.

## Testy

CI nie jest funkcją produktu i nie ma własnego testu jednostkowego — dowodem jest sam przebieg. Natomiast **warunkiem sensowności tej zmiany był zielony zestaw**, bo bramka, która zawsze świeci na czerwono, zostaje wyłączona po tygodniu. Dlatego w tym samym sprincie poszło porządkowanie zestawu (`docs/zadania/` → commit `55ab558`): 37 zestawów, 194 testy, wszystkie zielone.

**Czy test najpierw czerwienił się na starym kodzie?** Nie dotyczy.

## Dowód po

`.github/workflows/ci.yml` — sekcja `on:`

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] **D2 — testy przechodzą w CI.** Przebieg **CI #18**, commit `e122ae4`, 2026-08-21, 2m 17s.
      Cztery joby zielone; krok „API unit tests": **37 zestawów, 194 testy, wszystkie przeszły**.
- [ ] D3 — nie dotyczy
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** `DZIAŁA`

Do momentu przebiegu było tu `CZĘŚCIOWE` — zgodnie z zasadą, że nic poniżej D2 nie jest zrobione, a D2 oznaczało konkretnie: widoczny, zielony przebieg w zakładce Actions. Teraz taki przebieg jest.

### Co odsłonił pierwszy przebieg

Run **#17** (commit `4b3b889`) był czerwony i to jest najlepszy argument za tym zadaniem. Dwie rzeczy, obie zastane, obie niewidoczne przez miesiące:

1. **`aquasecurity/trivy-action@0.24.0` nie istnieje.** To repozytorium taguje z przedrostkiem `v`. Job padał po dwóch sekundach, przed checkoutem.
2. **`apps/www` nie przechodził typechecku.** `sitemap.ts:34,35` — Payload typuje `res.docs` jako `(JsonObject & TypeWithID)[]`, a kod adnotował parametry callbacków węższym kształtem.

Punkt 2 miał konsekwencję, której nie widać na pierwszy rzut oka: **testy API stoją w tym samym jobie, w kroku PO typechecku.** Dopóki typecheck padał, `pnpm --filter api test` nie uruchomiło się ani razu — więc CI działało, a dowodu D2 nadal nie było. Naprawione w `e122ae4`, potwierdzone w #18.

Warto to zapamiętać przy projektowaniu kolejnych jobów: **krok, który dowodzi, nie powinien stać za krokiem, który tylko sprawdza higienę.** Rozdzielenie testów do własnego jobu jest w backlogu.

## Czego to nadal nie robi

- Nie wymusza niczego przy merge — to `X-02` (ustawienie po stronie GitHuba, nie da się go zapisać w repo).
- Nie chroni ręcznej ścieżki wdrożenia `ops/scripts/prod-deploy-ghcr.sh` — to `X-03`.
- Nie mierzy pokrycia. Świadomie: pokrycie procentowe jako kryterium GO jest w tej metodzie zakazane, bo pozwala odhaczyć zieloność bez sprawdzenia właściwych rzeczy.

## Ryzyko i wycofanie

Ryzyko jest odwrotne niż zwykle: nie że coś się zepsuje, tylko że pierwszy przebieg będzie czerwony z powodu różnicy między moim środowiskiem a CI. U mnie klient Prismy nie generuje się w ogóle (`binaries.prisma.sh` zwraca 403), więc pracuję na atrapie `@verris/database`. W CI Prisma wygeneruje się naprawdę i może odsłonić przypadki, których atrapa nie pokazuje.

Wycofanie: przywrócenie dwóch linii w `on:`. Zero wpływu na produkcję — `ci.yml` nic nie wdraża.

## Wpływ na inne pozycje

- Odblokowuje poziom D2 dla **wszystkich** pozycji macierzy — to jest właściwy powód, dla którego to zadanie jest pierwsze.
- `X-02` i `X-03` mają sens dopiero po nim.
