# `X-21` — Deklaracje typów opisywały inną wersję biblioteki niż zainstalowana

| | |
|---|---|
| **Sprint** | poza planem — błąd produkcyjny znaleziony przy X-18 |
| **Priorytet** | WYSOKA |
| **Nakład** | ~2 h |
| **Zależy od** | — |
| **Status** | zamknięte |
| **Data** | 2026-08-22 |

---

## Problem

`apps/api/package.json` deklarował jednocześnie:

```json
"archiver": "^8.0.0",
"@types/archiver": "^7.0.0"
```

Archiver 8 usunął fabrykę `create()` na rzecz klas per format. Kod wołał
`archiver.create('zip', …)` i `archiver.create('tar', …)`. **Typecheck był zielony** — bo typy
z linii 7 tę funkcję opisywały. W runtime jej nie było.

Sprawdzone realnie, nie założone:

```
$ node -e "const a=require('archiver'); console.log(Object.keys(a), typeof a.create)"
[ 'Archiver', 'JsonArchive', 'TarArchive', 'ZipArchive' ] undefined
```

### Co to psuło

| Ścieżka | Skutek |
|---|---|
| `data-export.service.ts` → `buildZipToFile` | eksport danych osobowych (RODO art. 20, prawo do przenoszenia) wywalał się przy **każdym** żądaniu |
| `default-hosting-page.assets.ts` → `buildDefaultHostingPageBundle` | budowa paczki domyślnej strony hostingowej wywalała się przy **każdym** provisioningu konta |

Nie „czasem", nie „przy dużych plikach". Zawsze, od momentu podniesienia archivera do 8.
Obie ścieżki są produkcyjne, jedna z nich jest obowiązkiem ustawowym.

## Dlaczego nikt tego nie zobaczył

Bo wszystkie trzy bramki patrzyły w bok:

- **typecheck** — czytał typy, a typy opisywały nieistniejącą wersję,
- **testy** — żaden nie dotykał tych dwóch funkcji (eksport RODO pisze na dysk, paczka
  hostingowa czyta z `ops/`),
- **lint** — nie ma reguły na „ta metoda nie istnieje w runtime".

To jest sedno tej pozycji. Typecheck jest u nas bramką wdrożenia. Jeżeli typy opisują inną
wersję biblioteki niż zainstalowana, **bramka przepuszcza kod, który się nie uruchomi** — i robi
to cicho, bez ostrzeżenia, na zielono.

## Drugie znalezisko: archiver 8 jest czystym ESM-em

Przy pisaniu testu okazało się, że problem ma jeszcze jedno dno. Archiver 8 ma
`"type": "module"` i wyłącznie `exports`, bez wejścia CommonJS. API kompiluje się do
CommonJS-a, więc `import * as archiver from 'archiver'` staje się `require('archiver')`.

Node obsługuje `require(esm)` bez flagi **dopiero od 22.12**. A `engines.node` w korzeniu
stał na `">=22"`.

Czyli: wdrożenie na Node 22.5 dałoby `ERR_REQUIRE_ESM` w tych samych dwóch ścieżkach, tym
razem już przy samym ładowaniu modułu. Obrazy produkcyjne używają taga `node:22` (dziś
22.22), więc realnie nic się nie paliło — ale deklaracja pozwalała na konfigurację, która by
się paliła. `engines.node` podniesione do `">=22.12"`.

## Rozwiązanie

