# `X-17` — Joby CI budują zależności workspace'u zanim uruchomią testy

| | |
|---|---|
| **Sprint** | poza planem — naprawa regresji |
| **Priorytet** | WYSOKA |
| **Nakład** | ~1 h |
| **Zależy od** | — |
| **Status** | zamknięte w kodzie, czeka na przebieg CI |
| **Data** | 2026-08-22 |

---

## Problem

Job `API unit tests` był czerwony przez trzy wdrożenia — CI #54, #55 i #56 — podczas gdy
lokalnie świeciło 415 zielonych testów.

`@verris/database` ma `main: dist/index.js`. Bez zbudowanego `dist/` jest nie rozwiąże modułu
i **32 z 48 zestawów nie startują w ogóle** — nie failują, tylko się nie uruchamiają. Job
raportuje „210 passed" z 48 zestawów i wychodzi z kodem 1. W logu wygląda to jak awaria
testów; jest awarią konfiguracji.

## Skąd się wzięło

Przed `X-11` testy API biegły wewnątrz joba `static-checks`, którego krok `pnpm typecheck`
idzie przez Turbo. Zadanie `typecheck` ma w `turbo.json` `dependsOn: ["^build"]`, więc
biblioteki budowały się **przy okazji**. Nikt tego nie zaprojektował, więc nikt nie zauważył,
kiedy zniknęło.

`X-11` wydzieliło testy do własnego joba — słusznie, bo krok, który **dowodzi**, nie może stać
za krokiem, który sprawdza higienę. Ale nowy job nie budował niczego:

- `pnpm --filter api test` omija Turbo (pnpm woła skrypt pakietu wprost),
- zadanie `test` w `turbo.json` nie miało `dependsOn`.

Do tego drugi błąd, świeższy: krok `Seed reference data`, dodany do joba `migrations`
w commicie `d381a64`, woła seed importujący `@verris/database` — a ten job nigdy nie generował
klienta Prismy. Job przeszedł z zielonego na czerwony. Dodałem go tam po to, żeby asercje nie
przechodziły pusto, i przy okazji zepsułem coś, co działało.

## Dowód przed

```
CI #56, job „API unit tests":
  Cannot find module '@verris/database' from 'src/subscriptions/node-selector.service.ts'
  Test Suites: 32 failed, 16 passed, 48 total
  Tests: 210 passed, 210 total
  Exit status 1

CI #56, job „Prisma migrate deploy (smoke)":
  Module '"@prisma/client"' has no exported member 'PrismaClient'.
  Exit status 1

turbo.json:  "test": { "outputs": [] }          ← brak dependsOn
             "typecheck": { "dependsOn": ["^build"] }
```

## Rozwiązanie

Trzy poziomy, bo problem ma trzy warstwy:

1. **`api-tests`** dostaje jawny krok `Build workspace libraries` — dokładnie ten, który
   napisałem w jobie integracyjnym i który sprawił, że tamten przeszedł za pierwszym razem.
2. **`migrations`** dostaje `Generate Prisma client` przed seedem.
3. **`turbo.json`** — zadanie `test` dostaje `dependsOn: ["^build"]`, żeby `pnpm test` był
   poprawny również lokalnie i w każdym przyszłym jobie, a nie tylko tam, gdzie ktoś pamiętał
   o jawnym kroku.

Punkt 3 jest właściwą poprawką, punkty 1–2 są jej pasem bezpieczeństwa. Odwrotna kolejność
byłaby kuszącym skrótem: sam `dependsOn` nie zadziała dla `pnpm --filter api test`, bo to
wywołanie w ogóle nie przechodzi przez Turbo.

## Testy

`apps/api/src/test/ci-joby.spec.ts` — 6 testów. Przemiata `ci.yml`, rozkłada na joby po
wcięciu i sprawdza:

