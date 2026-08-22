# `X-23` — Bramka podatności, która naprawdę zatrzymuje

| | |
|---|---|
| **Sprint** | poza planem — znalezione przy oglądaniu przebiegu CI #58 |
| **Priorytet** | WYSOKA |
| **Nakład** | ~1,5 h |
| **Zależy od** | — |
| **Status** | zamknięte w kodzie, czeka na przebieg CI |
| **Data** | 2026-08-22 |

---

## Problem

Przebieg CI #58 zakończył się statusem **Success**. Sześć jobów na zielono. A w adnotacjach:

```
Security scans (gitleaks + audit + trivy)
Process completed with exit code 1.
```

Krok `pnpm audit --prod --audit-level high` **wychodził z kodem 1** i nie zatrzymywał niczego,
bo miał `continue-on-error: true`.

Powód, dla którego to tam stało, był prawdziwy: w drzewie siedzi jedna wysoka podatność
(`deepmerge-ts` przez Prismę 6, `GHSA-ggr8-5vv4-36mx`), której nie da się domknąć bez migracji
na Prismę 7 — a to jest `X-20`, świadomie odłożone. Bez `continue-on-error` każdy przebieg CI
byłby czerwony.

**Skutek: nowa krytyczna podatność też by nie zatrzymała wdrożenia.** Job świeciłby się na
zielono z adnotacją, której nikt nie czyta — bo przez ostatnie kilkanaście przebiegów ta sama
adnotacja znaczyła „to ta znana, wiadoma".

To jest dokładnie ta sama klasa błędu co `X-17`: **bramka, która nie bramkuje.** Tam job
z testami nie budował bibliotek i raportował 210 zielonych z 48 zestawów. Tu krok
bezpieczeństwa raportuje porażkę do dziennika i przepuszcza.

Warto nazwać wzorzec, bo wraca: **kiedy alarm dzwoni na coś, czego nie da się dziś naprawić,
odruchem jest wyłączenie alarmu.** I to działa — do pierwszej rzeczy, którą dałoby się naprawić,
gdyby ktoś o niej usłyszał.

## Rozwiązanie

`continue-on-error` zastąpione listą świadomych zgód: `ops/ci/podatnosci-dopuszczone.json`,
sprawdzaną przez `ops/ci/audyt-bramka.cjs`.

| Sytuacja | Wynik |
|---|---|
| nowa wysoka/krytyczna podatność spoza listy | **czerwone** |
| zgoda po terminie ważności | **czerwone** |
| zgoda na podatność, której już nie ma | **czerwone** |
| podatność objęta zgodą w terminie | zielone |
| średnie i niskie | zielone |

Każda zgoda musi mieć: identyfikator advisory, moduł, **powód** (min. 80 znaków — zgoda na
wysoką podatność wymaga wyjaśnienia, nie hasła), **pozycję w macierzy** i **termin ważności**
nie dalszy niż 90 dni.

### Trzy reguły, które łatwo pominąć

**Zgoda po terminie robi CI czerwone.** Nie ostrzeżenie — czerwone. Przedłużenie zgody na
podatność wysokiej wagi ma być decyzją, a nie skutkiem tego, że nikt nie zajrzał.

**Zgoda na podatność, której już nie ma, też robi CI czerwone.** To jest reguła, którą
najłatwiej uznać za przesadę, a jest najważniejsza w dłuższym horyzoncie: lista wyjątków,
z której nic nigdy nie znika, po pół roku przestaje cokolwiek znaczyć. Wtedy wracamy do
`continue-on-error`, tylko w bardziej pracochłonnym opakowaniu.

**Termin dalszy niż 90 dni jest odrzucany.** „Zgoda do 2030 roku" to usunięcie bramki pod
inną nazwą.

## Stan po zmianie

```
Podatności blokujące (high/critical): 1
  HIGH     deepmerge-ts    GHSA-ggr8-5vv4-36mx  — zgoda do 2026-11-15 (X-20)

Bramka podatności: zielone. 1 świadomych zgód, wszystkie w terminie.
```

Jedna zgoda, z terminem `2026-11-15` — czyli mniej więcej wtedy, kiedy `X-20` (Prisma 7) i tak
musi zostać rozstrzygnięte. Jeśli do tego czasu nie zostanie, CI o tym przypomni, zatrzymując
wdrożenie.

## Testy

`apps/api/src/test/bramka-podatnosci.spec.ts` — 15 testów.

| Test | Co pilnuje |
|---|---|
| przepuszcza podatność objętą zgodą w terminie | ścieżka pozytywna |
| **zatrzymuje NOWĄ krytyczną spoza listy** | **właściwa reguła** |
| zatrzymuje zgodę po terminie | milczące przedłużanie |
| zatrzymuje zgodę na nieistniejącą podatność | lista ma być prawdziwa |
| nie blokuje na średnich i niskich | próg wagi |
| zatrzymuje zgodę bez daty | pusty termin to nie termin |
| zatrzymuje zgodę dalszą niż 90 dni | „zgoda na zawsze" |
| każda zgoda ma powód, pozycję i termin | kompletność listy |
| każda zgoda wskazuje istniejącą pozycję macierzy | zgoda bez właściciela |
| krok bramki istnieje i woła nasz skrypt | `ci.yml` |
| **krok bramki NIE ma `continue-on-error`** | **regresja tego właśnie błędu** |
| stary krok `--audit-level` już nie istnieje | dwie bramki obok siebie mylą |
| krok `Lint` NIE ma `continue-on-error` | patrz niżej |
| tylko dopuszczone kroki są miękkie | biała lista miękkich kroków |
| biała lista wskazuje istniejące kroki | zgoda na nieistniejący krok |

