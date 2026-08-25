# `X-40` — Test, którego nikt nigdy nie uruchomił

**Status:** kod gotowy, czeka na `pnpm install` i przebieg bramki.
**Rodowód:** ograniczenie odnotowane trzy razy z rzędu — w X-37, X-38 i X-39.

---

## Co było

`apps/client-panel/src/lib/client-nav-access.spec.ts` — 50 linii, cztery
asercje sprawdzające, do których tras dashboardu ma dostęp subkonto. Leżał
w repo miesiącami i **nie wykonał się ani razu.**

Złożyły się na to dwie rzeczy, z których każda z osobna wygląda rozsądnie:

```
apps/client-panel/package.json   → brak skryptu `test`
.github/workflows/{ci,deploy}    → run: pnpm --filter api test
```

Pakiet nie miał czym uruchomić testu, a bramka i tak wołała tylko jeden pakiet.
Trzecia warstwa dla pewności: `apps/client-panel/tsconfig.json` ma
`**/*.spec.ts` w `exclude`, więc specu nie sprawdzał nawet kompilator.

**Test, którego nikt nie uruchamia, jest gorszy niż jego brak.** Brak widać —
martwy spec wygląda jak pokrycie i zniechęca do napisania prawdziwego.

## Prawdziwy koszt

Nie chodziło o jeden plik. Chodziło o to, że **panel nie miał gdzie wykonać
kodu w teście**, więc przy każdej dzisiejszej naprawie strażnik musiał czytać
źródło zamiast je uruchamiać:

| zadanie | strażnik | forma dowodu |
|---|---|---|
| X-37 | `adres-api-po-stronie-serwera` | czyta źródło paneli |
| X-38 | `panel-mowi-co-sie-stalo` | wykonuje `blad-sieci` (bo przeniesiony do `libs/`), resztę czyta |
| X-39 | `dashboard-nie-udaje-zera` | czyta źródło, w całości |

Strażnik czytający źródło sprawdza, jak kod **wygląda**, a nie jak się
**zachowuje**. Łapie literówkę w nazwie zmiennej; nie złapie odwróconej
logiki. Przy X-38 obszedłem to, przenosząc czystą funkcję do `libs/contracts` —
i to jest właściwa odpowiedź, ale tylko dla logiki bez zależności. Kodu, który
korzysta z `next/headers`, nie przeniesiemy nigdzie.

## Rozwiązanie

**Runner w pakiecie.** `jest` + `ts-jest` w wersjach identycznych z `apps/api`
(`jest@^30.4.2`, `ts-jest@^29.4.12`), `jest.config.cjs` z aliasem `@/`
i `tsconfig.spec.json`, który jako jedyny widzi pliki testów. `testRegex`
obejmuje też `.tsx`, choć dziś żaden spec ich nie używa — inaczej pierwszy test
komponentu znów wpadłby w ciszę.

**Bramka woła cały workspace.** W `ci.yml` i `deploy.yml`:

```diff
-      - name: API unit tests
-        run: pnpm --filter api test
+      - name: Testy jednostkowe (wszystkie pakiety)
+        run: pnpm test
```

`pnpm test` idzie przez Turbo, a zadanie `test` ma już `dependsOn: ["^build"]`
(pilnuje tego `ci-joby.spec.ts` od X-17), więc biblioteki workspace’u budują się
przed testami. Obejmuje każdy pakiet, który skrypt `test` ma dziś — i każdy,
który go dopiero dostanie.

**Identyfikator joba `api-tests` zostaje bez zmian**, mimo że nazwa przestała
być ścisła. Zmiana identyfikatora rozjechałaby wymagane statusy w ochronie
gałęzi i zablokowała merge — to nie jest cena warta ładniejszej nazwy.
Zmieniona została etykieta kroku, nie job.

## Strażnik

