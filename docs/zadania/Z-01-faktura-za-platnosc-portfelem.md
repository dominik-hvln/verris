# `Z-01` — Klient płacił portfelem i nie dostawał żadnego dokumentu

| | |
|---|---|
| **Sprint** | 5 — Faktura dla każdej płatności, część 1 |
| **Priorytet** | BLOKER STARTU |
| **Nakład** | L (~40 h) |
| **Zależy od** | — |
| **Status** | zamknięte w kodzie, D2 po zielonym CI |
| **Data** | 2026-08-22 |

---

## Problem

Macierz:

> Klient płaci realnie i nie dostaje ŻADNEGO dokumentu księgowego. Brak obejścia w systemie —
> operator nie wystawi faktury ręcznie. Poważniejsze niż brak korekt: te dotyczą dokumentów,
> których w ogóle się nie wystawia.

Dokument powstawał **wyłącznie** ze zdarzeń `invoice.*` ze Stripe'a. Obciążenie portfela —
odnowienie abonamentu, domena, VPS, monitoring, autoskalowanie — nie tworzyło niczego.

### Trzynaście miejsc, nie cztery

Macierz wymieniała cztery wywołania `debit()`. Jest ich **trzynaście**:

```
domains/domain-registrar.service.ts      addons/addon.service.ts
autoscaling/autoscaling-billing.service  vps/vps-renewal.scheduler.ts
vps/vps.service.ts                       subscriptions/site-monitor.service.ts  (×2)
subscriptions/trial.service.ts           subscriptions/subscriptions.service.ts (×3)
subscriptions/renewal.scheduler.ts
```

To nie jest zarzut wobec macierzy. To dowód, że **lista miejsc, w których rusza się pieniądz,
rozjeżdża się z rzeczywistością szybciej, niż ktokolwiek ją aktualizuje** — a przy tej pozycji
rozjechała się o 225% w ciągu dwóch dni od napisania.

Dopisanie wystawiania faktury w każdym z tych miejsc byłoby **czwartym** wystąpieniem wzorca,
który w tym projekcie wyprodukował już trzy błędy (`Z-12`, `Z-16`, `plan-change.service`):
dwie kopie tej samej reguły, jedna poprawiona, druga zapomniana.

## Rozwiązanie

Reguła jest **w jednym miejscu** — w `WalletLedgerService.applyEntry`, czyli tam, gdzie i tak
jako jedyne miejsce w systemie zmienia się saldo. Nowe obciążenie dostaje fakturę przez sam
fakt bycia obciążeniem; nikt nie musi o niej pamiętać, bo nie ma gdzie zapomnieć.

```ts
if (direction === 'debit') {
  const tryb = trybFaktury(input.type, amount);
  if (tryb === 'natychmiast') {
    await utworzFaktureZaObciazenie(tx, { … });   // ← TA SAMA transakcja
  }
}
```

### Co powstaje i kiedy

| Rodzaj obciążenia | Dokument |
|---|---|
| abonament, zmiana planu, domena, VPS, monitoring — od 5 zł | faktura od razu, przy obciążeniu |
| autoskalowanie (zawsze) i drobne zużycie poniżej 5 zł | jedna faktura zbiorcza 1. dnia następnego miesiąca |
| doładowanie portfela, korekta admina, zwrot | brak — patrz niżej |

Rozdział jest arytmetyczny, nie estetyczny. Autoskalowanie obciąża portfel co blok
kilkunastominutowy; faktura za każde obciążenie to kilkadziesiąt dokumentów miesięcznie na
klienta, każdy z własnym numerem, PDF-em, mailem i wysyłką do KSeF-a.

Autoskalowanie idzie na zbiorczą **zawsze**, także powyżej progu: pojedynczy blok mógłby
przekroczyć 5 zł przy skoku na trzech zasobach naraz, a faktura za blok kilkunastominutowy
byłaby formalnie poprawna i praktycznie bez sensu — obok niej i tak stanęłaby zbiorcza za
resztę tego samego dnia.

### Dlaczego doładowanie nie dostaje faktury

Doładowanie nie jest sprzedażą — to środki na koncie, które klient wyda kiedy zechce i na co
zechce. VAT powstaje przy świadczeniu usługi, czyli przy obciążeniu, i tam idzie dokument.
To standardowy model prepaid.

**Ale to jest decyzja, nie fakt.** Jeżeli środki dałoby się wydać wyłącznie na konkretną,
z góry określoną usługę, urząd może uznać wpłatę za zaliczkę wymagającą faktury zaliczkowej.
Do potwierdzenia z księgową przed startem sprzedaży — osobna pozycja `M-34`.

## Atomowość — i test, który za pierwszym razem nic nie dowodził

