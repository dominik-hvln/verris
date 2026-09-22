# `Z-04` — Guard uprawnień subkont: domyślna odmowa

| | |
|---|---|
| **Sprint** | 2 (2026-08-21) |
| **Priorytet** | **BLOKER STARTU** → zamknięte |
| **Nakład** | planowany 16 h · rzeczywisty 4 h |
| **Zależy od** | — |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 |

---

## Problem

Subkonto klienta — czyli konto pracownika albo agencji, działające w ramach konta właściciela — miało dostęp do **każdej trasy API, której nikt nie dopisał do listy dopasowań**. Nie do części tras. Do każdej.

Subkonto z jedynym nadanym uprawnieniem `TICKETS_READ` mogło między innymi:

| | |
|---|---|
| `POST /vps` | zamówić VPS-a na portfel właściciela |
| `DELETE /vps/:id` | skasować VPS-a właściciela |
| `POST /addons/purchase` | kupić dodatek z portfela właściciela |
| `POST /partners/me/payouts/bank` | zlecić wypłatę prowizji właściciela na konto bankowe |
| `POST /me/account-deletion` | **usunąć konto właściciela** |
| `POST /me/data-export` | pobrać eksport RODO wszystkich danych właściciela |
| `POST /users/iam/invites` | zaprosić kolejne subkonta |
| `DELETE /users/iam/members/:id` | usunąć pozostałe subkonta |
| `POST /email-marketing/…/campaigns/…/send` | wysłać kampanię z domeny właściciela |

Audyt opisał to jako „guard kończy się `return []`". Przemiatanie wszystkich tras pokazało skalę: **148 z 347 tras dostępnych dla konta klienckiego nie wymagało żadnego uprawnienia.**

## Dowód przed

```ts
// apps/api/src/common/guards/customer-permissions.guard.ts (przed)
export function inferCustomerRoutePermissions(method: string, path: string): CustomerPermission[] {
  // …dziesięć dopasowań po fragmencie ścieżki…
  return [];        // ← nierozpoznana trasa = brak wymogu = PRZEPUŚĆ
}
```

i w samym strażniku:

```ts
if (required.length === 0) return true;
```

Pusta lista znaczyła dwie różne rzeczy naraz: „ta trasa świadomie nie wymaga uprawnienia" oraz „nie wiem, co to za trasa". Pierwsze jest decyzją, drugie jest przeoczeniem — i oba kończyły się przepuszczeniem.

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

**Odwrócenie domyślnej odpowiedzi.** Nierozpoznana trasa jest teraz odmawiana:

```ts
export type WymogTrasy = CustomerPermission[] | 'ODMOWA';

export function inferCustomerRoutePermissions(method: string, path: string): WymogTrasy {
  for (const regula of REGULY_TRAS) {
    if (regula.pasuje(normalized)) return odczyt ? regula.odczyt : regula.zapis;
  }
  return 'ODMOWA';
}
```