1. `@types/archiver` → `^8.0.0` (domyka też PR-a Dependabota #11).
2. Oba wywołania przepisane na klasy: `new archiver.ZipArchive({ zlib: { level: 6 } })`
   i `new archiver.TarArchive({ gzip: true })`.
3. `engines.node` → `">=22.12"`.
4. Strażnik na **całą klasę błędu**, nie na sam archiver.

## Testy

`apps/api/src/test/typy-zgodne-z-runtime.spec.ts` — 15 testów.

| Test | Co pilnuje |
|---|---|
| widzi package.json całego monorepo | strażnik ma czego pilnować — min. 8 paczek, w tym API |
| znajduje realne pary `@types/X` + `X` | min. 10 par, w tym `@types/archiver` — granica pustego przejścia |
| **żadne `@types/X` nie opisuje innego majora niż `X`** | **właściwa reguła** |
| rozpoznaje spreparowany rozjazd | kontrola samego wykrywania |
| nie zgłasza `@types` bez runtime'u | `@types/node` i podobne nie są rozjazdem |
| `engines.node` ≥ 22.12 | klasa `ERR_REQUIRE_ESM` |
| mapuje `@types/babel__core` → `@babel/core` | konwencja nazw DefinitelyTyped |
| daje się wczytać z CommonJS-a | archiver realnie ładowalny z CJS |
| wystawia klasy per format, nie `create()` | API zgodne z tym, co woła kod |
| instancje mają `.directory` i `.finalize` | metody używane produkcyjnie istnieją |
| ZIP ze stringa, JSON-a i strumienia | wszystkie trzy tryby `append` z eksportu RODO |
| powstały ZIP jest poprawnym archiwum | sygnatura `PK\x03\x04`, trzy wpisy, domknięty centralny katalog |
| tar.gz powstaje z katalogu | ścieżka paczki domyślnej strony |
| żadne źródło nie woła `archiver.create()` | regresja wywołania |
| wykrywanie rozpoznaje wywołanie, nie komentarz | kontrola strażnika |

Trzy testy „dymne" przejeżdżają powierzchnię API, z której korzystają obie ścieżki produkcyjne:
`append` stringa, `append` JSON-a, `append` strumienia `Readable`, `pipe`, `finalize`, zdarzenie
`close` — oraz `directory`, `data`, `end` dla tara. **Zakres: to pilnuje archivera, nie naszych
serwisów.** Test budujący eksport RODO z prawdziwych danych to `X-22`.

**Czy czerwieni się na starym kodzie?** Tak — cofnięcie wszystkich trzech rzeczy naraz
(`@types/archiver` do `^7`, `engines.node` do `">=22"`, wywołanie do `archiver.create('zip', …)`)
daje **3 czerwone z 15**, każdy z osobnym, wykonalnym komunikatem:

```
apps/api/package.json: @types/archiver=^7.0.0 opisuje archiver=^8.0.0
   → podnieś @types/archiver do linii 8.x albo cofnij archiver do linii 7.x

engines.node w korzeniu (">=22") nie podaje wersji minorowej — archiver 8
   jest czystym ESM-em i wymaga require(esm) z Node ≥ 22.12

Wywołanie usuniętej fabryki archivera — użyj new archiver.ZipArchive(…)
   albo new archiver.TarArchive(…):
     compliance/data-export.service.ts
```

### Introspekcja w osobnym procesie, nie przez `require` w jeście

Test runtime'u wywołuje `execFileSync(process.execPath, ['-e', …])` zamiast `require`.
Powód: transformacja jesta nie ładuje zależności ESM i wywala się na „Cannot use import
statement outside a module" — czyli test sprawdzałby ładowarkę modułów jesta zamiast
produkcji. Osobny proces mierzy to, co naprawdę zobaczy serwer.

### Strażnik znowu trafił sam w siebie

Reguła „żadne źródło nie woła `archiver.create()`" wykryła **własny plik**, bo szukana fraza
pada w treści komunikatu błędu. Dokładnie ta sama pułapka co polskie słowo „jest" w `X-17`.

Poprawione przez pominięcie `__filename`, z osobnym testem na spreparowanym wejściu, żeby
pominięcie nie wyłączyło wykrywania po cichu. **Trzeci raz ten sam wzorzec w tym projekcie:
strażnik czytający źródła musi być odporny na to, że sam jest źródłem.**

## Przy okazji — dwie rzeczy domknięte w tym samym przebiegu

**`body-parser`** (niska, DoS przy cichym wyłączeniu limitu rozmiaru) — wchodził przechodnio
przez `express@5.2.1` z `@nestjs/platform-express`. Domknięty przez `pnpm.overrides`:
`"body-parser": "^2.3.0"`. Podatności: **2 → 1**.

**`graphql`** — przy X-18 podniosłem go do `^17.0.2`, a jedynym konsumentem jest Payload 3.88,
który deklaruje peera `^16.8.1`. Nasz kod nie importuje `graphql` ani razu — pakiet siedzi
w `apps/www` wyłącznie po to, żeby Payload miał czym obsłużyć `/api/graphql`. Podniesienie
majora pod biblioteką, która go nie wspiera, to nie jest „najnowsza wersja", tylko
niesprawdzona konfiguracja na publicznej stronie. Cofnięte do `^16.14.2`, build `www`
przechodzi, ostrzeżenie o peerze znikło.

To jest korekta mojego własnego błędu z X-18: podniosłem wersję, bo była wyższa, nie
sprawdzając, kto z niej korzysta.

## Czego to nadal nie robi

- **Nie sprawdza zależności przechodnich.** Reguła obejmuje tylko pary zadeklarowane w tym
  samym `package.json`. Gdyby jakaś biblioteka ciągnęła własne, rozjechane `@types`, strażnik
  ich nie zobaczy.
- **Nie wykrywa rozjazdu w obrębie majora.** `@types/express@5.0.0` przy `express@5.2.1` przechodzi,
  choć minor też potrafi dołożyć API. Świadomie — zaostrzenie do minora dawałoby czerwień
  przy każdym Dependabocie i strażnik szybko zostałby wyciszony.
- **Nie testuje samego eksportu RODO.** Nadal nie ma testu, który buduje ZIP-a z prawdziwymi
  danymi i sprawdza jego zawartość. To osobna pozycja — patrz niżej.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-18` | koryguje — `graphql` cofnięty do 16, `body-parser` domknięty, podatności 2 → 1 |
| `X-22` | **nowa** — eksport RODO bez testu end-to-end; to on powinien był złapać ten błąd |
| `Z-03` | potwierdza regułę: każda poprawka dostaje test, który czerwieni się na starym kodzie |
| `X-17` | ten sam wzorzec strażnika trafiającego sam w siebie, trzeci raz |

## Dowód po

- `apps/api/package.json` — `@types/archiver: ^8.0.0`
- `apps/api/src/compliance/data-export.service.ts:419`
- `apps/api/src/servers/default-hosting-page.assets.ts:34`
- `package.json` — `engines.node: ">=22.12"`, override `body-parser`
- `apps/www/package.json` — `graphql: ^16.14.2`
- `apps/api/src/test/typy-zgodne-z-runtime.spec.ts` — 15 testów

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

D2 — 436 testów jednostkowych i 15 integracyjnych na zielono, lint 7/7, typecheck 8/8,
build `www`. **D3 wymaga wywołania eksportu RODO na produkcji** i obejrzenia pliku, którego
nie da się dziś zrobić, bo produkcji jeszcze nie ma. Dopisane do `X-22`.

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`

## Wniosek do zapisania

Podniesienie zależności odsłoniło błąd, który siedział w kodzie **przed** podniesieniem —
i to nie dlatego, że coś zepsułem, tylko dlatego, że przy okazji zajrzałem tam, gdzie
typecheck nie zaglądał.

Warto to zapamiętać przy kolejnych podniesieniach: **`@types/*` to nie jest kosmetyka.**
To jedyne źródło prawdy dla bramki typów, a jeśli kłamie, bramka przestaje cokolwiek chronić
i nikt się o tym nie dowie do pierwszego wywołania na produkcji.
