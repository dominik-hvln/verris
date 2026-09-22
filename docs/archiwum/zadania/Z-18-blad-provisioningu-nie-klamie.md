# `Z-18` — Poprawna kontrola, której się kłamie

| | |
|---|---|
| **Sprint** | 2 (poprawka) · **D3 w sprincie 8**, po postawieniu węzła #1 |
| **Priorytet** | **BLOKER STARTU** — decyzja właściciela produktu 2026-08-23 |
| **Nakład** | S (~3 h) |
| **Zależy od** | `X-30` (to jego alarm to ujawnił) |
| **Status** | naprawione w kodzie (D2), **pozycja otwarta do dowodu D3** |
| **Data** | 2026-08-23 |

---

## Jak to wyszło

`X-30` naprawiło alerting i w ciągu dziesięciu minut zapaliła się pierwsza reguła
z **prawdziwego** powodu: `VerrisProvisioningQueueFailed`. W kolejce leżały cztery martwe joby.

W panelu operatora stało przy nich:

```
DirectAdmin package "starter" is missing on the node and could not be created
automatically. Contact support.
```

W audycie stało co innego:

```
2026-07-10  ensureUserPackage  starter  connect ECONNREFUSED 62.238.0.223:2222
2026-07-07  ensureUserPackage  starter  connect ECONNREFUSED 62.238.0.223:2222
2026-05-30  createAccount               DirectAdmin API Error: Unable to Create User
                                        — A valid IP was not provided
```

**Węzeł nie przyjmował połączeń. Z pakietem nie było nic nie tak.**

Same joby okazały się nieszkodliwe — konto testowe właściciela, domeny `test.pl` / `testowa.pl` /
`hvln.pl`, sprzed trzech miesięcy, z czasów gdy węzeł testowy jeszcze istniał (dziś nie ma go
wcale). Ale komunikat, który je opisywał, doprowadził mnie do hipotezy o złym mapowaniu planów na
pakiety DirectAdmina — i była to hipoteza **całkowicie chybiona**. Zapisuję to, bo dokładnie na tym
polega koszt takiego błędu: nie na tym, że coś nie działa, tylko że wszyscy patrzą nie tam.

## Mechanizm

`provisioning.service.ts` łapał prawdziwy błąd, zapisywał go do audytu — i rzucał dalej **stały
napis**:

```ts
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  await this.audit.record({ ... error: msg });          // prawda zostaje tutaj
  throw new ServiceUnavailableException(
    `DirectAdmin package "${slug}" is missing on the node…`);   // w górę idzie zmyślona
}
```

A wyżej, w `provisioning-queue.service.ts`:

```ts
const errCategory = categorizeProvisioningError(msg);   // dostaje TEN wyprany napis
if (!isLastAttempt && errCategory === 'transient') { /* ciche ponowienie */ }
```

Klasyfikator jest napisany **poprawnie** — ma `econnrefused` na liście błędów przejściowych,
razem z `timeout`, `econnreset`, `socket hang up`. Tylko nigdy nie zobaczy tego słowa.

## Dlaczego to dotyka pieniędzy

Przy prawdziwym kliencie i chwilowym zerwaniu sieci:

1. próba 1 → `ECONNREFUSED` przebrany za „brak pakietu" → `permanent`;
2. ścieżka twardej porażki odpala się **już przy pierwszej próbie**: subskrypcja na `FAILED`,
   **zwrot środków do portfela**, status `PENDING_PAYMENT`;
3. `throw err` → BullMQ ponawia (`attempts: 3`, backoff wykładniczy);
4. próba 2 przechodzi → konto powstaje, `provisioning.service.ts:299` ustawia subskrypcję na
   **`ACTIVE`**.

**Klient ma działający hosting i odzyskane pieniądze.** Zwrot jest idempotentny
(`sub-${id}-initial-refund`), więc nic go nie cofnie ani nie powtórzy — po prostu zostaje.

Nie twierdzę, że to się zdarzyło. Te cztery joby padły do końca, bo węzeł był wyłączony na dobre.
To wada **uśpiona**, leżąca dokładnie na ścieżce pierwszego płacącego klienta.

## Rodzina błędów — nowy wariant

To **nie** jest „kontrola, która melduje zamiast zatrzymywać" (`X-14`, `X-23`, `H-19`, `X-27`).
Tam mechanizm istniał i niczego nie bramkował.

To **poprawna kontrola, której się kłamie.** Guard jest dobry, decyzja jest dobra, lista wyjątków
jest kompletna — a wejście zostało po drodze wyprane.

Blisko jej też do rodziny „strażnik dopasowuje własną prozę", która ma w tym projekcie już
dziesięć wystąpień. Widać ją tu wprost: jeden z trzech komunikatów był ułożony tak, żeby **trafić**
w listę błędów przejściowych — `'CloudLinux LVE limits could not be applied on this node.'`
kontra `lower.includes('cloudlinux lve limits could not be applied')`. Działało przypadkiem,
dopóki ktoś nie poprawiłby stylistyki zdania.

## Rozwiązanie

**Klasyfikujemy błąd, nie jego prozę.**

`apps/api/src/subscriptions/provisioning-error.ts`:

