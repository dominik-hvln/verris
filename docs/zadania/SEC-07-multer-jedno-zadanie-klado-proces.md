# `SEC-07` — Trzy podatności HIGH w multerze: jedno żądanie kładło proces API

| | |
|---|---|
| **Sprint** | 5 |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 16 h · rzeczywisty ~3 h (część w kodzie) |
| **Zależy od** | — |
| **Status** | w toku — kod gotowy, brak dowodu D2 |
| **Data zamknięcia** | |

---

## Problem

Trzy podatności HIGH w multerze 2.2.0, każda o CVSS 7.5: wektor sieciowy, **bez
uwierzytelnienia i bez interakcji użytkownika**. Każda kończy proces Node jednym żądaniem
`multipart/form-data`. API przyjmuje uploady na dwóch ścieżkach — załączniki do zgłoszeń
i menedżer plików — więc obie były wystawione na wywrócenie całego control-plane'u przez
kogokolwiek, kto potrafi wysłać POST-a.

| Advisory | CVE | Mechanizm |
|---|---|---|
| `GHSA-wc9g-mqfw-jrwm` | CVE-2026-77078 | Dwie spreparowane nazwy pól tekstowych → `RangeError: Invalid array length` wewnątrz parsowania pól. Wyjątek **nie trafia do error handlera aplikacji** i kończy proces. |
| `GHSA-qfvm-cv95-jqjf` | — | Wyciek deskryptorów plików przy przerwanych uploadach. |
| `GHSA-535w-7cp7-47q4` | CVE-2026-82333 | `items[4294967294]` wymusza alokację maksymalnie długiej tablicy rzadkiej; kolejne pole z kluczem nieliczbowym na tej samej bazie przelatuje ją w całości i zjada procesor synchronicznie. Dotyczy multera 1.x **i** 2.x. |

## Dowód przed

```
apps/api/package.json:42      "multer": "^2.2.0"
pnpm-lock.yaml:6673           multer@2.2.0        ← jedyna kopia w drzewie
```

Przebieg CI #163 (PR #37, 2026-09-19), job „Security scans":

```
Podatności blokujące (high/critical): 4
HIGH multer GHSA-wc9g-mqfw-jrwm — BEZ ZGODY
HIGH multer GHSA-qfvm-cv95-jqjf — BEZ ZGODY
HIGH multer GHSA-535w-7cp7-47q4 — BEZ ZGODY
```

**Stan w macierzy przed:** `BRAK`

## Pułapka — dlaczego PR #37 tego NIE naprawiał, choć wyglądał, jakby naprawiał

PR #37 Dependabota podnosi multer `2.2.0 → 2.3.0`, czyli **dokładnie do wersji załatanej**.
Kuszące jest scalić go i uznać sprawę za zamkniętą. Byłby to błąd, z dwóch niezależnych powodów.

**Powód pierwszy: druga kopia.** `@nestjs/platform-express@11.2.1` deklaruje
`"multer": "2.2.0"` — **pin dokładny, bez karety**. Po takim merge w drzewie stanęłyby dwie
kopie: 2.3.0 dla `apps/api` i 2.2.0 pod platform-express. Multipart parsuje `FileInterceptor`,
który pochodzi **z platform-express** — czyli z kopii podatnej. Zależność bezpośrednia
wyglądałaby na załataną, `pnpm why multer` pokazywałby 2.3.0 na pierwszym miejscu,
a dziura zostałaby dokładnie tam, gdzie leci ruch.

**Powód drugi: sama wersja nie wystarcza.** Advisory `GHSA-535w-7cp7-47q4` mówi wprost:
„upgrade to 2.3.0 **and** configure `limits.fieldArrayIndexLimit` to the minimum array index
their application requires". Limitu nie ma domyślnie. Bez niego podniesienie wersji zamyka
dwie podatności z trzech, a trzecia zostaje — przy zielonej bramce, bo `pnpm audit` patrzy
na wersje, nie na konfigurację.

To jest ta sama rodzina co `X-47` i `X-44`: rzecz wygląda na sprawdzoną i nie jest.
Tym razem różnica polega na tym, że **narzędzie samo podsunęło nam pozorną naprawę**.

## Rozwiązanie