Typ `WymogTrasy` rozdziela dwa znaczenia, które wcześniej dzieliły jedną pustą tablicę: `[]` to teraz **świadoma decyzja** („ta trasa nie wymaga uprawnienia"), a `'ODMOWA'` to brak dostępu. Kompilator pilnuje, żeby każda gałąź zwróciła jedno albo drugie.

**Lista reguł zamiast łańcucha `if`.** `REGULY_TRAS` to uporządkowana tablica; każda pozycja ma osobny wymóg dla odczytu i zapisu oraz pole `po_co` z jednozdaniowym uzasadnieniem. Uzasadnienia nie są ozdobą — przy przeglądzie za pół roku różnica między „VPS wymaga SERVICES_MANAGE" a „zakup dodatku wymaga BILLING_MANAGE, bo to wydatek z portfela" jest dokładnie tym, czego nie da się odtworzyć z kodu.

**Trzy kategorie decyzji:**

1. **Bez wymogu** — treści publiczne, endpointy techniczne, własne powiadomienia, zgody i preferencje marketingowe, odczyt własnego profilu.
2. **Odmowa twarda** — rzeczy właściciela konta: usunięcie konta, eksport RODO, DPA, program partnerski i resellerski (z wypłatą prowizji), zarządzanie subkontami, zmiana hasła konta nadrzędnego, powierzchnia węzła i agenta. Te są zamknięte **niezależnie od nadanych uprawnień** — nie ma uprawnienia, które by je otwierało.
3. **Za uprawnieniem** — reszta, wg katalogu `CustomerPermission`.

**Jedna decyzja warta odnotowania:** zakup dodatku (`POST /addons/purchase`) wymaga `BILLING_MANAGE`, a nie `SERVICES_MANAGE`. Uzasadnienie: to wydatek z portfela właściciela, a nie konfiguracja usługi. Subkonto, któremu dano prawo zarządzać hostingiem, nie dostaje przy okazji prawa wydawania pieniędzy.

**Odmowa jest wyjątkiem, nie `false`.** `'ODMOWA'` rzuca `ForbiddenException` z komunikatem „Ta operacja jest dostępna wyłącznie dla właściciela konta". Zwykły brak uprawnienia zwraca `false` (standardowe 403 od Nesta). Różnica ma znaczenie w obsłudze: pierwsze znaczy „poproś właściciela", drugie „poproś o uprawnienie".

**Właściciela to nie dotyczy.** Strażnik nadal wychodzi na `true` przy `customerOwnerId == null`. Zmiana dotyczy wyłącznie sesji subkont.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/common/guards/customer-permissions.guard.ts` | typ `WymogTrasy`, tablica `REGULY_TRAS` z uzasadnieniami, domyślna `'ODMOWA'`, `ForbiddenException` |
| `apps/api/src/common/guards/customer-permissions.guard.spec.ts` | przepisany — testy zachowania zamiast testów funkcji |
| `apps/api/src/test/customer-permissions-coverage.spec.ts` | **nowy** — przemiatanie wszystkich tras |

Migracje bazy: brak
Zmienne środowiskowe: brak

## Testy

**`customer-permissions.guard.spec.ts` — 25 przypadków, na zachowaniu `canActivate`.**

Poprzednia wersja tego pliku sprawdzała wyłącznie funkcję wnioskującą, czyli kawałek logiki wyrwany ze strażnika. Audyt wytknął to osobną pozycją (`X-10`): testy RBAC sprawdzały, że dekorator napisano, a nie że strażnik blokuje. Teraz kontekst żądania jest podstawiony, a testy mówią o dostępie.

Osobna grupa przechodzi po dziewięciu trasach zastrzeżonych dla właściciela i sprawdza, że **subkonto z kompletem wszystkich dwunastu uprawnień** i tak dostaje `ForbiddenException`.

**`customer-permissions-coverage.spec.ts` — przemiatanie.**

Odwrócenie domyślnej odpowiedzi tworzy nowe ryzyko: ktoś dodaje trasę, subkonta dostają 403, nikt nie wie dlaczego. Test wylicza **pełny zbiór tras zamkniętych dla subkont** (55 pozycji) i porównuje z listą zapisaną w pliku. Nowa trasa, która wpada do odmowy bez wpisu, zapala test — autor musi wtedy podjąć decyzję zamiast odkryć ją ze zgłoszenia klienta.

Trzeci test tej samej grupy pilnuje odwrotnego błędu: żadna trasa hostingu, rozliczeń, domen ani zgłoszeń nie może trafić do odmowy przy okazji.

**Czy testy czerwieniły się na starym kodzie?** **TAK — 15 z 28 przypadków** przy podstawieniu oryginalnej wersji strażnika. Osobno sprawdzone też samo odwrócenie domyślnej odpowiedzi (`'ODMOWA'` → `[]` przy zachowaniu reszty): czerwieni się przypadek „domyślna odpowiedź dla nieznanej trasy". Test przemiatający **nie** reaguje na tę zmianę i to jest poprawne — jego zadaniem jest pilnowanie nowych tras, nie domyślnej odpowiedzi.

Cały zestaw API: **39 zestawów, 287 testów, wszystkie zielone.**

## Dowód po

- `customer-permissions.guard.ts` — `return 'ODMOWA'` na końcu `inferCustomerRoutePermissions`
- `customer-permissions.guard.ts` — `throw new ForbiddenException` w `canActivate`
- `customer-permissions-coverage.spec.ts` — `ODMOWA_OCZEKIWANA`, 55 tras

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — 28 testów przechodzi lokalnie; potwierdzenie w CI przy najbliższym pushu
- [ ] D3 — **wymagane, bo pozycja dotyczy dostępu i pieniędzy.** Do wykonania po wdrożeniu: założyć subkonto z jednym uprawnieniem `TICKETS_READ` i sprawdzić na produkcji, że `POST /addons/purchase` i `POST /me/account-deletion` zwracają 403, a `GET /tickets` działa. Zapisać datę i godzinę.
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** `DZIAŁA`

Blokery startu: **9 → 8**.

## Czego to nadal nie robi

**Nie sprawdza, czyj jest zasób.** Strażnik odpowiada na pytanie „czy subkonto może wykonać ten rodzaj operacji", nie „czy ten konkretny rekord należy do właściciela sesji". Tym zajmują się serwisy, każdy po swojemu. Systematyczny przegląd izolacji rekordów między kontami to osobna, większa praca — **nowa pozycja `Z-10`**.

**Nie loguje odmów.** Odmowa dla subkonta jest sygnałem operacyjnym — albo ktoś próbuje czegoś, do czego nie ma prawa, albo klasyfikacja trasy jest za ostra. Jedno i drugie warto widzieć. Dopisanie wpisu do dziennika audytu przy `'ODMOWA'` — do zrobienia razem z `Z-10`.

**Reguły dopasowują po fragmencie ścieżki, nie po kontrolerze.** To działa, ale jest kruche: trasa `/services/:id/hosting-dns-cos-nowego` trafi do `DNS_MANAGE` na podstawie samego fragmentu. Docelowo lepszy byłby jawny dekorator `@CustomerPermissions()` na każdej trasie, a wnioskowanie tylko jako siatka bezpieczeństwa. Dekorator już istnieje i ma pierwszeństwo — brakuje przejścia po kontrolerach i uzupełnienia. Robota mechaniczna, nieduża, ale nie na ten sprint.

## Ryzyko i wycofanie

**Główne ryzyko: fałszywe odmowy dla subkont.** Trasa, którą przeoczyłem w klasyfikacji, przestaje działać. Skala jest ograniczona — dotyczy wyłącznie sesji subkont, właścicieli nie rusza — a komunikat jest jednoznaczny („dostępne wyłącznie dla właściciela konta"), więc zgłoszenie będzie rozpoznawalne. Test przemiatający wypisuje pełną listę zamkniętych tras, więc weryfikacja podejrzenia zajmuje minutę.

To ryzyko jest **świadomie zaakceptowane**: fałszywa odmowa jest niewygodna, fałszywe przepuszczenie kosztowało do dziś możliwość usunięcia konta właściciela przez jego pracownika.

Wycofanie: zmiana `return 'ODMOWA'` na `return []` przywraca stare zachowanie. Bez migracji, bez zmian stanu.

## Wpływ na inne pozycje

- Zamyka `Z-04`, zdejmuje bloker startu (9 → 8).
- Częściowo odpowiada na `X-10` („testy RBAC sprawdzające zachowanie, nie metadane") — dla subkont już tak. Dla ról staffa nadal nie; `X-10` zostaje otwarte.
- Otwiera `Z-10` — izolacja rekordów między kontami oraz dziennik odmów.