Wiersz faktury powstaje **w tej samej transakcji** co ruch pieniądza. Wszystko, co wymaga
świata zewnętrznego — PDF, MinIO, KSeF, mail — robi później scheduler, z ponawianiem. To jest
wprost lekcja z `Z-05`: dokument, którego powstanie zależy od kroku po transakcji, będzie
czasem nie powstawał i nikt się o tym nie dowie.

Pierwsza wersja testu atomowości sprawdzała odrzucone obciążenie (za małe saldo) i **przechodziła
również wtedy, gdy faktura powstawała poza transakcją** — bo skoro obciążenie rzuciło, do
wystawiania faktury i tak nie dochodziło.

Sprawdzone realnie: przeniosłem wystawianie za transakcję i zestaw pozostał zielony.

> **Test, który przechodzi na obu wersjach kodu, nie mówi nic o żadnej z nich.**

Właściwy test wywala **samo wystawianie faktury**: podkłada dokument z numerem, który numerator
wyda jako następny, więc `create` odbija się o unikalność `number`. Wtedy widać różnicę:

```
faktura w transakcji:   saldo 100,00 → 100,00  (wszystko cofnięte)
faktura poza transakcją: saldo 100,00 →  55,00  (pieniądze zniknęły, dokumentu brak)
```

Drugi wiersz to dokładnie Z-01 z powrotem.

## Numeracja — jedno źródło, nie dwa

`allocateInvoiceNumber` żyło jako metoda prywatna `InvoicesService`. Ponieważ numeru potrzebuje
teraz również księga portfela (w swojej transakcji), logika przeniosła się do
`faktura-za-portfel.ts`, a `InvoicesService` ją stamtąd woła.

Druga kopia numeratora oznaczałaby dwie serie rozjeżdżające się przy pierwszym równoległym
wystawieniu, a numeracja faktur ma być ciągła i bez luk (art. 106e ust. 1 pkt 2 ustawy o VAT).
Test integracyjny wystawia osiem faktur równolegle i sprawdza, że numery są unikalne i kolejne.

## Finalizacja z ponawianiem — przy okazji naprawiona stara dziura

`finalizeAsVerrisInvoice` (PDF + MinIO + KSeF + mail) była wołana **raz**, z `.catch(log)`.
Błąd generowania kończył się linijką w logu i fakturą bez pliku, o której nikt się nie
dowiadywał. Ta sama klasa błędu co `Z-05`, tylko w dokumentach zamiast w pieniądzach — i
dotyczyła również faktur ze Stripe'a, czyli istniała przed Z-01.

Teraz `Invoice` ma `finalizeAttempts`, `finalizeLastError`, `finalizeNextAttemptAt`,
`finalizeAlertedAt`, a `FakturyScheduler.dokoncz()` podejmuje faktury `PAID` bez `storageKey`
z narastającym odstępem (2 → 10 → 30 → 120 min) i alarmuje po trzech próbach.

Odstępy są rzadsze niż przy webhooku płatności i to jest celowe: tam brakowało **pieniędzy**
na koncie klienta, tu brakuje **dokumentu** przy poprawnie pobranych pieniądzach, a ustawa daje
na wystawienie czas do 15. dnia następnego miesiąca.

**Licznik prób rośnie PRZED wywołaniem, nie po.** Gdyby rósł po błędzie, awaria ubijająca proces
w trakcie generowania zostawiałaby fakturę z tą samą liczbą prób, job wracałby do niej co minutę
bez końca, a alert oparty na liczbie prób nigdy by nie padł.

## Faktura wystawiana ręcznie

Macierz: „brak obejścia w systemie — operator nie wystawi faktury ręcznie". Bez tego każdy
przypadek nietypowy — ugoda, rekompensata, usługa spoza cennika — wypycha operatora poza system,
do Worda i własnej numeracji. Numeracja ma być jedna i ciągła, więc musi istnieć droga wewnątrz.

`POST /admin/billing/invoices/reczna` + formularz w panelu. Ta sama numeracja VFV, ten sam PDF,
ta sama ścieżka do KSeF-a.

Kwoty podaje się **brutto**, tak jak w cenniku i w koszyku — operator przeliczający netto
w pamięci prędzej czy później pomyli się o grosz, a to jest dokument księgowy. Powód wystawienia
jest wymagany i trafia do dziennika audytu, nie na fakturę: faktura ręczna zawsze jest wyjątkiem,
a wyjątek bez uzasadnienia po miesiącu jest nie do odtworzenia.

**Zakres:** dokument opłacony, potwierdzający rozliczoną transakcję. Faktura z terminem
płatności (wezwanie do zapłaty) to inna funkcja i celowo jej nie ma — dodana po cichu, byłaby
fakturą, której nikt nie pilnuje.

## Arytmetyka

