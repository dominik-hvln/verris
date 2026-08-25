# `X-42` — Zielone wdrożenie obok czerwonego CI

**Status:** defekt 1 (ESLint) potwierdzony w CI #120. Defekt 2 (krok `Lint`
w `deploy.yml`) czeka na przebieg wdrożenia — dodany krok nigdy jeszcze nie biegł.
**Rodowód:** próba zebrania D2 dla `X-17` — okazało się, że nie ma czego zbierać,
bo `ci.yml` jest czerwony.

---

## Dwa defekty, jeden objaw

### 1. Nadpisanie reguł poza zasięgiem konfiguracji, którą nadpisuje

`apps/client-panel/eslint.config.mjs` kończył się blokiem:

```js
{ rules: ODSLONIETE_PRZEZ_NEXT_16 },
```

Bez klucza `files`, więc stosował się do **każdego** pliku w pakiecie.
Tymczasem `eslint-config-next@16.3.2` rejestruje plugin `react-hooks` tylko dla:

```js
files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}']
```

Jest `cts`. **Nie ma `cjs`.**

Działało, dopóki wszystkie pliki konfiguracyjne panelu miały rozszerzenie
`.mjs` — `postcss.config.mjs`, `eslint.config.mjs`. `X-40` dołożyło
**`jest.config.cjs`**, pierwszy plik poza tym wzorcem, i ESLint zaczął słusznie
protestować:

```
A configuration object specifies rule "react-hooks/set-state-in-effect",
but could not find plugin "react-hooks".
```

Nie znajdował go, bo dla `.cjs` nikt go nie zarejestrował.

**Poprawka:** blok dostaje ten sam wzorzec `files`, co konfiguracja, którą
nadpisuje. Nadpisanie cudzych reguł ma sens wyłącznie w zasięgu tych reguł.

### 2. Bramka wdrożenia była słabsza od bramki gałęzi

`ci.yml` odpalał `pnpm lint`, `pnpm typecheck` i testy.
`deploy.yml` odpalał typecheck i testy. **Lintu nie.**

Skutek: trzy wdrożenia przeszły zielono przy czerwonym `ci.yml`, a kod
z zepsutą konfiguracją trafił na produkcję — przez bramkę, która po prostu nie
zadawała tego pytania.

**Poprawka:** `deploy.yml` dostaje krok `Lint`.

## Jak to znaleźliśmy — i czego to dowodzi o naszym sposobie pracy

Nie szukaliśmy tego. Chcieliśmy zebrać D2 dla `X-17`, którego dowodem jest
„zielony przebieg CI". Przy pierwszym `gh run list` okazało się, że zielonego
przebiegu nie ma od godziny.

`X-17` istnieje dokładnie dlatego, że przy `X-11` zamknięto pozycję dotyczącą
CI bez obejrzenia przebiegu CI. Dziś ta sama pozycja, przy próbie domknięcia
zgodnie z własną lekcją, ujawniła kolejną warstwę tego samego błędu: patrzyliśmy
na `deploy.yml` i braliśmy go za „CI".

**Zielone jedno nie dowodzi zielonego drugiego.** Dwie bramki sprawdzające
różne rzeczy rozjeżdżają się cicho i nikt nie dostaje o tym sygnału.

## Błędna hipoteza, którą warto zapisać

Pierwsze podejrzenie padło na `pnpm install` z `X-40` — instalację bez
`--frozen-lockfile`, którą sam zaleciłem. Wersja `eslint-plugin-react-hooks`
faktycznie mogła się przy niej podnieść, a moment awarii zgadzał się co do
commita.

Sprawdzenie tej hipotezy zajęło kilka minut i **obaliło ją**: interop w
`eslint-config-next` działa poprawnie (plugin nie ma `__esModule`, więc
`_interop_require_default` zwraca cały moduł), a wszystkie cztery reguły
z naszej listy istnieją w 7.1.1. Gdybym wdrożył „naprawę" opartą na tej
hipotezie — przypięcie starszej wersji albo jawna rejestracja pluginu —
objaw prawdopodobnie by zniknął, a przyczyna została.

Zbieżność w czasie wskazała **właściwy commit** i **niewłaściwy mechanizm**.

## Strażnik

`apps/api/src/test/bramki-nie-rozjezdzaja-sie.spec.ts` — porównuje polecenia
bramkowe (`pnpm lint`, `pnpm typecheck`, `pnpm test`) w obu workflow i wymaga,
by **wdrożenie sprawdzało wszystko, co sprawdza CI**. Odwrotnie wolno.

Komentarze YAML są wycinane przed dopasowaniem — obie zmiany dopisują komentarze
cytujące polecenia, a to już piąta odsłona tej pułapki w tym repo.

## Dowód z CI — przebieg #120, `8aec15fa`, 2026-08-25

`ci.yml` na `main`: siedem jobów, wszystkie `success`. Job `Static checks
(lint + typecheck)` — ten, który padał od `X-40` — przeszedł. Komunikat
`could not find plugin "react-hooks"` nie występuje w logu przebiegu.

To zamyka **defekt 1**. Defekt 2 zamknięty nie jest i celowo tego nie mieszam:
krok `Lint` dopisany do `deploy.yml` dowiedzie się dopiero wtedy, gdy odpali go
prawdziwe wdrożenie. Do tego czasu mam kod kroku, nie jego przebieg — czyli
dokładnie ten rodzaj dowodu, którego brak opisuje to zadanie.

Uboczny skutek, który warto odnotować: przebieg #120 odblokował `X-17`, który
przez trzy dni stał na D1 nie z powodu własnej wady, tylko dlatego, że czekał
na zielone `ci.yml`. **Jedna czerwień w workflow blokuje domknięcie każdej
pozycji, której dowodem jest przebieg tego workflow.**

## Czego to NIE naprawia

- **Nie sprzątnęliśmy znalezisk react-hooks** w panelu klienta. Zostają
  ostrzeżeniami, zgodnie z decyzją z nagłówka `eslint.config.mjs`; ich zakres
  to `X-18`. Liczba: **132**, nie 105 jak zapisałem w pierwszej wersji tej
  notatki — 105 pochodziło ze starszego pomiaru sprzed poprawki `files`, która
  objęła regułami także pliki dotąd pomijane. `X-18` ma większy zakres, niż
  wskazywał jego opis.
- **Nie sprawdziliśmy pozostałych paneli** pod kątem tego samego wzorca.
  `status-page` używa tej samej konfiguracji Nexta i przeszedł, ale nie ma tam
  bloku nadpisań — czyli nie ma na czym wywalić. Gdyby ktoś taki blok dopisał,
  wpadnie w tę samą pułapkę.
- **Nie wiemy, czy `ci.yml` nie był czerwony także wcześniej z innych powodów.**
  Widzieliśmy czerwień przy `X-35` i `X-38`; tamtych przebiegów nie otwieraliśmy.
- **`pnpm lint` wydłuża bramkę wdrożenia** o ~6 s wg logu CI. To cena, którą
  świadomie płacimy.

## Do backlogu

1. **Przegląd historycznych czerwonych przebiegów `ci.yml`** — czy `X-35`
   i `X-38` padały z tego samego powodu, czy z innych.
2. **`X-18`** — sprzątnięcie znalezisk react-hooks i przywrócenie ich na `error`.
