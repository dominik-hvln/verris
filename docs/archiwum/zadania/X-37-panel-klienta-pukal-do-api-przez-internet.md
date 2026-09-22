# `X-37` — Panel klienta pukał do API przez internet i wracał do siebie

**Status:** zamknięte na D3.
**Zgłoszone przez:** Dominik, 2026-08-25 rano — „logowanie klienta działa bardzo
wolno, często nie wpuszcza do panelu (admin działa dobrze), a po zalogowaniu nie
ładują się dane, usługi, zakładki usera".

---

## Co się stało

Panel klienta renderował się, ale pusty. Kafelki „Usługi aktywne" i „Domeny"
pokazywały „Błąd pobierania", nad nimi wisiał baner:

```
Część danych jest chwilowo niedostępna
Usługi: fetch failed
Domeny: fetch failed
```

Saldo portfela `0,00 K`, „Nie udało się pobrać historii portfela". Zakładki
w menu bocznym pojawiały się dopiero po kilkudziesięciu sekundach. Logowanie
trwało tak długo, że część prób kończyła się niczym. **Panel admina działał
normalnie.**

## Przyczyna

Jedna stała w `apps/client-panel/src/lib/api.ts`:

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
```

`NEXT_PUBLIC_*` to z definicji adres dla **przeglądarki** —
`https://api.verris.pl`. Ale `apiFetch` z tego pliku działa po stronie
**serwera**: to on obsługuje renderowanie komponentów i akcje serwerowe. Kazał
więc kontenerowi `client-panel` wyjść na publiczny adres własnego hosta
i wrócić do środka (hairpin NAT).

Ta pętla przestała się domykać. Zmierzone z wnętrza kontenera:

```
base = https://api.verris.pl
  10563ms  /healthz              -> UND_ERR_CONNECT_TIMEOUT
  10498ms  /services             -> UND_ERR_CONNECT_TIMEOUT
  10495ms  /domains              -> UND_ERR_CONNECT_TIMEOUT
  10497ms  /users/me/eco-program -> UND_ERR_CONNECT_TIMEOUT
```

10 s to domyślny `connectTimeout` undici. **Każde** zapytanie serwerowe czekało
swoje dziesięć sekund i kończyło się `TypeError: fetch failed`.

Droga wewnętrzna, tym samym poleceniem, w tej samej chwili:

```
    54ms  /healthz  -> 200
     8ms  /services -> 401
     3ms  /domains  -> 401
```

`401` bez tokenu jest poprawną odpowiedzią — endpointy żyły przez cały czas.

## Dlaczego awaria wyglądała jak coś zupełnie innego

Ten sam wzorzec występuje w repo pięć razy i **cztery razy jest poprawny**:

| plik | odczyt | |
|---|---|---|
| `staff-panel/src/lib/staff-api.ts` | `API_URL ?? NEXT_PUBLIC_API_URL` | ✓ |
| `client-panel/src/lib/session-profile.ts` | `API_URL ?? NEXT_PUBLIC_API_URL` | ✓ |
| `client-panel/src/components/brand/trust-stats-action.ts` | `API_URL ?? NEXT_PUBLIC_API_URL` | ✓ |
| `client-panel/src/app/dashboard/support/actions.ts` | `API_URL` | ✓ |
| `client-panel/src/app/dashboard/sidebar-actions.ts` | `API_URL` | ✓ |
| `client-panel/src/lib/api.ts` | `NEXT_PUBLIC_API_URL` | ✗ |
| `client-panel/.../file-manager/data.ts` | `NEXT_PUBLIC_API_URL` | ✗ |

Stąd cały kształt objawu:

- **panel admina działał** — `staff-api.ts` czytał zmienną wewnętrzną,
- **zakładki jednak się pojawiały** — `session-profile.ts` też ją czytał, więc
  nawigacja wracała szybko, tylko czekała na resztę strony,
- **„Otwarte zgłoszenia: 3" wczytywało się poprawnie** — i to była jedyna
  obserwacja, której przez pół dnia nie umiałem wyjaśnić. `support/actions.ts`
  nie korzysta z `apiFetch`, tylko woła `fetch` z własnym `process.env.API_URL`.
  Ten kafelek nigdy nie przechodził przez zepsutą drogę.
- **za to „Punkty EKO: 0" i saldo „0,00 K" były kłamstwem** — oba zapytania
  szły przez `apiFetch`, padały, a `.catch(() => [])` i `.catch(() => null)`
  zamieniały awarię w zero. Klient patrzył na saldo swojego portfela i widział
  zero, bo API nie odpowiadało.
- **tylko dwa kafelki krzyczały** — w `dashboard-data.ts` `/services`
  i `/domains` mają jawną obsługę błędu, a pozostałe pięć zapytań kończy się
  `.catch(() => null)` i **po cichu** zwraca pustkę. Portfel `0,00 K` to nie
  było saldo, to był połknięty błąd.

Awaria czytała się więc jak „coś z siecią", „coś z bazą", „coś z firewallem".
Straciliśmy na tych tropach kilka godzin.

## Czego szukaliśmy po drodze i co się nie potwierdziło

| hipoteza | jak obalona |
|---|---|
| anty-skan blokuje węzeł | wypięcie `VERRIS_ANTISCAN` z OUTPUT nic nie zmieniło |
| wyczerpana pula Postgresa | `1 aktywne, 0 idle in transaction, 16/100` |
| wolny DNS w kontenerze | `postgres` 5 ms, `api.nbp.pl` 1 ms, wszystko poniżej 100 ms |
| martwy rejestrator | `api.openprovider.eu` → `200` w 225 ms |
| `node-pl-01` nie odpowiada | prawda, ale nieistotna — patrz niżej |

