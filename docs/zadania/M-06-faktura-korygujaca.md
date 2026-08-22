# `M-06` — Faktura korygująca

| | |
|---|---|
| **Sprint** | 6 — Faktura dla każdej płatności, domknięcie |
| **Priorytet** | BLOKER STARTU |
| **Nakład** | L (~40 h) |
| **Zależy od** | `Z-01` |
| **Status** | zamknięte w kodzie, D2 po zielonym CI |
| **Data** | 2026-08-22 |

---

## Problem

Macierz:

> zero wystąpień korekty w `apps/api` i `schema.prisma`; `fa3-xml.builder.ts:177` zawsze
> `<RodzajFaktury>VAT</RodzajFaktury>`
>
> pierwszy zwrot, pierwsza rezygnacja w trakcie okresu, pierwsza literówka w NIP — i operator
> wychodzi poza system

Trzy zdania, trzy różne braki. Dokładnie tak było.

## Rozwiązanie

### Dwa rodzaje, bo mechanika jest inna

| Rodzaj | Co robi | Skutek dla pieniędzy |
|---|---|---|
| **WARTOŚCIOWA** | zmienia kwoty (zwrot, rezygnacja, rabat po fakturze) | różnica ujemna → zwrot do portfela |
| **FORMALNA** | poprawia dane nabywcy (literówka w NIP, adres) | żaden, różnica zero |

### Co siedzi w `amount` korekty

**RÓŻNICA ze znakiem — nie nowa kwota.** To ona wchodzi do rejestru VAT i to ona mówi, ile
pieniędzy się rusza. Kwoty przed korektą stoją obok, w polach `corrected*`, a pozycje po
korekcie w `lineItems`.

Alternatywa — trzymanie w `amount` nowej kwoty — wyglądałaby naturalniej na ekranie i psuła
wszystko poniżej: sumowanie rejestru, asercję `netto + VAT = brutto` i oczywistość tego, czy
dokument oddaje pieniądze, czy dobiera.

Kwota po korekcie odtwarza się z dwóch pól: `correctedAmount + amount`. Jest na to test.

### Zwrot idzie w tej samej transakcji

