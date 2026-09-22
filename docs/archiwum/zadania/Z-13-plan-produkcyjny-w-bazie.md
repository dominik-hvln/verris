# `Z-13` — Pakiet sprzedawany na stronie istnieje jako plan w bazie

| | |
|---|---|
| **Sprint** | 3 |
| **Priorytet** | BLOKER STARTU |
| **Nakład** | planowany 6 h · rzeczywisty ~4 h |
| **Zależy od** | `PB-01` (decyzja cenowa) |
| **Status** | zamknięte |
| **Data zamknięcia** | 2026-08-22 |

---

## Problem

Strona sprzedawała pakiet za 45 zł z bazą 50 GB NVMe / 8 GB RAM / 2 vCPU. W bazie danych nie
było planu o takich limitach ani o takiej cenie. Były trzy plany z czasów prototypu —
`starter` / `pro` / `business` po 19,99 / 49,99 / 99,99 zł — i to **one** były jedynymi
publicznymi, czyli tym, co klient zobaczyłby w katalogu.

Sprawa nie kończyła się na cenniku. Z rekordu `Plan` czyta:

- wycena zamówienia i odnowienia — `subscriptions.service.ts:109`, `:280`
- placement konta na węźle — `node-selector.service.ts` bierze limity bazowe planu
- synchronizacja pakietów DirectAdmina — `ops/scripts/prod-sync-server-da-packages.sh:101`
- sufity autoskalowania — `autoscaling-engine.service.ts:151`

Czyli: nie dało się kupić tego, co reklamuje strona, a to, co dało się kupić, miało inne
limity, inną cenę i inny pakiet na węźle.

## Dowód przed

```
libs/database/prisma/seed.ts:40-112
    slug: 'starter'  · priceMonthly: 19.99 · ramLimitMb: 1024  · diskLimitMb: 10240
    slug: 'pro'      · priceMonthly: 49.99 · ramLimitMb: 2048  · diskLimitMb: 25600
    slug: 'business' · priceMonthly: 99.99 · ramLimitMb: 4096  · diskLimitMb: 51200

apps/www/.../components/Pricing.tsx:120   45 zł / 399 zł
apps/www/.../hosting/page.tsx:77          50 GB NVMe, 8 GB RAM, 2 vCPU
```

Żadnej migracji tworzącej plan produkcyjny w całym repozytorium.

**Stan w macierzy przed:** `BRAK` / `LUKA` / `BLOKER STARTU`

## Rozwiązanie

### Plan powstaje w migracji, nie w seedzie

Migracja `20260822120000_plan_produkcyjny` wykonuje `INSERT ... ON CONFLICT ("id") DO UPDATE`.
Dwa powody, oba praktyczne:

1. **Migracje biegną na każdym środowisku**, seed nie. Plan produkcyjny musi istnieć po
   `prisma migrate deploy`, bez pamiętania o dodatkowym kroku.
2. **`DO UPDATE`, nie `DO NOTHING`** — dzięki temu zmiana ceny albo limitu jest zmianą
   w migracji, a nie ręcznym `UPDATE` na produkcji o drugiej w nocy.

Plan ma **stałe UUID** (`7f3a1c62-…`), więc jest tym samym rekordem na dev, staging i produkcji.

### Ceny są brutto — sprawdzone, nie założone

`invoices.service.ts:293` rozbija kwotę obciążenia na netto i VAT, traktując ją jako brutto
(`const factor = new Prisma.Decimal(100).plus(vatRate)`). `Plan.priceMonthly` trafia do tej
kwoty wprost (`subscriptions.service.ts:109`). Wpisanie tu netto zawyżyłoby **każdą fakturę**
o 23% — dlatego w planie stoi `45.00`, dokładnie tyle, ile widzi klient.

### Plany prototypowe: `isPublic=false`, nie `isActive=false`

Wycofanie ze sprzedaży ma zdjąć plan z katalogu, a nie zabić subskrypcje. Nieaktywny plan
wywróciłby odnowienie subskrypcji, gdyby ktoś ją na nim założył. `isPublic=false` usuwa plan
z `plans.listPublic()`, a istniejące subskrypcje działają dalej. Osobny test pilnuje, żeby
nikt nie „poprawił" tego na `isActive=false`.

### Wartości, których nie da się wyprowadzić z oferty

`ioLimitKbps`, `iopsLimit`, `entryProcesses`, `nprocLimit` nie są nigdzie reklamowane. Wzięte
z górnej półki dawnego `business` — jedynego seedowego planu o zbliżonej klasie — i oznaczone
w kodzie jako do rewizji po `PB-02`. To jest szacunek i tak jest opisany, a nie liczba udająca
decyzję.

`supportSlaHours` zostaje na **0**. SLA 99,5% na stronie dotyczy **dostępności**, nie czasu
odpowiedzi wsparcia. Wpisanie tu jakiejkolwiek liczby byłoby wymyśleniem zobowiązania, którego
nikt nie podjął — ustala je `PB-03`.

### Uzgodnienie trzech warstw

`plan-produkcyjny.spec.ts` porównuje ze sobą:

1. **treść strony** (`apps/www/src`) — co obiecujemy,
2. **`PLAN_PRODUKCYJNY`** — czym to jest w kodzie,
3. **migrację SQL** — co naprawdę wyląduje w bazie.

Rozjazd którejkolwiek pary zapala test. To ta sama technika, co uzgodnienie DTO z guardem
bashowym w `Z-03`: dwie warstwy, jedna prawda, test na zgodę między nimi.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/plans/plan-produkcyjny.ts` | nowy — definicja planu jako źródło prawdy |
| `libs/database/prisma/migrations/20260822120000_plan_produkcyjny/migration.sql` | nowa — tworzy plan, wycofuje prototypy |
| `apps/api/src/plans/plan-produkcyjny.spec.ts` | nowy — 20 testów uzgadniających |
| `libs/database/prisma/seed.ts` | plany prototypowe dostają `isPublic: false` + wyjaśnienie |

Migracja bazy: `20260822120000_plan_produkcyjny`
Zmienne środowiskowe: —

## Testy

| Grupa | Co sprawdza |
|---|---|
| definicja vs oferta | baza CPU/RAM/dysku odpowiada reklamowanym jednostkom; krotności wynikają z sufitów; transfer bez limitu |
| cena | 45/399 brutto; oszczędność roczna wychodzi dokładnie −141 zł, tak jak głosi strona; te same liczby są w `Pricing.tsx` |
| migracja vs definicja | id, slug, cena, wszystkie limity bazowe, krotności — porównane z parsowanego SQL-a |
| jakość migracji | `NULL` a nie `0` dla transferu; `ON CONFLICT DO UPDATE` a nie `DO NOTHING`; wycofanie prototypów; **brak** `isActive = false` |
| `Z-16` | próg silnika jest tam, gdzie go zastaliśmy; RAM się mieści, CPU i dysk nie; realny sufit to 20 vCPU i 500 GB wobec obiecanych 24 i 1000 |

**Czy test najpierw czerwienił się na starym kodzie?** Tak, i to dwojako. Przed zmianą nie
istniał ani plan, ani migracja, więc test nie miał czego sprawdzać. Mocniejszy dowód: podmiana
`45.00` na `49.00` w samej migracji zapala test uzgadniający cenę (`1 failed, 19 passed`).
Po przywróceniu: 20/20.

## Dowód po

- `apps/api/src/plans/plan-produkcyjny.ts` — `PLAN_PRODUKCYJNY`
- `libs/database/prisma/migrations/20260822120000_plan_produkcyjny/migration.sql`
- `apps/api/src/plans/plan-produkcyjny.spec.ts` — 20 testów

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — test przechodzi w CI
- [ ] D3 — zaobserwowane na produkcji (data)
- [ ] D4 — powtarzalna procedura z właścicielem i datą

**D3 wymagane** — pozycja dotyczy pieniędzy. Procedura: po wdrożeniu `GET /plans` na produkcji
zwraca dokładnie jeden plan publiczny o slugu `verris-hosting`, cenie 45,00 i limitach
200 / 8192 / 51200. Do dopisania w `docs/ops/CHECKLISTA_D3.md`, część A — nie wymaga węzła.

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`

## Czego to nadal nie robi

- **Nie tworzy produktu w Stripe.** `stripeProductId` i `stripePrice*Id` zostają puste;
  `plans.service.ts` ma auto-sync przy tworzeniu planu przez panel, ale migracja go nie wywoła.
  Przy płatności kartą trzeba będzie plan zsynchronizować z panelu albo dopisać krok do
  runbooka startu. Wraca do backlogu przy `PB-05`.
- **Nie synchronizuje pakietu na węźle.** `prod-sync-server-da-packages.sh` trzeba uruchomić
  ręcznie po wdrożeniu, żeby DirectAdmin dostał pakiet o tych limitach. Krok do `PB-02`.
- **`ioLimitKbps` i pokrewne to szacunek**, nie decyzja oparta na pomiarze.
- **Nie usuwa planów prototypowych** — zostają w bazie jako nieaktywne handlowo.

## Ryzyko i wycofanie

**Ryzyko:** plan wchodzi na produkcję z ceną, która jest zobowiązaniem wobec klienta. Jeśli
`PB-02` wywróci założenia `PB-01`, zmiana ceny dla już sprzedanych subskrypcji nie jest
operacją techniczną, tylko prawną.

**Wycofanie:** `UPDATE "Plan" SET "isPublic" = false WHERE slug = 'verris-hosting'` zdejmuje
pakiet ze sprzedaży natychmiast, bez wdrożenia. Rekord zostaje, subskrypcje działają.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `PB-01` | spełnia warunek 2 decyzji cenowej — pakiet da się kupić |
| `Z-12` | odblokowuje test nadsubskrypcji na realnych danych — jest wreszcie plan do umieszczania |
| `Z-16` | otwiera — sufit autoskalowania z oferty jest nieosiągalny, a silnik nie pyta węzła o pojemność |
| `PB-05` | zasila — ścieżka „pierwszy klient" ma wreszcie co kupić; dochodzi krok synchronizacji Stripe |
| `PB-07` | zasila — cennik na stronie ma pokrycie w rekordzie bazy |
