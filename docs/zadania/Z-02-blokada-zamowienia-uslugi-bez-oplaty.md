# `Z-02` — Blokada zamówienia usługi bez opłaty przez klienta

| | |
|---|---|
| **Sprint** | 1 (2026-08-21) |
| **Priorytet** | **BLOKER STARTU** → zamknięte |
| **Nakład** | planowany 6 h · rzeczywisty 4 h |
| **Zależy od** | — |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 (commit `fcf58db`) |

---

## Problem

Dowolne zarejestrowane konto mogło zamówić dowolną liczbę usług hostingowych za 0 zł. Wystarczyło w żądaniu `POST /subscriptions` podać `paymentSource: "MANUAL"`. Usługa stawała się `ACTIVE`, konto było zakładane na węźle, a portfel nie był obciążany i nie powstawała żadna faktura.

To bloker w rozumieniu przyjętej definicji: brak możliwości wystawienia poprawnego dokumentu księgowego przy jednoczesnym świadczeniu usługi.

## Dowód przed

Warstwa walidacji przepuszczała całe enum:

```ts
// apps/api/src/subscriptions/dto/subscription.dto.ts (przed)
@IsEnum(SubscriptionPaymentSource)
paymentSource!: SubscriptionPaymentSource;
```

`SubscriptionPaymentSource` zawiera `STRIPE_CARD`, `WALLET` i `MANUAL`. Serwis kierował `MANUAL` prosto do ścieżki bez obciążenia:

```ts
// apps/api/src/subscriptions/subscriptions.service.ts (przed)
if (dto.paymentSource === SubscriptionPaymentSource.MANUAL) {
  return this.provisionWithoutCharge(...);
}
```

Kontroler nie miał żadnego dodatkowego zabezpieczenia — tylko `JwtAuthGuard`, czyli „dowolny zalogowany".

Co czyni to szczególnie kłopotliwym: **ta sama luka była już zamknięta przy zmianie planu** (`plan-change.service.ts:206-213`), ale nie przy zakupie. Ktoś ją zobaczył, naprawił w jednym miejscu i nie sprawdził drugiego.

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

Dwie warstwy, bo jedna zawsze kiedyś odpadnie przy refaktoryzacji.

**Warstwa 1 — walidacja wejścia.** Zamiast całego enuma jawna lista dopuszczalna dla klienta:

```ts
export const CLIENT_PAYMENT_SOURCES: readonly SubscriptionPaymentSource[] = [
  SubscriptionPaymentSource.STRIPE_CARD,
  SubscriptionPaymentSource.WALLET,
];

@IsEnum(SubscriptionPaymentSource)
@IsIn(CLIENT_PAYMENT_SOURCES, {
  message: 'Niedozwolone źródło płatności dla zamówienia klienta.',
})
paymentSource!: SubscriptionPaymentSource;
```

**Warstwa 2 — warunek w serwisie.** Na wypadek gdyby serwis zawołał kto inny niż kontroler klienta:

```ts
async create(userId: string, dto: CreateSubscriptionDto, opts: { allowManual?: boolean } = {}) {
  if (dto.paymentSource === SubscriptionPaymentSource.MANUAL && !opts.allowManual) {
    throw new ForbiddenException('Źródło płatności MANUAL jest zarezerwowane dla operatora.');
  }
```

**Dlaczego `allowManual` jako opcja, a nie usunięcie `MANUAL` z enuma.** `MANUAL` jest realną, potrzebną ścieżką: konta gratisowe, rozliczenia poza systemem, rekompensaty. Usunięcie wartości z enuma w bazie oznaczałoby migrację istniejących subskrypcji i utratę informacji, jak powstały. Domyślna odmowa z jawnym opt-inem zostawia funkcję operatorowi i zabiera ją klientowi — dokładnie o to chodziło.

**Dlaczego nie `@Roles(Role.ADMIN)` na całym endpointcie.** Bo to endpoint klienta i ma nim zostać. Problem nie polegał na tym, że klient może zamawiać, tylko na tym, że mógł wybrać sposób płatności, który nie płaci.

**Dodatkowo — limit tempa:**

```ts
@RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'subscriptions:create' })
@Post()
```