Korekta zmniejszająca zwraca różnicę do portfela klienta **atomowo z dokumentem**. Klient
widzi jedno zdarzenie („oddaliście mi pieniądze"), więc system zapisuje je jako jedno.

Gdyby zwrot szedł osobno, operator wystawiałby korektę i musiał pamiętać o drugim kroku — a to
jest dokładnie ten kształt, który w tym projekcie wyprodukował już cztery błędy.

Wymagało to wydzielenia z `WalletLedgerService.applyEntry` metody `zapiszWpis(tx, …)`,
działającej **wewnątrz podanej transakcji**. Nie da się otworzyć transakcji w transakcji, a druga
kopia blokowania wiersza i przeliczania salda byłaby piątym wystąpieniem tego samego wzorca.
Miejsce zmieniające saldo nadal jest jedno — obie ścieżki idą przez tę metodę.

**Korekta w GÓRĘ nie rusza portfela.** Dopłata jest zobowiązaniem klienta, nie automatycznym
pobraniem; ściąganie pieniędzy przy korekcie zwiększającej byłoby obciążeniem bez zamówienia.

### Osobna seria numeracji

Faktury: `VFV/RRRR/MM/nnnn`. Korekty: `VFK/RRRR/MM/nnnn`, własny licznik.

`InvoiceCounter` dostał kolumnę `series` i nowy klucz unikalny `(series, year, month)`. Ustawa
nie wymaga osobnej serii, ale numer, który nie mówi, jakim dokumentem jest, każe otwierać PDF,
żeby to sprawdzić — w zestawieniu, w mailu i w rozmowie z księgową.

Test integracyjny sprawdza, że wystawienie korekty **nie rusza licznika faktur**.

### `RodzajFaktury` przestaje być stałą

To była najgroźniejsza z trzech rzeczy. Builder wpisywał `VAT` na sztywno, bo korekt nie było —
ale gdyby korekta trafiła do KSeF-a z `RodzajFaktury=VAT`, **zostałaby przyjęta jako NOWA
sprzedaż**, a nie jako zmiana poprzedniej. Czyli podwoiłaby przychód w rejestrze. Milcząco, bo
dokument jest formalnie poprawny.

Teraz korekta idzie jako `KOR`, z `PrzyczynaKorekty`, `TypKorekty` i blokiem
`DaneFaKorygowanej` (numer i data faktury pierwotnej). Builder **odmawia** zbudowania korekty
bez numeru pierwotnej albo bez przyczyny.

### Reguły w bazie, nie tylko w kodzie

Dwa ograniczenia `CHECK`, bo kod można obejść nowym serwisem, a ograniczeń nie:

- korekta musi mieć `correctedId`, `correctionKind` i `correctionReason`; zwykła faktura nie
  może ich mieć,
- `correctedId <> id` — bez tego jeden błąd w serwisie tworzyłby dokument odsyłający do siebie,
  a wyliczenie „kwota po korekcie" weszłoby w nieskończoną pętlę.

Testy integracyjne wywołują oba i sprawdzają, że baza odmawia.

### Czego świadomie nie ma

**Nie koryguje się korekty.** Prawo dopuszcza, ale wtedy dokument odnosi się do dokumentu,
który sam już coś zmienia, i wyliczenie „ile ostatecznie wyszło" przestaje być odczytem dwóch
pól. Do czasu, gdy pojawi się realny przypadek, odmowa jest uczciwsza niż dokument, którego nie
umiem policzyć. Kolejna korekta odnosi się do faktury pierwotnej.

**Nie ma anulowania faktury.** W polskim prawie faktury wprowadzonej do obrotu się nie
anuluje — koryguje się ją do zera, a to ten mechanizm już potrafi (pozycja z kwotą 0,00).

## Znaleziony przy okazji błąd — i strażnik na jego klasę

Formularz faktury ręcznej z `Z-01` wołał `/admin/billing/invoices/reczna`, a kontroler wystawia
`/admin/invoices/reczna`. **Kod się kompilował, testy przechodziły, panel się budował** — i
formularz zwracałby 404 dopiero pod palcem operatora.

To ta sama rodzina co „bliźniacze miejsca", rozciągnięta na dwa pakiety: ścieżka jest zapisana
dwa razy, w panelu i w kontrolerze, a nic ich nie łączy. Kompilator nie pomoże, bo po obu
stronach to zwykły napis.

`apps/api/src/test/sciezki-panelu.spec.ts` wyciąga wszystkie wywołania `adminApi(...)` z panelu
i wszystkie trasy z kontrolerów, po czym sprawdza pokrycie — kształt ścieżki i metodę.

### Strażnik zaczął od jedenastu fałszywych alarmów

Pierwsza wersja czytała 220 znaków po wywołaniu, żeby znaleźć `method:` — i łapała `method:
"POST"` z **następnego** wywołania. Zwykły `adminApi("/…/activity")` raportowany był jako POST
do trasy, która jest GET-em.

Druga zamieniała wstawkę `${qs}` na `*` w miejscu, produkując segment `webhooki*`, który nie
pasował do niczego.

Trzecia grupowała warianty ścieżki po wartości pochodnej zamiast po oryginale, więc wariant
„pełny" zawsze zostawał sam i zawsze wyglądał na niepokryty.

Jedenaście fałszywych alarmów przy dwóch prawdziwych znaleziskach — z których jedno okazało się
błędem, a drugie moim własnym błędem ekstrakcji. **Strażnik, który tonie we własnym szumie,
zostanie wyciszony**, więc poprawianie go do zera fałszywych alarmów nie było dopieszczaniem,
tylko warunkiem, żeby w ogóle działał.

Piąte wystąpienie tej rodziny w tym projekcie: „jest" (`X-17`), `archiver.create` (`X-21`),
`--audit-level` (`X-23`), `endsWith('billing.service.ts')` (`Z-05`), teraz to.

## Testy

| Warstwa | Plik | Ile |
|---|---|---|
| jednostkowe | `apps/api/src/billing/korekta-faktury.spec.ts` | 18 |
| jednostkowe | `apps/api/src/ksef/fa3-xml.builder.spec.ts` | +7 |
| jednostkowe | `apps/api/src/test/sciezki-panelu.spec.ts` | 5 |
| integracyjne | `apps/api/test/integration/korekta.int-spec.ts` | 13 |
| asercja SQL | `ops/sql/sprawdz-baze-po-migracji.sql` | blok M-06 |

**Czy czerwienią się na starym kodzie?**

| Wersja | Czerwone |
|---|---|
| `RodzajFaktury` na sztywno `VAT` | 4 z 20 w builderze KSeF-a |
| ścieżka panelu `/admin/billing/invoices/reczna` | 1 z 5 w strażniku ścieżek |
| korekta bez faktury pierwotnej w bazie | ograniczenie `CHECK` + asercja SQL |

## Czego to nadal nie robi

- **Nie koryguje korekty.** Świadomie, patrz wyżej.
- **Nie ma faktury zaliczkowej ani jej korekty.** Zależy od `M-34`.
- **Nie obsługuje zmiany stawki VAT na korekcie.** Wszystkie pozycje idą z 23%; korekta ze
  zmianą stawki (np. na zwolnioną) wymagałaby stawki per pozycja w formularzu.
- **Nie wysyła klientowi osobnego powiadomienia o zwrocie.** Korekta idzie mailem jak każdy
  dokument, ale wiadomość „wróciło Ci X zł do portfela" to inny tekst niż „masz nową fakturę".
- **Brak D3.** Dowodem byłoby wystawienie korekty na produkcji i obejrzenie PDF-u oraz statusu
  w KSeF-ie. Dopisane do `PB-12`.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `Z-01` | domyka — korekty dotyczą dokumentów, które teraz naprawdę powstają |
| `M-16`/`M-17` | rozszerza zakres KSeF-a o dokument typu `KOR` |
| `X-04` | rozszerza — piąty plik testów integracyjnych, 53 testy łącznie |
| `X-14` | rozszerza — asercje po migracji dostają blok M-06 |
| `PB-12` | dokłada punkt do runbooka: korekta na produkcji (D3) |

## Dowód po

- `libs/database/prisma/migrations/20260822220000_faktura_korygujaca/`
- `apps/api/src/billing/korekta-faktury.ts` — arytmetyka i dopuszczalność
- `apps/api/src/billing/korekty.service.ts` — wystawianie ze zwrotem w transakcji
- `apps/api/src/billing/wallet-ledger.service.ts` — `zapiszWpis(tx, …)`
- `apps/api/src/ksef/fa3-xml.builder.ts` — `RodzajFaktury` zależny od dokumentu
- `apps/api/src/billing/invoice-pdf.service.ts` — układ korekty
- `apps/admin-panel/.../invoices/[invoiceId]/korekta/` — formularz
- 30 testów jednostkowych + 13 integracyjnych + asercja SQL

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

D2 — 546 testów jednostkowych, 53 integracyjne na prawdziwym Postgresie, lint 7/7 (0 błędów),
typecheck 8/8. **D3 wymaga produkcji.**

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`