| Test | Co pilnuje |
|---|---|
| rozkład na joby | strażnik ma czego pilnować — minimum 5 jobów, w tym cztery po nazwie |
| budowanie bibliotek | każdy job uruchamiający testy buduje biblioteki albo woła `pnpm typecheck` |
| klient Prismy | każdy job wołający kod importujący `@verris/database` generuje klienta |
| `turbo.json` | zadanie `test` zależy od `^build` |
| job integracyjny | ma Postgresa, stosuje migracje, woła właściwą konfigurację jest |
| kontrola strażnika | rozpoznaje spreparowany job bez budowania |

Komunikat błędu podaje nazwę joba i **gotowy fragment YAML do wklejenia** — bo strażnik, który
mówi tylko „coś jest nie tak", kosztuje tyle samo czasu co brak strażnika.

**Czy czerwieni się na złej konfiguracji?** Tak — usunięcie kroku budowania z `api-tests`
zapala test ze wskazaniem `api-tests`.

### Strażnik skłamał za pierwszym razem

Pierwsza wersja używała wzorca `\bjest\b` i trafiała w **polskie słowo „jest"** w moich własnych
komentarzach w `ci.yml`. Fałszywy alarm w narzędziu, którego jedynym zadaniem jest nie kłamać.

Poprawione: komentarze wypadają przed dopasowaniem, a wzorzec zawężony do faktycznych wywołań
(`jest --config`, `npx jest`, `pnpm --filter X test`, `pnpm test`, `turbo run test`). Stąd
osobny test kontrolujący samo rozpoznawanie.

## Dowód po

- `.github/workflows/ci.yml` — kroki w `api-tests` i `migrations`
- `turbo.json` — `test.dependsOn`
- `apps/api/src/test/ci-joby.spec.ts` — 6 testów

**Osiągnięty poziom dowodu:**
- [x] D1 · [ ] D2 · [ ] D3 · [ ] D4

**D1, nie D2** — i to jest cała lekcja tej pozycji. Testy przechodzą lokalnie, ale pozycja
dotyczy CI, więc dowodem jest **zielony przebieg CI**, nie zielony pakiet na moim laptopie.
Poziom podniosę po obejrzeniu przebiegu, nie wcześniej.

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`

## Wniosek do zapisania

`X-11` zgłosiłem jako zamknięte, nie otwierając ani razu przebiegu CI, którego ta pozycja
dotyczyła. Miałem zielone testy lokalne i uznałem to za wystarczające.

**Pozycja dotycząca CI nie może być zamknięta bez obejrzenia przebiegu, którego dotyczy.**
Dopisane do notatki przy `X-11` jako korekta, żeby ta pomyłka została w historii zamiast
zniknąć razem z poprawką.

Warto też zauważyć, co zadziałało: job integracyjny z `X-04` przeszedł za pierwszym razem
właśnie dlatego, że przy jego pisaniu **pomyślałem o zbudowaniu bibliotek**. Ta sama myśl nie
wróciła do joba, który już istniał.

## Czego to nadal nie robi

- **Nie sprawdza, czy job jest wymagany w rulesecie.** Konfiguracja branch protection nie leży
  w repozytorium (patrz `X-02`), więc żaden test jej nie dosięgnie. Czerwony job na gałęzi
  roboczej nadal nikogo nie zatrzyma — zatrzyma dopiero przy scalaniu do `main`.
- **Nie wykrywa nowych pakietów workspace'u.** Lista budowanych bibliotek jest wypisana wprost
  w `ci.yml`; dodanie czwartej biblioteki wymaga dopisania jej ręcznie. Strażnik tego nie
  złapie, bo nie wie, których pakietów potrzebują testy.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-11` | koryguje — podział jobów zostawił job czerwony, notatka uzupełniona |
| `X-01` | przywraca sens — bramka testowa znów faktycznie uruchamia testy |
| `X-04` | odblokowuje — job integracyjny może dołączyć do rulesetu po zielonym przebiegu |
| `X-02` | przypomina — czerwony job na gałęzi roboczej nie blokuje niczego do momentu scalania |
