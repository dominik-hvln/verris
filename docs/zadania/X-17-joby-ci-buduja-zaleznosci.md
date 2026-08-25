# `X-17` — Joby CI budują zależności workspace'u zanim uruchomią testy

| | |
|---|---|
| **Sprint** | poza planem — naprawa regresji |
| **Priorytet** | WYSOKA |
| **Nakład** | ~1 h |
| **Zależy od** | — |
| **Status** | zamknięte |
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
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**D1 → D2, 2026-08-25.** Pierwotna notatka brzmiała: „poziom podniosę po obejrzeniu przebiegu,
nie wcześniej". Stała tak trzy dni — nie dlatego, że o niej zapomniałem, tylko dlatego, że
`ci.yml` na `main` był w tym czasie czerwony na jobie `Static checks` (`client-panel#lint`,
brak wtyczki `react-hooks` — patrz `X-42`). Przebieg, o który tu chodziło, po prostu nie
istniał do dzisiaj. To warto zapisać osobno: **pozycja czekająca na zielony przebieg jest
zakładniczką każdej innej czerwieni w tym samym workflow.**

### Przebieg CI #120 — `8aec15fa`, 2026-08-25 12:49 UTC

Siedem jobów, wszystkie `success`. Poniżej odczyt z **logu**, nie ze statusu joba:

| Job → krok | Odczyt z logu |
|---|---|
| `API unit tests` → `Build workspace libraries` | `Scope: 3 of 13 workspace projects`, `libs/database build: Done`, `libs/directadmin-sdk build: Done` |
| `API unit tests` → `Testy jednostkowe (wszystkie pakiety)` | `Test Suites: 75 passed, 75 total` / `Tests: 780 passed, 780 total` |
| `API integration tests` → `Build workspace libraries` | ten sam zestaw bibliotek, `Done` na obu |
| `API integration tests` → `Run integration tests` | `Test Suites: 6 passed, 6 total` / `Tests: 61 passed, 61 total` |
| `Prisma migrate deploy (smoke)` → `Generate Prisma client` | `✔ Generated Prisma Client (v6.19.3)` |
| `Cannot find module '@verris/database'` | zero wystąpień w całym logu przebiegu |

Kluczowa liczba to **75 zestawów, nie 16**. Objawem opisanym wyżej nie był czerwony job —
był job, który raportował „210 passed" z 48 zestawów, bo 32 nie startowały w ogóle. Zielony
job z 16 zestawami wyglądałby w `gh run view --json jobs` dokładnie tak samo jak ten. Dlatego
dowodem jest liczba zestawów w logu, a `conclusion: success` sam z siebie nie dowodzi niczego.

Liczby zgadzają się co do jednego z lokalnym `pnpm test` (75 / 780). To znaczy, że w CI
uruchomił się **ten sam zbiór**, a nie podzbiór, który akurat nie potrzebował `dist/`.

Przy okazji potwierdziło się `X-40`: w logu jest osobne `Test Suites: 1 passed` /
`Tests: 4 passed` — to `client-panel`, którego jedyny spec do `X-40` nie miał runnera i nigdy
się nie uruchamiał. Teraz biegnie w CI.

**Dlaczego nie D3.** Pozycja dotyczy konfiguracji CI. `ci.yml` nie dociera na produkcję, więc
nie ma tam czego obserwować — D3 dla tej pozycji nie istnieje i zostaje odznaczone na stałe.

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
- **Nie zauważa pozycji na liście, która nic nie robi.** W logu #120 widać `Scope: 3 of 13`,
  ale linie `build` są dwie. `@verris/contracts` ma `main: src/index.ts` i **nie ma skryptu
  `build`** — jest konsumowany ze źródeł, więc `pnpm --filter @verris/contracts run build`
  cicho nic nie robi. Dziś to nieszkodliwe. Przestanie takie być w dniu, w którym contracts
  dostanie `dist/`: krok będzie wyglądał na poprawny, bo nazwa pakietu jest na liście od
  dawna, a `pnpm` nie zgłasza brakującego skryptu jako błędu.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-11` | koryguje — podział jobów zostawił job czerwony, notatka uzupełniona |
| `X-42` | odblokowuje wstecz — dopóki `Static checks` był czerwony, ta pozycja nie miała jak dostać D2 |
| `X-40` | potwierdza — w #120 widać osobny przebieg specu `client-panel` (1 zestaw / 4 testy) |
| `X-01` | przywraca sens — bramka testowa znów faktycznie uruchamia testy |
| `X-04` | odblokowuje — job integracyjny przeszedł w #120 (6 zestawów / 61 testów), może dołączyć do rulesetu |
| `X-02` | przypomina — czerwony job na gałęzi roboczej nie blokuje niczego do momentu scalania |
