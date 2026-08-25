# `X-38` — „fetch failed" to nie jest komunikat o błędzie

**Status:** zamknięte na D2 (kod + strażnik). D3 po wdrożeniu.
**Rodowód:** bezpośrednio z X-37. To nie była przyczyna tamtej awarii — to był
jej wzmacniacz i powód, dla którego diagnoza zajęła godziny zamiast minut.

---

## Dwa defekty, jedna sprawa

### 1. Brak limitu czasu

`apiFetch` wołał `fetch()` bez `signal`. Domyślny budżet undici na same
nagłówki to **300 s**. Awaria jednego endpointu nie gasła więc na jednym
kafelku — zatrzymywała renderowanie całej strony na tak długo, że użytkownik
uznawał panel za martwy.

To jest ta różnica, która decyduje o klasie awarii. Przy X-37 zepsuty był
**jeden napis** — adres bazowy. Bez limitu czasu ten jeden napis położył
logowanie, dashboard i nawigację. Z limitem położyłby dwa kafelki.

### 2. Błąd, który nic nie mówi

`fetch` opakowuje każdą awarię sprzed odpowiedzi HTTP — brak trasy, odmowę
połączenia, zerwane gniazdo, przekroczony czas — w jeden i ten sam obiekt:

```
TypeError: fetch failed
```

Prawdziwa informacja siedzi piętro niżej, w `err.cause.code`. Przy X-37 był to
`UND_ERR_CONNECT_TIMEOUT` i **leżał tam przez cały czas**. Nikt go nie czytał,
bo `dashboard-data.ts` bierze `err.message` żywcem i wyświetla klientowi.

Do tego `apiFetch` nie logował niczego. Kiedy szukaliśmy przyczyny awarii,
polecenie:

```bash
$C logs --since 20m client-panel | grep -iE 'fetch failed|ETIMEDOUT|ECONNREFUSED|UND_ERR'
```

zwracało **pustkę** — w środku trwającej awarii. Ta pustka aktywnie kierowała
nas w złą stronę: skoro panel milczy, problem musi być gdzie indziej. Szukaliśmy
w firewallu, w DNS-ie, w puli Postgresa i na węźle.

## Rozwiązanie

### Budżet czasu

```ts
const DOMYSLNY_BUDZET_MS = 20_000;   // nadpisywalny przez API_FETCH_TIMEOUT_MS
```

Dobrany pod najwolniejszy legalny scenariusz — zapytanie, w którym API odpytuje
rejestratora domen. Zmierzone 2026-08-25: `api.openprovider.eu` odpowiada
w ~225 ms, więc 20 s daje blisko stukrotny zapas. Transfery binarne **nie idą**
przez `apiFetch` (file-manager ma własne `fetch`), więc limit nie dotyczy
uploadu ani pobierania plików — sprawdzone: 271 wywołań `apiFetch`, żadne nie
niesie `FormData` ani strumienia.

Pojedyncze wywołanie może podnieść limit przez `timeoutMs`, a `timeoutMs: 0`
wyłącza go zupełnie. Własny `signal` wywołującego ma pierwszeństwo — nie
odbieramy komuś kontroli nad przerwaniem, o którą świadomie poprosił.

### Rozpakowanie przyczyny

Nowy moduł `apps/client-panel/src/lib/blad-sieci.ts`, celowo bez zależności
(dzięki temu wykonuje się w suicie `api`, jedynej, którą naprawdę odpala
bramka CI). Schodzi do `cause.code`, potem do `name`, potem do `code`,
i tłumaczy kod na zdanie.

**Dwóch odbiorców, dwie różne treści.** Użytkownik dostaje zdanie po polsku,
bez adresów wewnętrznych — topologia sieci nie jest jego sprawą:

| kod | co widzi klient |
|---|---|
| `UND_ERR_CONNECT_TIMEOUT` | API nie odpowiedziało w ciągu 20 s |
| `ECONNREFUSED` | API nie przyjmuje połączeń |
| `ENOTFOUND`, `EAI_AGAIN` | Nie udało się ustalić adresu API |
| `ECONNRESET`, `UND_ERR_SOCKET` | Połączenie z API zostało przerwane |
| cokolwiek innego | Brak połączenia z API |

Log serwera dostaje wszystko:

```
[apiFetch] GET /services — brak odpowiedzi po 10063 ms (UND_ERR_CONNECT_TIMEOUT); baza=https://api.verris.pl
```

Jeden taki wiersz w logu rano skróciłby diagnozę X-37 do kilku minut.

### `status: 0`

Błąd sieciowy leci jako `ApiError` ze statusem `0`. To umowa dla wywołujących:
`500` znaczy „API odpowiedziało i ma problem", `0` znaczy „nie dotarliśmy do
API". Dziś nikt tego nie rozróżniał.

## Strażnik

`apps/api/src/test/panel-mowi-co-sie-stalo.spec.ts` — **11 asercji, wszystkie
zielone**. Nie czyta źródła tam, gdzie może wykonać kod: `blad-sieci.ts` jest
testowany naprawdę, na błędach zbudowanych w kształcie, w jakim rzuca je
undici. Źródła `api.ts` dotyka tylko tam, gdzie inaczej się nie da — limit
czasu, przepuszczanie cudzego `signal`, obecność `catch`.