`apps/api/src/test/kazdy-spec-ma-runner.spec.ts` sprawdza **oba warunki naraz**,
bo defekt polegał na tym, że każda połowa z osobna wyglądała sensownie:

1. pakiet zawierający pliki `*.spec.ts(x)` musi deklarować skrypt `test`,
2. `ci.yml` i `deploy.yml` muszą wołać polecenie obejmujące cały workspace.

Sam skrypt bez wywołania nic nie daje. Samo wywołanie bez skryptu — też nie.

Do tego asercja szczegółowa dla panelu: skrypt, `jest.config.cjs`, oraz
`tsconfig.spec.json` z `module: commonjs` — plus sprawdzenie, że główny
tsconfig **nadal** wyklucza specy, bo gdyby przestał, ten osobny plik byłby
zbędny i ktoś powinien go wtedy usunąć świadomie, a nie zostawić martwym.

### Czwarta odsłona tej samej pułapki

Strażnik wycina komentarze YAML, zanim zacznie szukać poleceń. Bez tego czytałby
komentarz opisujący **stare** polecenie tak samo jak prawdziwy krok — a taki
komentarz właśnie dopisałem do obu workflow. To czwarty raz w tym repo:
`noDataState` (X-35), `.catch(() => null)` (X-39), import względny (X-38),
teraz to. Reguła jest utrwalona i zapisana w kodzie: **skanujesz źródło —
najpierw odetnij prozę.**

### Pierwszy przebieg pokazał usterkę konfiguracji

`jest` zgłosił `Haste module naming collision: @verris/client-panel` — skanował
`.next/standalone/apps/client-panel/package.json`, czyli WYNIK builda obok
źródła. Samo ostrzeżenie jest nieszkodliwe, ale pierwszy test importujący moduł
panelu mógłby dostać kopię ze `standalone` zamiast kodu ze `src`, czyli
sprawdzać poprzedni build. Dodane `modulePathIgnorePatterns: ['<rootDir>/.next/']`.

To dobra ilustracja tezy tego zadania: usterka istniała od momentu napisania
konfiguracji i była widoczna **dopiero po uruchomieniu**. Strażnik czytający
źródło nie miałby jej jak zobaczyć.

## Czego to NIE naprawia

- **Nie przepisałem żadnego wcześniejszego strażnika na wykonywanie kodu.**
  `dashboard-nie-udaje-zera` nadal czyta źródło, bo `getDashboardSnapshot`
  ciągnie `next/headers`. Runner jest warunkiem koniecznym, nie wystarczającym —
  do wykonania tamtego trzeba by dołożyć mocki modułów Next.
- **`client-nav-access.spec.ts` nie był przeze mnie przejrzany co do treści.**
  Uruchomił się po raz pierwszy 2026-08-25 i **przeszedł** — `jest` bez
  `--passWithNoTests` kończy się błędem przy braku testów, więc kod wyjścia 0
  dowodzi, że spec się wykonał. Opisywał więc aktualny stan; mieliśmy szczęście,
  bo równie dobrze mógł od miesięcy opisywać nieistniejące zachowanie.
- **Nie ma testów komponentów.** Konfiguracja je dopuszcza (`.tsx`,
  `jsx: react-jsx`), ale brakuje `@testing-library/react` i środowiska `jsdom`.
- **Czas bramki wzrośnie**, o tyle, ile trwają testy panelu. Dziś to ułamek
  sekundy; przy pierwszym teście komponentu trzeba to zmierzyć ponownie.

## Do backlogu

1. **Przegląd `client-nav-access.spec.ts`** — pierwszy przebieg pokaże, czy
   opisuje aktualny stan.
2. **Wykresy przy awarii** (`DashboardCharts`) — pusty wykres nieodróżnialny
   od pustych danych; ta sama rodzina co X-39.
3. **Egress kontenerów poza hardeningiem X-36** — łańcuchy wiszą w OUTPUT,
   ruch aplikacji idzie przez FORWARD.
