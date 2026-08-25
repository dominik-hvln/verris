# `X-39` — Panel pokazywał zero tam, gdzie nie wiedział

**Status:** zamknięte na D2 (kod + strażnik). D3 po wdrożeniu.
**Rodowód:** trzecia i ostatnia pozycja wyciągnięta z awarii X-37.

---

## Objaw

W czasie awarii X-37 klient zobaczył na swoim dashboardzie:

```
Saldo portfela      0,00 K
Punkty EKO          0
Otwarte zgłoszenia  3
```

Pierwsze dwie liczby były **nieprawdą**. Zapytania o profil i o program EKO
padły; panel pokazał wartości domyślne. Trzecia była prawdziwa przypadkiem —
`support/actions.ts` nie korzysta z `apiFetch`, więc jako jedyny kafelek
w ogóle dostał dane.

Klient nie miał jak tych trzech liczb odróżnić. Wszystkie wyglądały tak samo
pewnie.

## Przyczyna

`getDashboardSnapshot` odpalał siedem zapytań, ale traktował je w dwóch
klasach:

```ts
fetchUserProfile().catch(() => null),
fetchUserServicesSummary(),                                    // ← błąd zachowany
fetchUserDomainsPortfolio(),                                   // ← błąd zachowany
apiFetch<EcoProgramOverview>('/users/me/eco-program').catch(() => null),
getWalletSummary().catch(() => null),
apiFetch<EcoLedgerRowDto[]>('/users/me/eco-ledger').catch(() => []),
fetchTickets().catch(() => []),
```

Dwa zapytania miały prawo zgłosić porażkę. Pięć — nie. Typ `errors` miał
dokładnie dwa klucze: `services` i `domains`. Nie było gdzie zapisać, że
profil nie wrócił, więc pytanie „czy to saldo jest prawdziwe" nie miało
w kodzie reprezentacji.

To nie było przeoczenie w jednym miejscu. To była **decyzja projektowa
podjęta raz i nierozciągnięta na resztę** — dwa zapytania dostały porządną
obsługę błędu, a pozostałe pięć dopisano później, każde z własnym
`.catch(() => coś)`.

## Dlaczego to gorszy defekt niż sama awaria

Awaria mija. Panel, który przy awarii mówi „nie wiem", jest denerwujący przez
kwadrans. Panel, który przy awarii mówi „masz zero złotych", podważa zaufanie
do wszystkiego, co pokazuje — także wtedy, gdy już działa. Klient, który raz
zobaczył fałszywe saldo, następnym razem nie uwierzy prawdziwemu.

Wartość domyślna przy awarii jest bezpieczna tylko wtedy, gdy jest
odróżnialna od danych. `0` nie jest.

## Rozwiązanie

**Warstwa danych.** Jeden wspólny sposób na porażkę zamiast siedmiu:

```ts
async function sprobuj<T>(zapytanie: () => Promise<T>): Promise<DashboardFetchResult<T>> {
  try {
    return { ok: true, data: await zapytanie() };
  } catch (err) {
    const { message, status } = describeApiError(err);
    return { ok: false, error: message, status };
  }
}
```

Kształt nie jest nowy — to ten sam, którego od początku używały `/services`
i `/domains`. Przestaje po prostu być przywilejem dwóch zapytań.

Typ `errors` dostaje po kluczu na każde zapytanie: `profile`, `services`,
`domains`, `ecoProgram`, `wallet`, `ecoLedger`, `tickets`. Wartości zastępcze
zostają — widok musi się wyrenderować — ale obok każdej stoi teraz informacja,
czy jest prawdziwa.

**Widok.** Kafelek pokazuje `—` i `Błąd pobierania` zamiast liczby, gdy jego
źródło nie wróciło. Baner wymienia wszystkie awarie, nie dwie wybrane:

```tsx
const awarie = ([
  ['Profil i saldo', snapshot.errors.profile],
  ['Usługi', snapshot.errors.services],
  ...
] as const).filter((p) => Boolean(p[1]));
```

Punkty EKO mają dwa źródła (`profile.ecoPoints` albo `ecoProgram.ecoPoints`),
więc „nie wiemy" dopiero gdy zawiodły oba — inaczej strażnik zamieniłby
działający kafelek w błąd.

## Strażnik

`apps/api/src/test/dashboard-nie-udaje-zera.spec.ts` — 7 asercji. Najmocniejsza
jest trzecia i piąta, bo wiążą dwa pliki:

- **liczba zapytań w `Promise.all` musi równać się liczbie kluczy `errors`** —
  dopisanie ósmego zapytania bez klucza czerwieni test,
- **każdy klucz musi być CZYTANY przez widok** — zebrany i niepokazany błąd
  jest tym samym co połknięty, tylko droższy.

Dwie asercje są wymienione z nazwy, bo to były konkretne objawy: „saldo
portfela nie pokazuje liczby, gdy profil nie wrócił" i „liczba otwartych
zgłoszeń też nie udaje zera".

**Dowód, że strażnik działa** — po cofnięciu dwóch poprawek (jeden
`.catch(() => null)` w warstwie danych, stary kafelek salda w widoku):

```
✕ warstwa danych nie połyka błędów
✓ strażnik faktycznie łapie kod sprzed X-39
✓ snapshot deklaruje klucz błędu dla każdego swojego zapytania
✓ każdy klucz dostaje wartość, gdy zapytanie padnie
✓ każdy zebrany błąd jest czytany przez widok
✕ saldo portfela nie pokazuje liczby, gdy profil nie wrócił
✓ liczba otwartych zgłoszeń też nie udaje zera
Tests: 2 failed, 5 passed, 7 total
```

Po przywróceniu: 7/7.

### Pułapka, w którą wpadłem po raz drugi

Pierwsza wersja strażnika była czerwona na **własnym komentarzu** — proza
opisująca defekt cytuje `.catch(() => null)`, a `grep` po całym pliku liczy
komentarze razem z kodem. Dokładnie ten sam błąd popełniłem w X-35, sprawdzając
`noDataState: Alerting`. Filtr linii komentarza jest teraz w kodzie strażnika
z adnotacją, żeby trzeciego razu nie było.

## Czego to NIE naprawia

- **Wykresy nadal rysują pustkę bez adnotacji.** `DashboardCharts` dostaje
  puste tablice, gdy zapytanie padło, i rysuje pusty wykres — nieodróżnialny
  od wykresu „nic się nie działo". To ten sam defekt, tylko piętro wyżej.
- **Pozostałe widoki panelu nie były przeglądane.** Strażnik pilnuje
  `dashboard-data.ts` i `dashboard-home.tsx`. Podstrony usług, domen, billingu
  i plików mają własne pobieranie danych i własne nawyki.
- **Nie ma testu wykonującego `getDashboardSnapshot`.** Moduł ciągnie
  `next/headers`, więc nie uruchomi się w suicie `api` — jedynej, którą odpala
  bramka. Strażnik czyta źródło. To słabsza forma dowodu i wprost prowadzi
  do `X-40`.

## Do backlogu

1. **`X-40`** — `apps/client-panel` nie ma skryptu `test`; bramka odpala tylko
   `pnpm --filter api test`, więc leżący tam `client-nav-access.spec.ts` nie
   wykonuje się nigdzie. Dopóki to trwa, każdy strażnik dotyczący panelu musi
   czytać źródło zamiast wykonywać kod.
2. **Wykresy przy awarii** — pusty wykres nieodróżnialny od pustych danych.
3. **Limit czasu dla `fetch` poza `apiFetch`** (`support/actions.ts`,
   `sidebar-actions.ts`, `file-manager/data.ts`, `session-profile.ts`).