**Czy czerwieni się na starym kodzie?** Tak — przywrócenie starego kroku audytu
z `continue-on-error` daje **2 czerwone z 15**, a dołożenie `continue-on-error` z powrotem
do kroku `Lint` — kolejne **2 czerwone**.

## Drugie znalezisko: lint też był miękki

W tym samym pliku, dwieście linijek wyżej:

```yaml
- name: Lint
  run: pnpm lint
  # Lint is allowed to be soft for now; typecheck below is the gate.
  continue-on-error: true
```

Komentarz był kiedyś prawdziwy. Dziś `pnpm lint` **wychodzi z zerem we wszystkich siedmiu
pakietach** — 0 błędów, 270 ostrzeżeń (dług z `X-19`, spłacany osobno). Czyli miękkość nie
chroniła już przed niczym poza **nowym** błędem lintera, przed nami.

Zdjęta. Ostrzeżenia nadal przechodzą, błędy zatrzymują.

Do tego biała lista: `MIEKKIE_DOZWOLONE` w teście wypisuje kroki, którym wolno być miękkimi,
z powodem. Dziś jest tam jeden — gitleaks. Nie chodzi o to, żeby żaden krok nigdy nie był
miękki; chodzi o to, żeby **dołożenie takiego kroku było widoczną decyzją**, a nie linijką,
którą ktoś dopisał, bo się świeciło na czerwono. Czyli dokładnie tym, czym była ta pozycja.

### Rozkład `ci.yml` na kroki, nie wyrażenie regularne

Pierwsza wersja strażnika miękkich kroków używała jednego wzorca z leniwym kwantyfikatorem
przez cały plik i **przeciekała na następny krok** — meldowała „`Install pnpm` jest miękki",
choć miękki był krok obok. Przepisane na rozkład po wcięciu myślnika.

Strażnik, który wskazuje nie ten element, kosztuje tyle samo czasu co brak strażnika.

### Strażnik trafił sam w siebie. Po raz czwarty.

Test „stary krok `--audit-level` już nie istnieje" zaczął od czerwieni, bo fraza `--audit-level`
pada w **komentarzu wyjaśniającym, dlaczego tego kroku już nie ma**.

To czwarte wystąpienie w tym projekcie: polskie słowo „jest" w `X-17`, `archiver.create`
w `X-21`, teraz to. Wzorzec jest już na tyle powtarzalny, że wart zapisania jako reguła:

> **Strażnik czytający treść pliku musi patrzeć na kod, nie na prozę.** Komentarze wypadają
> przed dopasowaniem — zawsze, domyślnie, nie po pierwszym fałszywym alarmie.

## Czego to nadal nie robi

- **Nie obejmuje gitleaks.** Krok skanujący sekrety nadal ma `continue-on-error: true`.
  Świadomie zostawiony na teraz: gitleaks na pełnej historii repozytorium daje fałszywe
  trafienia na przykładowych konfiguracjach w `ops/`, a wyciszanie ich to osobna robota
  z własnym plikiem `.gitleaksignore`. Dopóki tego nie ma, zaostrzenie tego kroku
  zatrzymałoby każde wdrożenie — czyli skończyłoby się ponownym wyłączeniem alarmu. Osobna
  pozycja do założenia przy najbliższym przeglądzie bezpieczeństwa.
- **Nie obejmuje zależności deweloperskich.** `pnpm audit --prod` patrzy tylko na drzewo
  produkcyjne. Podatność w narzędziu budującym nie zatrzyma wdrożenia, choć potrafi
  zainfekować artefakt.
- **Nie sprawdza Trivy'ego.** Skan systemu plików ma `exit-code: '0'`, czyli raportuje
  i nie bramkuje. To zostaje — Trivy na `scan-ref: .` łapie też zależności, które `pnpm audit`
  już pokrywa, więc bramkowanie obu naraz dublowałoby czerwień bez dodania informacji.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-20` | wiąże terminem — zgoda na `deepmerge-ts` wygasa 2026-11-15 |
| `X-17` | ta sama klasa błędu: bramka raportująca zamiast zatrzymywać |
| `X-21` | ten sam wzorzec strażnika trafiającego we własny komentarz |
| `X-18` | domyka — od teraz nowa podatność w podniesionej zależności zatrzyma CI |

## Dowód po

- `ops/ci/audyt-bramka.cjs` — bramka
- `ops/ci/podatnosci-dopuszczone.json` — jedna zgoda, z terminem
- `.github/workflows/ci.yml` — krok `Bramka podatności` i krok `Lint`, oba bez `continue-on-error`
- `apps/api/src/test/bramka-podatnosci.spec.ts` — 15 testów

**Osiągnięty poziom dowodu:**
- [x] D1 · [ ] D2 · [ ] D3 · [ ] D4

**D1, nie D2** — z tej samej przyczyny co przy `X-17`: pozycja dotyczy CI, więc dowodem jest
zielony przebieg CI, a nie zielony pakiet u mnie. Poziom podniosę po obejrzeniu przebiegu.
