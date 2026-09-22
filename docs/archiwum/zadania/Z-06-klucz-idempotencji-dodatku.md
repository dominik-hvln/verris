# `Z-06` — Klucz idempotencji obciążenia za dodatek

| | |
|---|---|
| **Sprint** | 2 (2026-08-21) |
| **Priorytet** | **BLOKER STARTU** → zamknięte |
| **Nakład** | planowany 6 h · rzeczywisty 3 h |
| **Zależy od** | — |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 |

---

## Problem

Podwójne kliknięcie „Kup dodatek" obciążało portfel dwa razy. Dziesięć kliknięć — dziesięć razy. Mechanizm ochrony przed podwójnym obciążeniem istniał i był poprawnie napisany; po prostu nie miał czego porównywać.

## Dowód przed

```ts
// apps/api/src/addons/addon.service.ts:110 (przed)
await this.wallet.debit({
  userId,
  type: WalletTxType.CHARGE_USAGE,
  amount,
  description: `Dodatek: ${def.name}`,
  idempotencyKey: `addon-${userId}-${slug}-${Date.now()}`,
  subscriptionId: subscriptionId ?? undefined,
});
```

Księga portfela robi dokładnie to, co trzeba — `wallet-ledger.service.ts` sprawdza klucz przed transakcją i drugi raz zwraca istniejący wpis zamiast obciążać:

```ts
if (input.idempotencyKey) {
  const existing = await this.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;
}
```

Tyle że `Date.now()` sprawia, że **każde kliknięcie generuje inny klucz**. Zabezpieczenie porównywało klucz z niczym.

**Stan w macierzy przed:** `ATRAPA` — i to jest właściwe słowo. Kod wyglądał na zabezpieczony.

## Rozwiązanie

Samo usunięcie `Date.now()` nie wystarcza i to jest sedno tego zadania. Klucz stały na zawsze (`addon-${userId}-${slug}`) zablokowałby **drugi, świadomy zakup** — a dedykowane IP dla drugiej usługi czy drugą konfigurację przez specjalistę klient ma prawo kupić. Poprawka, która chroni przed podwójnym obciążeniem kosztem uniemożliwienia sprzedaży, jest gorsza od błędu.

Stąd dwie drogi, w tej kolejności:

**1. Klucz od klienta (mocniejsza).** Panel generuje UUID przy pierwszym kliknięciu i trzyma go w `useRef` do skutku:

```tsx
const klucze = useRef<Record<string, string>>({});
klucze.current[slug] ??= `${slug}-${crypto.randomUUID()}`;
```

Kasujemy go dopiero po udanym zakupie — od tego momentu kolejne kliknięcie to świadoma decyzja o drugim zakupie i dostaje nowy klucz.

Klucz musi powstać **w komponencie**, nie w akcji serwerowej. Akcja wykonuje się od nowa przy każdym kliknięciu, więc klucz tworzony tam byłby za każdym razem inny — czyli dokładnie ten sam błąd, tylko przeniesiony o warstwę wyżej. Zastawiłem na siebie tę pułapkę przy pierwszym podejściu i wpadłem w nią.

**2. Okno czasu (zapasowa).** Gdy klucza brak — starszy klient, wywołanie z innego miejsca — serwis wylicza własny:

```ts
`addon:v1:${userId}:${slug}:${subscriptionId ?? '-'}:${Math.floor(teraz / OKNO)}`
```

Okno to pięć minut. Podwójne kliknięcie, retry po zerwanej sieci i cofnięcie formularza mieszczą się w sekundach; klient, który naprawdę chce drugie dedykowane IP, zrobi to później. **Ta droga ma znaną słabość:** dwa kliknięcia po dwóch stronach granicy okna wpadną do dwóch różnych przedziałów. Przy odstępie liczonym w sekundach to zdarzenie skrajnie rzadkie, ale nie niemożliwe — i dlatego jest to droga zapasowa, a nie główna.

### Poprawka portfela to za mało

Gdyby zmienić tylko klucz, pieniądze byłyby bezpieczne, ale reszta nie: klient dostałby dziesięć zgłoszeń do BOK-u, dziesięć wpisów w historii zakupów i dziesięć razy przedłużone wsparcie priorytetowe. Dlatego `purchase()` sprawdza istniejący zakup **przed** obciążeniem i wychodzi całą ścieżką:

```ts
const istniejacy = await this.prisma.purchasedAddon.findUnique({ where: { idempotencyKey: klucz } });
if (istniejacy) return this.odpowiedzZRekordu(istniejacy);
```

Odpowiedź niesie `duplikat: true` i komunikat wprost mówiący, że **nie pobraliśmy opłaty drugi raz** — klient po podwójnym kliknięciu nie powinien zostać z wątpliwością.

### Wyścig

Dwa równoległe żądania mogą przejść obok sprawdzenia wyżej. Wtedy broni baza: `PurchasedAddon.idempotencyKey` ma unikalny indeks, więc drugie `create` dostaje `P2002`, a serwis zwraca rekord utworzony przez pierwsze. Portfel i tak obciąży raz, bo księga ma własny unikalny klucz. Inny kod błędu niż `P2002` **nie jest połykany** — jest osobny test, który tego pilnuje.

### Przy okazji: endpoint nie miał DTO