### Ustalenie poboczne: firewall nigdy nie widział kontenerów

`VERRIS_ANTISCAN`, `VERRIS_EGRESS_BOGON` i `VERRIS_EGRESS_STRICT` wiszą
wyłącznie w łańcuchu **OUTPUT**, czyli dotyczą pakietów tworzonych lokalnie
przez host. Ruch z kontenerów przechodzi przez **FORWARD → DOCKER-FORWARD →
ACCEPT**, a `DOCKER-USER` jest pusty.

**Cały egress aplikacji jest poza zasięgiem hardeningu z X-36.** To nie jest
przyczyna tej awarii, ale to dziura wielkości całego produktu i osobna pozycja
w backlogu. Przy okazji potwierdziło się pomiarem to, co w X-36 było tylko tezą:
`VERRIS_EGRESS_STRICT` to dwa `RETURN` i nic więcej.

### Ustalenie poboczne: `node-pl-01` jest wyłączony

`62.238.0.223` odpowiada tylko na porcie 22; 80, 443, 2222, 8080, 9000 —
`ECONNREFUSED`. Rekord w bazie ma `status = ACTIVE`. To stary węzeł testowy,
świadomie odstawiony do czasu testów końcowych (ustalenie Dominika,
2026-08-25), więc nie naprawiamy go teraz. **Do backlogu:** rekord serwera
mówi `ACTIVE` o maszynie, która nie nasłuchuje — panel nie ma jak o tym
powiedzieć prawdy.

## Rozwiązanie

Dwa pliki, po jednej linii każdy — kolejność ma znaczenie, bo zmienna publiczna
jest zawsze ustawiona i postawiona pierwsza przesłoniłaby wewnętrzną:

```ts
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
```

`API_URL: http://api:3000` **było już podawane** kontenerowi
(`docker-compose.prod.yml`, linia 294). Nie brakowało konfiguracji — brakowało
jej odczytu.

`eco/page.tsx` zostaje bez zmian: składa adres odznaki, który ogląda
przeglądarka, więc adres publiczny jest tam jedynym poprawnym.

## Strażnik

`apps/api/src/test/adres-api-po-stronie-serwera.spec.ts`. Chodzi po kodzie
czterech paneli, pomija moduły `'use client'`, znajduje nazwy związane
z `NEXT_PUBLIC_API_URL` i sprawdza, **czy trafiają do `fetch(`**. Jeśli tak —
wyrażenie musi czytać także zmienną spoza przestrzeni `NEXT_PUBLIC_`, i to
przed publiczną. Nie narzuca jednej nazwy zmiennej (panele używają `API_URL`,
strona statusu `VERRIS_API_URL`) — narzuca zasadę.

Ostatnia asercja domyka drugą połowę: każda taka zmienna wewnętrzna musi być
naprawdę podawana kontenerom w `docker-compose.prod.yml`. Fallback na zmienną,
której nikt nie ustawia, jest gorszy niż jego brak, bo wygląda na przemyślany.

**Dowód, że strażnik działa** — po cofnięciu poprawki w `api.ts`:

```
✕ żaden serwerowy fetch panelu nie wychodzi na adres publiczny
✓ strażnik faktycznie łapie kod sprzed X-37
✓ strażnik przepuszcza poprawny wzorzec
✓ strażnik milczy, gdy adres publiczny służy przeglądarce, nie fetchowi
✓ każda zmienna wewnętrzna jest naprawdę podawana kontenerom
✕ panel klienta i panel personelu używają tego samego wzorca
Tests: 2 failed, 4 passed, 6 total

  apps/client-panel/src/lib/api.ts → API_URL: czyta tylko NEXT_PUBLIC_API_URL
  (adres przeglądarki), a wynik trafia do fetch() po stronie serwera
```

Po przywróceniu poprawki: 6/6.

## Czego ten dowód NIE obejmuje

- **Nie wiemy, kiedy hairpin przestał działać ani dlaczego.** Wiemy, że nie
  działa teraz, i że po poprawce panel przestaje od niego zależeć. Sama pętla
  pozostaje zepsuta i nikt jej nie pilnuje.
- **Nie naprawiliśmy braku timeoutu.** `apiFetch` woła `fetch()` bez `signal`,
  więc domyślny budżet undici na nagłówki wynosi **300 s**. To jest wzmacniacz,
  który zamienił jeden zły adres w niedziałający panel — patrz `X-38`.
- **Nie ruszyliśmy `.catch(() => null)`** w `dashboard-data.ts`. Pięć zapytań
  nadal połyka błędy i pokazuje pustkę zamiast prawdy. Portfel pokazujący
  `0,00 K` przy awarii API jest kłamstwem o pieniądzach klienta.
- Strażnik pilnuje `fetch(`. Zapytanie przez inną bibliotekę HTTP przejdzie
  mu przed nosem.

## Do backlogu

1. **`X-38`** — brak timeoutu w `apiFetch`.
2. **Ciche `.catch(() => null)`** w `dashboard-data.ts` — pustka nie do
   odróżnienia od zera.
3. **Egress kontenerów poza hardeningiem** — łańcuchy X-36 wiszą w OUTPUT,
   ruch aplikacji idzie przez FORWARD.
4. **`Server.status = ACTIVE`** dla maszyny, która nie nasłuchuje.