**1. `pnpm.overrides` zamiast bumpa w `apps/api`.** W korzeniu stoi już piętnaście nadpisań
tego rodzaju (`undici`, `qs`, `form-data`, `brace-expansion`…), więc to wzorzec zastany,
nie nowy wynalazek. Override wymusza **jedną** kopię w całym drzewie, niezależnie od pinu
Nesta. Rozwiązało się do `multer@2.4.0`.

Odrzucone alternatywy:

- **Podniesienie `@nestjs/platform-express` do ≥ 12.0.2** (12.0.2 pinuje 2.3.0, 12.0.3 pinuje
  2.4.0) — to major Nesta, czyli osobna praca z własnym planem. Zostaje jako docelowy kierunek,
  żeby override kiedyś zniknął.
- **Zgoda w `podatnosci-dopuszczone.json`** — odrzucone bez wahania. Zdalny DoS bez
  uwierzytelnienia w produkcie hostingowym nie jest czymś, na co godzimy się z terminem.
  Lista zgód istnieje dla rzeczy, których nie da się dziś naprawić; tę dało się.

**2. Jedno miejsce na limity.** `apps/api/src/common/upload/multer-limity.ts` — funkcja
`opcjeUploaduDoPamieci(maksBajtow)` zwraca `storage`, `fileSize` i `fieldArrayIndexLimit`.
Oba kontrolery przechodzą teraz przez nią. Gdyby limit stał osobno przy każdym interceptorze,
mielibyśmy dwa źródła jednej liczby i trzecie miejsce, o którym ktoś zapomni przy następnym
endpointcie z uploadem — usterka opisana przy `X-33`.

**3. Wartość limitu: 10.** Prawdziwym minimum dla tego API jest zero — ani załączniki zgłoszeń,
ani menedżer plików nie używają notacji nawiasowej. Zostaje 10, żeby klient wysyłający
legalnie `x[0]`…`x[9]` nie dostał błędu przy zmianie, której nie zapowiedzieliśmy.
Atak potrzebuje indeksu rzędu 4 294 967 294, więc różnica między 0 a 10 nie ma dla podatności
żadnego znaczenia, a ma dla zgodności wstecznej.

**4. Jedno rzutowanie, z terminem.** `multer` nie dostarcza własnych typów, a `@types/multer`
stoi na 2.2.0 i nie zna `fieldArrayIndexLimit`; pole `limits` jest tam typem literalnym
wewnątrz `interface Options`, więc **nie da się go rozszerzyć deklaracją**. Rzutowanie jest
jedno, zamknięte w tym module, a osobna asercja upadnie przy podniesieniu `@types/multer`
i każe sprawdzić, czy rzutowanie jest jeszcze potrzebne. To dokładnie sytuacja z `X-21`:
deklaracje typów opisują inną wersję biblioteki niż zainstalowana.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `package.json` (korzeń) | `pnpm.overrides.multer = "^2.3.0"` |
| `pnpm-lock.yaml` | multer 2.2.0 → 2.4.0, jedna kopia; platform-express dostaje tę samą |
| `apps/api/src/common/upload/multer-limity.ts` | nowy — wspólne limity + jedno rzutowanie |
| `apps/api/src/tickets/tickets.controller.ts` | `FILES_MEMORY` przez `opcjeUploaduDoPamieci()` |
| `apps/api/src/files/files.controller.ts` | `FileInterceptor('file', …)` jw. |
| `apps/api/src/test/multer-limity.spec.ts` | nowy strażnik, 7 asercji |

Migracje bazy: brak. Zmienne środowiskowe: brak.

**Uboczny skutek w lockfile, odnotowany, żeby nikt się później nie zastanawiał:** wypadły
`concat-stream`, `typedarray` i `react-is@19.2.5` (zależności przechodnie starego multera),
a `picomatch` przeskoczył 4.0.4 → 4.0.5 w obrębie istniejącego zakresu. Poza multerem żaden
pakiet nie zmienił majora ani minora.

## Testy