Kontroler brał surowe `body: { slug: string; subscriptionId?: string }`. `slug` był bezpieczny przez przypadek (odbijał się od katalogu w kodzie), ale `subscriptionId` szedł wprost do zapytania. Doszło `PurchaseAddonDto` z walidacją wszystkich trzech pól.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `libs/database/prisma/schema.prisma` | `PurchasedAddon.idempotencyKey String? @unique` |
| `libs/database/prisma/migrations/20260821220000_addon_idempotency/` | kolumna + unikalny indeks |
| `apps/api/src/addons/addon.service.ts` | `kluczIdempotencji`, sprawdzenie duplikatu, obsługa `P2002`, `odpowiedzZRekordu` |
| `apps/api/src/addons/dto/purchase-addon.dto.ts` | **nowy** — walidacja `slug`, `subscriptionId`, `idempotencyKey` |
| `apps/api/src/addons/addon.controller.ts` | DTO zamiast surowego `body` |
| `apps/client-panel/.../addons-client.tsx` | klucz w `useRef`, jeden na decyzję zakupu |
| `apps/client-panel/.../addons-actions.ts` | przekazanie klucza; **świadomie nie generuje go sam** |

Migracja: `20260821220000_addon_idempotency`. Kolumna jest nullable, bo rekordy sprzed tej daty klucza nie mają — w PostgreSQL `UNIQUE` dopuszcza wiele `NULL`-i, więc stare wiersze nie kolidują.
Zmienne środowiskowe: brak.

## Testy

`apps/api/src/addons/addon.service.spec.ts` — **20 przypadków**.

| Grupa | Co sprawdza |
|---|---|
| Kształt klucza | brak trzynastocyfrowego znacznika czasu; ten sam klucz dla dwóch zakupów pod rząd; **inny** dla innej usługi i innego użytkownika; klucz od klienta wygrywa |
| Powtórzony zakup | brak drugiego obciążenia, brak drugiego zgłoszenia, brak drugiego wpisu, odpowiedź z `duplikat: true`; **dziesięć kliknięć = jedno obciążenie i jedno zgłoszenie** |
| Wyścig | `P2002` zwraca istniejący zakup; inny kod błędu leci dalej |
| Pierwszy zakup | działa normalnie — obciążenie raz, klucz zapisany, tryb work-order tworzy zgłoszenie |
| Walidacja DTO | odrzuca slug ze spacją i z `'`, odrzuca `sub;1`, odrzuca za krótki klucz; przepuszcza realne wartości |

Grupa „inny dla innej usługi" jest tu równie ważna jak sama idempotencja — pilnuje, żeby poprawka nie zamieniła podwójnego obciążenia na niemożliwość drugiego zakupu.

**Czy testy czerwieniły się na starym kodzie?** **TAK — 10 z 20** po przywróceniu klucza z `Date.now()` i usunięciu sprawdzenia duplikatu.

Cały zestaw API: **41 zestawów, 310 testów, wszystkie zielone.** `client-panel` przechodzi `tsc` bez błędu.

## Dowód po

- `addon.service.ts` — `kluczIdempotencji`, `findUnique({ where: { idempotencyKey } })`, obsługa `P2002`
- `schema.prisma` — `idempotencyKey String? @unique`
- `addon.service.spec.ts` — 20 przypadków

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — 20 testów przechodzi lokalnie; potwierdzenie w CI przy najbliższym pushu
- [ ] D3 — **wymagane, bo pozycja dotyczy pieniędzy.** Do wykonania po wdrożeniu: kliknąć „Kup dodatek" dwa razy pod rząd na koncie testowym z zasilonym portfelem i sprawdzić, że saldo spadło **raz**, a w historii jest **jeden** wpis. Zapisać datę i godzinę.
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** `DZIAŁA`

Blokery startu: **8 → 7**.

## Czego to nadal nie robi

**Nie naprawia innych miejsc, w których klucz może być słaby.** Sprawdziłem: `Date.now()` w kluczu idempotencji występował tylko tutaj. Ale nie przejrzałem wszystkich kluczy pod kątem tego, czy są *właściwe* — to osobna, szersza robota. **Nowa pozycja `Z-11`.**

**Nie cofa podwójnych obciążeń, które już się wydarzyły.** Jeżeli ktoś kliknął dwa razy przed poprawką, ma dwa obciążenia w portfelu. Przegląd historycznych zakupów dodatków pod kątem duplikatów w krótkim odstępie — **dopisane do `Z-08`**, razem z przeglądem subskrypcji `MANUAL` i zleceń migracji. To już trzecia pozycja tej samej klasy: „poprawka blokuje przyszłość, nie mówi o przeszłości".

**Nie ma limitu zdroworozsądkowego na liczbę zakupów.** Klient może kupić trzydzieści konfiguracji przez specjalistę w trzydziestu oknach czasu. Limit tempa (10/h) to ogranicza, ale nie zatrzymuje. Czy powinien — to pytanie produktowe, nie techniczne.

## Ryzyko i wycofanie

**Migracja jest addytywna** — nowa kolumna nullable plus indeks. Nie przepisuje istniejących wierszy i nie blokuje tabeli na długo (`PurchasedAddon` jest mała). Wycofanie kodu bez wycofania migracji jest bezpieczne: kolumna zostanie nieużywana.

**Ryzyko fałszywej blokady:** klient, który świadomie kupuje ten sam dodatek dla tej samej usługi dwa razy w ciągu pięciu minut, dostanie odpowiedź „już wykupiony" zamiast drugiego zakupu. Komunikat mówi wprost, co się stało, więc nie jest to cicha porażka — ale jeżeli takie zgłoszenia się pojawią, okno trzeba skrócić albo wymusić klucz od klienta wszędzie.

## Wpływ na inne pozycje

- Zamyka `Z-06`, zdejmuje bloker startu (8 → 7).
- Otwiera `Z-11` — przegląd wszystkich kluczy idempotencji pod kątem poprawności, nie tylko obecności.
- Rozszerza `Z-08` o przegląd historycznych duplikatów zakupów.