```ts
export class BladEtapuProvisioningu extends ServiceUnavailableException {
  constructor(
    readonly etap: string,
    readonly przyczyna: string,          // ORYGINALNA treść błędu
    komunikatDlaCzlowieka: string,
  ) {
    super(`${komunikatDlaCzlowieka} [${etap}: ${przyczyna}]`);
  }
}
```

`kategoriaBledu(err)` pyta obiekt o `przyczyna` i dopiero na niej odpala istniejący klasyfikator.
Napis zostaje jako ścieżka zapasowa — nie każdy błąd przejdzie przez nasze opakowanie, awaria może
wyjść z Prismy, z sieci, skądkolwiek.

### Dlaczego przyczyna jest doklejona także do `message`

To nie ozdoba. Panel operatora pokazuje `job.failedReason` z BullMQ, a to jest po prostu
`Error.message`; kolumna `failedCategory` liczy się z **tego samego napisu** (`:255`). Gdyby
przyczyna została wyłącznie we właściwości obiektu, panel dalej opowiadałby zmyśloną historię —
czyli dokładnie to, co dziś kazało zaglądać do `AuditLog`.

Audyt dostał osobne pole `przyczyna` obok `error`, żeby następne śledztwo nie zaczynało się od
rozbierania komunikatu na części.

## Strażnik

`apps/api/src/test/blad-provisioningu-nie-klamie.spec.ts` — 18 asercji:

- cztery prawdziwe treści z produkcji (`ECONNREFUSED`, `ETIMEDOUT`, `socket hang up`,
  `fetch failed`) są przejściowe — **i pozostają przejściowe po zawinięciu w komunikat dla
  człowieka**. To jest cała pozycja w jednym zdaniu;
- błąd trwały pozostaje trwały (`A valid IP was not provided`);
- zwykły `Error` i goły napis nadal dają się sklasyfikować — ścieżka zapasowa żyje;
- `message` niesie przyczynę, więc panel i BullMQ też widzą prawdę;
- żaden blok `catch` w `provisioning.service.ts` nie rzuca już gołego `ServiceUnavailableException`;
- kolejka klasyfikuje **obiekt** (`kategoriaBledu(err)`), nie napis;
- audyt zapisuje `przyczyna` **w bloku catch** `runJob` — asercja celowo patrzy na ten blok, a nie
  na cały plik, bo słowo pada też w komentarzu i sprawdzanie całego pliku przechodziłoby, nic nie
  sprawdzając.

**Czerwieni się na starym kodzie: 4 z 18.** Czternaście przechodziło, bo dotyczą zachowania
`kategoriaBledu`, której przed poprawką po prostu nie było — redness siedzi w asercjach
strukturalnych i tak ma być. Mówię o tym wprost, żeby liczba „4 z 18" nie wyglądała słabiej,
niż jest.

## Czego to NIE dowodzi

**Nie ma dowodu D3 i nie da się go dziś zdobyć — nie ma węzła obliczeniowego.** Testowy został
zdjęty, więc ścieżki provisioningu nie sposób przejść na produkcji.

Dowód wygląda tak: na węźle #1 (sprint 8) uruchomić provisioning, przerwać połączenie do DA
w trakcie i pokazać w audycie **ponowienie** zamiast zwrotu środków, a potem konto założone przy
drugiej próbie. Do tego czasu pozycja zostaje otwarta jako **bloker startu** — bo dotyczy
pieniędzy, a reguła audytu wymaga dla pieniędzy poziomu D3.

## Czego to nie obejmuje

- **Innych miejsc, gdzie prawdziwy błąd może być prany.** Sprawdziłem ścieżkę provisioningu;
  Stripe, migracje i autoskalowanie mają własne bloki `catch` i nie były przeglądane pod tym kątem.
  Warte osobnego przejścia.
- **Sensowności samego zwrotu przy twardej porażce.** Zwrot jest właściwy, gdy błąd naprawdę jest
  trwały. Ta pozycja naprawia rozpoznanie, nie decyzję.
- **Czterech martwych jobów w kolejce.** Zostają do posprzątania po tej poprawce — decyzja
  właściciela produktu, żeby czyścić już na kodzie, który zapisuje prawdziwą przyczynę.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-30` | to jego alarm to znalazł — pierwsza reguła zapalona z prawdziwego powodu |
| `Z-05` | ta sama rodzina: odporność ścieżki płatniczej na błąd w trakcie obsługi |
| `Z-01` | pieniądze wymagają D3, nie D2 |
| `PB-02` | dowód D3 zależy od węzła #1 |

## Dowód po

- `apps/api/src/subscriptions/provisioning-error.ts` — `BladEtapuProvisioningu`
- `apps/api/src/subscriptions/provisioning-queue.service.ts` — `kategoriaBledu`, klasyfikacja
  obiektu, `przyczyna` w audycie
- `apps/api/src/subscriptions/provisioning.service.ts` — trzy etapy DA bez prania przyczyny
- `apps/api/src/test/blad-provisioningu-nie-klamie.spec.ts` — 18 asercji, 4 czerwone na starym kodzie

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**Stan w macierzy po:** `CZĘŚCIOWE` / `CZĘŚCIOWY`, `BLOKER STARTU` — do dowodu na węźle #1.