VAT jest **resztą** po odjęciu netto od brutto, na poziomie pozycji i sumy. Liczony niezależnie
(`brutto × 23/123`) potrafi dać sumę różniącą się od brutto o grosz — a faktura, która się nie
sumuje, jest wadliwym dokumentem, nie drobnym rozjazdem wyświetlania.

Niezmiennik jest sprawdzany na **28 572 kwotach** (co siódmy grosz od 0,01 do 2000,00), a nie na
trzech ładnych przykładach. Faktura zbiorcza dodatkowo weryfikuje sumowanie w kodzie
produkcyjnym i **rzuca**, gdy się nie zgadza — lepiej, żeby job stanął i ktoś to zobaczył, niż
żeby wysłał wadliwy dokument do KSeF-a.

## Testy

| Warstwa | Plik | Ile |
|---|---|---|
| jednostkowe | `apps/api/src/billing/faktura-za-portfel.spec.ts` | 29 |
| jednostkowe | `apps/api/src/billing/wallet-ledger.service.spec.ts` | +3 |
| integracyjne | `apps/api/test/integration/faktura-portfel.int-spec.ts` | 14 |
| asercja SQL | `ops/sql/po-migracji-niezmienniki.sql` | blok Z-01 (od `X-25`; wcześniej `sprawdz-baze-po-migracji.sql`) |

Wśród jednostkowych strażnik na klasę: **każdy typ `CHARGE_*` musi być objęty regułą
sprzedaży**. Gdyby ktoś dodał nowy typ obciążenia i zapomniał o liście, obciążenie przechodziłoby
bez dokumentu — czyli Z-01 wracałby dla jednego typu, po cichu.

**Czy czerwienią się na starym kodzie?** Tak, na trzech różnych wersjach:

| Wersja | Czerwone |
|---|---|
| księga nie wystawia faktury (stan sprzed Z-01) | 6 z 14 |
| faktura wystawiana **poza** transakcją | 1 z 14 — test atomowości |
| faktura z niespójnym netto+VAT w bazie | asercja SQL |

## Czego to nadal nie robi

- **Nie ma faktur korygujących.** To `M-06`, osobny bloker. Pierwszy zwrot, pierwsza rezygnacja
  w trakcie okresu i pierwsza literówka w NIP-ie nadal wypychają operatora poza system.
- **Nie ma faktury z terminem płatności.** Wszystkie wystawiane dokumenty są opłacone.
- **Nie rozstrzyga zaliczek.** Decyzja o braku faktury zaliczkowej przy doładowaniu jest
  świadoma, ale wymaga potwierdzenia z księgową — `M-34`.
- **Zbiorcza nie ma własnego podglądu przed wystawieniem.** Job wystawia i wysyła; nikt tego nie
  akceptuje. Przy jednoosobowym zespole to świadomy wybór, ale przy pierwszym miesiącu
  z realnym ruchem warto obejrzeć wynik ręcznie.
- **Brak D3.** Dowodem byłoby obciążenie portfela na produkcji i obejrzenie faktury, którą
  dostał klient. Dopisane do `PB-12`.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `M-06` | odsłania — korekty dotyczą teraz dokumentów, które naprawdę powstają |
| `M-34` | **nowa** — potwierdzenie z księgową modelu prepaid (brak faktury zaliczkowej) |
| `Z-05` | dziedziczy wzorzec — trwały zapis w transakcji, dowożenie z ponawianiem |
| `X-04` | rozszerza — czwarty plik testów integracyjnych, 40 testów łącznie |
| `X-14` | rozszerza — asercje po migracji dostają blok Z-01 |
| `PB-12` | dokłada punkt do runbooka: obejrzeć fakturę z produkcji (D3) |

## Dowód po

- `apps/api/src/billing/faktura-za-portfel.ts` — reguła, arytmetyka, zapis
- `apps/api/src/billing/wallet-ledger.service.ts` — jedno miejsce wywołania
- `apps/api/src/billing/faktury.scheduler.ts` — dokańczanie, alerty, zbiorcze
- `apps/api/src/billing/invoices.service.ts` — `wystawReczna`, `dokonczFakture`, numeracja współdzielona
- `apps/admin-panel/.../invoices/reczna/` — formularz
- `libs/database/prisma/migrations/20260822200000_faktura_za_portfel/`
- 32 testy jednostkowe + 14 integracyjnych + asercja SQL

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

D2 — 516 testów jednostkowych, 40 integracyjnych na prawdziwym Postgresie, lint 7/7 (0 błędów),
typecheck 8/8. **D3 wymaga produkcji.** Zgodnie z regułą audytu — *pieniądze wymagają D3* —
Z-01 jest domknięte jako **bloker**, nie jako dowód produkcyjny.

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`