| Test | Co sprawdza |
|---|---|
| `multer-limity.spec.ts` — „dokładnie jedna kopia" | **Najważniejszy.** Liczy wersje multera w lockfile. Łapie dokładnie ten scenariusz, w którym bump wygląda na naprawę, a druga kopia zostaje podatna. |
| — „co najmniej 2.3.0" | Wersja tej jedynej kopii. |
| — „override istnieje" | Że naprawa trzyma się override'a, a nie bumpa, który Nest i tak nadpisze. |
| — „opcje niosą `fieldArrayIndexLimit`" | Asercja **zachowaniowa**: co funkcja naprawdę zwraca. |
| — „limit jest na tyle mały" | Że nikt nie poluzuje liczby do wartości, która przestaje cokolwiek znaczyć. |
| — „żaden interceptor nie omija wspólnych limitów" | Asercja **o treści**, stojąca obok zachowaniowej, nie zamiast niej (lekcja z `X-34`). |
| — „rzutowanie ma termin" | Upadnie przy bumpie `@types/multer` i każe usunąć obejście. |

**Czy test najpierw czerwienił się na starym kodzie?** Z konstrukcji **TAK** dla trzech
pierwszych asercji — przy `multer@2.2.0` w lockfile „co najmniej 2.3.0" i „override istnieje"
padają, a „dokładnie jedna kopia" przechodziłaby (bo kopia była jedna, tyle że podatna),
co jest samo w sobie pouczające: ten test broni przed stanem, który dopiero **mógł** powstać
po merge PR #37. Asercja o `fieldArrayIndexLimit` czerwieniła się, bo funkcji nie było.

**Czego NIE zweryfikowano, i to jest dziura w tym zadaniu:** żaden z tych testów nie został
uruchomiony. Powłoka, w której powstała ta zmiana, nie ma pnpm ani Dockera, a natywne binaria
w `node_modules` są zbudowane pod macOS. Potwierdzone jest wyłącznie to, że
`tsc --noEmit -p apps/api/tsconfig.json` przechodzi z zerem błędów — czyli **D1**.

## Dowód po

- **D1** — kod istnieje, typecheck `apps/api` zielony (0 błędów).
- **D2 — BRAK.** Wymaga: `nvm use && pnpm install && pnpm test && pnpm lint && pnpm typecheck`,
  a potem zielonego joba „Security scans" na przebiegu CI. **Dopóki bramka podatności nie jest
  zielona, ta pozycja nie jest zamknięta** — numer wersji w `package.json` nie jest dowodem,
  bo dokładnie taki dowód dawał PR #37.

**Stan w macierzy po:** `CZĘŚCIOWE` (do `DZIAŁA` po D2)

## Czego to nadal nie robi

- **Override to obejście pinu Nesta, nie jego naprawa.** Docelowo `@nestjs/platform-express`
  ≥ 12.0.2 i usunięcie nadpisania. Major Nesta = osobna pozycja, nie dopisek tutaj.
- **Nie ustawiono pozostałych limitów multipartu** (`fields`, `parts`, `fieldNameSize`,
  `fieldSize`). Są tanią obroną przed innymi kształtami tego samego ataku, ale zmieniają
  zachowanie poza zakresem advisory — świadomie osobno, żeby ta zmiana pozostała minimalna
  i odwracalna.
- **Nie przejrzano innych parserów multipartu** poza tymi dwoma kontrolerami.

## Ryzyko i wycofanie

Override może wywrócić `FileInterceptor`, jeżeli między 2.2.0 a 2.4.0 zmieniło się coś
w kontrakcie, którego Nest 11 oczekuje — to najbardziej prawdopodobny sposób, w jaki ta
zmiana zepsuje coś nieoczekiwanie, i dlatego **testy integracyjne uploadu są tu ważniejsze
niż jednostkowe**. Wycofanie: usunięcie wpisu z `pnpm.overrides` i `pnpm install`;
`multer-limity.ts` może zostać, bo `fieldArrayIndexLimit` na starym multerze jest po prostu
ignorowanym polem.

`fieldArrayIndexLimit: 10` odrzuci żądanie z polem `x[11]`. Żaden znany nam klient takiego
nie wysyła; gdyby się okazało, że jednak — objawi się jako odrzucony upload, nie jako cicha
utrata danych.

## Wpływ na inne pozycje

Zamknięcie tej pozycji odblokowuje merge PR #37 (`DEP-01`). Nie dotyka `X-50` — to, że bramka
podatności w ogóle zatrzymuje wdrożenie, jest osobną sprawą i osobną pozycją.