Nawet po zamknięciu `MANUAL` zakładanie usług w pętli to realny koszt: każde zamówienie to konto na węźle, wpis w DirectAdminie i miejsce na dysku. Dziesięć na godzinę na konto to więcej, niż potrzebuje jakikolwiek prawdziwy klient.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/subscriptions/dto/subscription.dto.ts` | `CLIENT_PAYMENT_SOURCES` + `@IsIn` na `paymentSource` |
| `apps/api/src/subscriptions/subscriptions.service.ts` | parametr `opts.allowManual`, `ForbiddenException` przy `MANUAL` |
| `apps/api/src/subscriptions/subscriptions.controller.ts` | `@RateLimit` 10/h na `POST /subscriptions` |
| `apps/api/src/subscriptions/subscriptions.create-guard.spec.ts` | nowy — 8 przypadków |

Migracje bazy: brak — enum w bazie bez zmian, istniejące subskrypcje `MANUAL` działają dalej.
Zmienne środowiskowe: brak.

## Testy

`apps/api/src/subscriptions/subscriptions.create-guard.spec.ts`

| Test | Co sprawdza |
|---|---|
| `odrzuca MANUAL` | walidacja DTO zwraca błąd `isIn` |
| `przepuszcza WALLET` | poprawne źródło nie jest blokowane |
| `przepuszcza STRIPE_CARD` | j.w. |
| `odrzuca wartość spoza enuma` | `"DARMOWE"` nie przechodzi |
| `lista dozwolonych źródeł nie zawiera MANUAL` | pilnuje samej stałej — gdyby ktoś dopisał `MANUAL` do listy, `@IsIn` przestałoby chronić, a pozostałe testy nadal by przechodziły |
| `odrzuca MANUAL bez jawnego allowManual` | warstwa serwisowa |
| `odrzuca MANUAL także przy allowManual: false` | jawne `false` nie jest traktowane jak brak |
| `przy allowManual: true przechodzi dalej` | ścieżka operatorska nie została przy okazji zepsuta |

Warstwa serwisowa testowana na atrapach z `Proxy`, które rzucają przy pierwszym dotknięciu którejkolwiek z dwunastu zależności. Konstrukcja celowa: gdyby warunek `MANUAL` kiedyś zniknął, test nie przejdzie po cichu — wywali się na **innym** błędzie niż oczekiwany, a to też jest sygnał.

**Czy test najpierw czerwienił się na starym kodzie?** **TAK.** Sprawdzone przez cofnięcie obu warstw: bez `@IsIn` przypadek „odrzuca MANUAL" zwraca zero błędów walidacji, bez warunku w serwisie przypadki serwisowe wywalają się na atrapie zamiast na `ForbiddenException`.

## Dowód po

- `apps/api/src/subscriptions/dto/subscription.dto.ts` — `CLIENT_PAYMENT_SOURCES`, `@IsIn`
- `apps/api/src/subscriptions/subscriptions.service.ts` — warunek `MANUAL && !opts.allowManual`
- `apps/api/src/subscriptions/subscriptions.create-guard.spec.ts` — 8 przypadków

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — test przechodzi lokalnie; potwierdzenie w CI przy pierwszym przebiegu
- [ ] D3 — **wymagane, bo pozycja dotyczy pieniędzy.** Do wykonania po wdrożeniu: próba zamówienia z `paymentSource: MANUAL` z konta klienckiego na produkcji, oczekiwana odpowiedź 400/403, wpis z datą i godziną tutaj.
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** `DZIAŁA`

Liczba blokerów startu: **11 → 10**.

## Czego to nadal nie robi

Nie dotyka `Z-01` — płatność portfelem nadal nie generuje faktury. To osobny bloker i osobne zadanie w sprincie 4. Zamknięcie `Z-02` oznacza tylko, że nie da się już zamówić usługi bez obciążenia; nie oznacza, że każde obciążenie ma dokument.

Nie audytuje istniejących subskrypcji `MANUAL` w bazie. Jeżeli ktoś zdążył skorzystać z tej luki przed poprawką, ten kod tego nie znajdzie. Przegląd istniejących rekordów `MANUAL` z datą utworzenia i kontem właściciela — **nowa pozycja do dopisania do backlogu**, jednorazowe zapytanie, nie funkcja.

## Ryzyko i wycofanie

Ryzyko: gdyby gdzieś w kodzie istniała ścieżka operatorska wołająca `create()` bez `allowManual`, przestałaby działać. Sprawdzone — jedyne wywołania `create()` idą z kontrolera klienta. Ścieżka operatorska używa `provisionWithoutCharge` bezpośrednio.

Drugie ryzyko: `@RateLimit` 10/h może uderzyć w migrację, gdyby ktoś przenosił hurtem wiele usług jednego klienta. Wtedy limit trzeba podnieść dla ścieżki operatorskiej, nie zdejmować z klienckiej.

Wycofanie: usunięcie `@IsIn` i warunku. Bez migracji, bez zmian stanu w bazie.

## Wpływ na inne pozycje

- Zamyka `Z-02`, zdejmuje jeden bloker startu.
- Nie zmienia `Z-01`, `Z-04`, `Z-05`, `Z-06` — to niezależne dziury w tym samym obszarze pieniędzy.
- Otwiera nową, drobną pozycję: przegląd istniejących subskrypcji `MANUAL`.