Asercja, która pilnuje sedna:

```ts
it('dokładnie ten błąd, który widzieliśmy przy X-37, czyta się sensownie', () => {
  expect(opiszBladSieci(bladUndici('UND_ERR_CONNECT_TIMEOUT'), 20_000)).toEqual({
    kod: 'UND_ERR_CONNECT_TIMEOUT',
    komunikat: 'API nie odpowiedziało w ciągu 20 s',
    czyPrzekroczonyCzas: true,
  });
});
```

Jest też górna granica na budżet domyślny: **musi być mniejszy niż 300 s**,
czyli mniejszy niż domyślne undici — bo to dokładnie to zachowanie, przed
którym ten strażnik broni.

## Pierwsze wdrożenie padło — i dlaczego bramka miała rację

Pierwsza wersja strażnika importowała moduł ścieżką względną do sąsiedniej
paczki:

```ts
import { opiszBladSieci } from '../../../client-panel/src/lib/blad-sieci';
```

Lokalnie `jest` był zielony. Bramka CI padła na `TS6059` — plik leżał poza
`rootDir: "src"` paczki `api`.

**`ts-jest` kompiluje plik po pliku i nie zna `rootDir`. `tsc --noEmit` buduje
jeden program dla całej paczki i sprawdza.** Bramka odpala obie rzeczy, więc
zielony `jest` nie jest dowodem, że wdrożenie przejdzie. Uruchomiłem u siebie
typecheck panelu i pominąłem typecheck API — dokładnie ten sam błąd co przy
X-35, gdzie sprawdziłem, co czyta metryki, ale nie, co asertuje na regułach.

### Naprawa, nie obejście

Moduł przeniesiony do `libs/contracts/src/blad-sieci.ts` i importowany **nazwą
pakietu** w obu miejscach. Import po nazwie idzie przez `node_modules`
i `rootDir` go nie dotyczy — `apps/api` importuje tak z `@verris/database` od
zawsze.

To jest przy okazji jedyna droga do testowania logiki paneli. `apps/client-panel`
nie ma runnera (X-40), więc **czysta logika, która ma być sprawdzana
wykonaniem, musi mieszkać w `libs/`** — inaczej zostaje strażnik czytający
źródło, czyli słabsza forma dowodu.

### Nowy strażnik

`apps/api/src/test/testy-nie-siegaja-poza-swoja-paczke.spec.ts` — skanuje całe
`apps/api/src` i czerwieni się na każdym imporcie względnym wychodzącym poza
paczkę, z podpowiedzią „użyj nazwy pakietu i przenieś kod do `libs/`".

### Trzecia odsłona tej samej pułapki

Ten strażnik zapalił się najpierw na **własnej dokumentacji** (komentarz cytuje
zakazany import), a po dodaniu wycinania komentarzy — na **własnych danych
testowych** (fixture zawierał zakazaną ścieżkę jako literał). To trzeci raz
w tym repo: `noDataState` w X-35, `.catch(() => null)` w X-39, teraz to.

Zasada zapisana w kodzie strażnika: **strażnik czytający źródło musi odciąć
komentarze, a wzorca, którego zabrania, nie wolno zapisać w jego własnym
źródle** — ścieżki testowe składa się z kawałków.

## Czego to NIE naprawia

- **`.catch(() => null)` w `dashboard-data.ts` zostaje.** Pięć zapytań nadal
  połyka błąd i pokazuje pustkę. Po tej zmianie mają już czytelny błąd do
  pokazania — nie korzystają z niego. Portfel przy awarii API nadal pokaże
  `0,00 K` zamiast prawdy. To osobna pozycja i pilniejsza, niż wygląda:
  **kłamstwo o saldzie klienta jest gorsze niż komunikat o błędzie.**
- **Pozostałe `fetch` poza `apiFetch`** (`support/actions.ts`,
  `sidebar-actions.ts`, `file-manager/data.ts`, `session-profile.ts`) nadal
  nie mają limitu ani rozpakowania przyczyny. Strażnik ich nie obejmuje.
- **20 s to wybór, nie pomiar.** Oparty na jednym pomiarze rejestratora
  z jednego dnia. Jeśli któryś endpoint legalnie przekracza ten czas, objawi
  się to jako nowy błąd — i wtedy limit trzeba podnieść świadomie, a nie
  wycofać.
- **Nie wiemy, czy 300 s kiedykolwiek się zmaterializowało.** Przy X-37
  padaliśmy na 10 s (`connectTimeout`), nie na 300 s (`headersTimeout`).
  Naprawiamy dziurę, która była otwarta, ale nie mamy dowodu, że ktoś przez
  nią przeszedł.

## Do backlogu

1. **`X-39`** — ciche `.catch` w `dashboard-data.ts`: pustka nie do odróżnienia
   od zera.
2. **`X-40`** — `apps/client-panel` nie ma skryptu `test`, a bramka CI odpala
   tylko `pnpm --filter api test`. Leżący tam `client-nav-access.spec.ts`
   **nie wykonuje się nigdzie**. Test, którego nikt nie uruchamia, jest gorszy
   niż jego brak, bo wygląda na pokrycie.
3. **Limit czasu dla `fetch` poza `apiFetch`.**
