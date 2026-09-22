# `Z-16` — Autoskalowanie pyta węzeł o pojemność i dowozi sufit z oferty

| | |
|---|---|
| **Sprint** | 3 |
| **Priorytet** | BLOKER STARTU |
| **Nakład** | planowany 16 h · rzeczywisty ~7 h |
| **Zależy od** | `Z-12` (moduł pojemności), `Z-13` (plan z krotnościami) |
| **Status** | zamknięte w kodzie, czeka na D3 |
| **Data zamknięcia** | 2026-08-22 |

---

## Problem

Silnik autoskalowania nie wiedział nic o węźle, na którym stoi konto. W całym pliku
`autoscaling-engine.service.ts` nie było ani jednego odwołania do `Server` ani do
`allocated*`. Dwa skutki, jedna przyczyna.

**Pierwszy — oferta nie do dowiezienia.** `resolveMaxOverscaleRatio` przycinał krotność do
10× (`Math.min(value, 10)`) niezależnie od tego, co stało w planie. Verris obiecuje skalowanie
do 24 vCPU i 1000 GB, czyli 12× i 20× wobec bazy. Realnie klient dostawał 20 vCPU i 500 GB —
płacąc godzinowo za nadwyżkę, której nie dostawał.

**Drugi — groźniejszy.** Silnik podnosił limity konta w DirectAdminie, nie pytając węzła, czy
ma te zasoby, i nie zapisując ich w księdze. Po `Z-12` znaczyło to, że **dwie warstwy
nadsubskrybują ten sam węzeł, nie wiedząc o sobie**: placement liczy sprzedane limity bazowe,
autoskalowanie dokłada nadwyżkę poza księgą. Jedno konto mogło urosnąć do 1000 GB na węźle
1,92 TB — połowa dysku dla jednego klienta, o czym selektor się nie dowie.

## Dowód przed

```
apps/api/src/autoscaling/autoscaling-engine.service.ts:287
    return Math.min(value, 10);          // sufit niezależny od planu

grep -n "Server\|allocated" autoscaling-engine.service.ts
    17: import { DirectAdminService } …   // jedyne trafienie w całym pliku
    361: const client = await this.da.getClientForServer(…)
```

**Stan w macierzy przed:** `CZĘŚCIOWE` / `LUKA` / `BLOKER STARTU`

## Rozwiązanie

### Kolejność miała znaczenie

Podniesienie sufitu **przed** dołożeniem sprawdzania pojemności byłoby regresją, a nie
poprawką: konto rosłoby do 20× na maszynie, która o tym nie wie. Dlatego przy `Z-13`
świadomie zostawiłem próg 10× i utrwaliłem rozbieżność testem. Tutaj kolejność jest odwrotna:
najpierw ogranicznik pojemności, potem księgowanie nadwyżki, dopiero na końcu wyższy sufit.

### Przycinanie zamiast odmowy

Brak pojemności węzła **nie jest winą klienta**. Istniejący `guardScaleUp` przy odmowie
wyłącza autoskalowanie i ściąga konto do baseline — słusznie, gdy skończyły się pieniądze
w portfelu albo klient przekroczył własny limit kosztów. Ale karanie klienta za nasze
planowanie pojemności byłoby czymś innym.

`ogranicznikPojemnosciWezla` przycina przyrost do tego, co węzeł faktycznie ma. Konto dostaje
mniej, niż chciało, zamiast nie dostać nic i stracić autoskalowanie. Gdy nadwyżka zostanie
obcięta do zera — `HOLD`, bez zmian i bez opłaty.

Każde obcięcie zostawia wpis `AUTOSCALING_OGRANICZONE_POJEMNOSCIA_WEZLA` w dzienniku audytu
i ostrzeżenie w logu. To jest sygnał do dołożenia węzła, i tak jest opisany w treści wpisu.

### Węzeł bez raportu pojemności przepuszcza żądanie

Świadomy kompromis w drugą stronę niż w `Z-12`. Tam brak telemetrii degraduje nadsubskrypcję,
bo dotyczy sprzedaży nowego konta. Tutaj chodzi o klienta, który **już płaci** za nadwyżkę —
awaria handshake'u węzła nie może mu zabrać mocy, za którą płaci. Brak danych o węźle jest
problemem operacyjnym, nie powodem do obcięcia usługi.

### Nadwyżka wchodzi do księgi

Delty idą przez `increment`, nie przez zapis wartości, w tej samej transakcji co zapis stanu
konta. Bez `increment` równoległy provisioning gubiłby swoje zmiany.

Skutek uboczny, celowy: podczas piku węzeł wygląda na pełniejszy i przestaje przyjmować nowe
konta. Dokładnie o to chodzi — nie dokładamy klientów do maszyny, która właśnie pracuje pod
obciążeniem.

### Trzy przecieki księgi, z których dwóch nie szukałem

Zmiana znaczenia `Server.allocated*` zmusiła do przejrzenia każdego miejsca, które tę księgę
prowadzi. Wyszły trzy rzeczy:

| # | Przeciek | Skutek |
|---|---|---|
| 1 | autoskalowanie nie dopisywało nadwyżki | węzeł wyglądał luźniej, niż był |
| 2 | usunięcie konta nie zwalniało limitów | węzeł wyglądał pełniej, niż był — i z czasem przestawał przyjmować konta, mając miejsce |
| 3 | `maxAccounts` liczył konta `DELETED` | jak wyżej, na drugiej ścieżce |
| 4 | zmiana planu liczyła deltę od baz planów | **powstałby przez tę poprawkę**, gdyby zostawić kod bez zmian |

Czwarty jest wart osobnego zdania. Przed `Z-16` `plan-change.service.ts` liczył
`target.cpuLimit − oldPlan.cpuLimit` i to było **poprawne**, bo nadwyżka nigdy nie trafiała do
księgi. Po zmianie znaczenia księgi ten sam kod zostawiałby nadwyżkę w niej na zawsze. Zmiana
semantyki wspólnego licznika wymaga przejrzenia wszystkich jego pisarzy — nie tylko tego,
który się poprawia.

### Migracja prostuje przeszłość

`20260822150000_uzgodnienie_ksiegi_wezla` przelicza `allocated*` z sumy limitów efektywnych
kont niebędących `DELETED`. To nie jest kosmetyka: przecieki 1–3 działały od dawna, więc
poprawka bez migracji zostawiłaby bazę z liczbami, których nikt już nie umie wytłumaczyć.

`LEFT JOIN`, nie `JOIN` — węzeł, z którego usunięto wszystkie konta, ma `allocated* > 0`
przez przeciek nr 2 i zwykły `JOIN` by go pominął.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/subscriptions/node-capacity.ts` | `wolneDoZadysponowania`, `krotnoscAutoskalowania`, `MAKS_KROTNOSC_AUTOSKALOWANIA` |
| `apps/api/src/autoscaling/autoscaling-engine.service.ts` | ogranicznik pojemności, księgowanie nadwyżki, krotność z planu |
| `apps/api/src/compliance/account-deletion.service.ts` | usunięcie konta zwalnia pojemność (w transakcji) |
| `apps/api/src/subscriptions/node-selector.service.ts` | `maxAccounts` pomija konta `DELETED` |
| `apps/api/src/subscriptions/plan-change.service.ts` | delta od limitów efektywnych, nie od baz planów |
| `apps/api/src/plans/plan-produkcyjny.spec.ts` | blok utrwalający rozbieżność przepisany na potwierdzenie |
| `apps/api/src/subscriptions/node-capacity-z16.spec.ts` | nowy — 13 testów |
| `apps/api/src/test/ksiega-wezla.spec.ts` | nowy — 14 testów strażnika księgi |

Migracja bazy: `20260822150000_uzgodnienie_ksiegi_wezla`
Zmienne środowiskowe: —

## Testy

**27 nowych testów.** Dowód czerwieni na starym kodzie zebrany trzykrotnie:

1. **Ratchet z `Z-13` zadziałał zgodnie z zamysłem.** Test napisany przy `Z-13` utrwalał
   rozbieżność i miał zapalić się w chwili zmiany progu w silniku. Zapalił się:
   `✕ próg w silniku jest nadal tam, gdzie go zastaliśmy — 1 failed, 19 passed`. Blok został
   przepisany świadomie, i tak właśnie miał zniknąć.
2. **Nowy blok wobec starego silnika:** `3 failed, 18 passed` — brak zaszytego sufitu, brak
   pytania o pojemność, brak księgowania.
3. **Strażnik księgi wobec stanu sprzed `Z-16`:** `4 failed, 7 passed`.

Cały pakiet API: **393 testy w 47 zestawach.**

## Dowód po

- `node-capacity.ts` — `wolneDoZadysponowania`, `krotnoscAutoskalowania`
- `autoscaling-engine.service.ts` — `ogranicznikPojemnosciWezla`, `realneZuzycieWezla`
- `libs/database/prisma/migrations/20260822150000_uzgodnienie_ksiegi_wezla/migration.sql`

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**D3 wymagane.** Procedura: na węźle testowym z ustawionym `overcommitRam=4` doprowadzić konto
do skalowania w górę i potwierdzić w bazie, że `Server.allocatedMemory` wzrosło o tę samą
wartość co `Account.scaledRamMb`. Drugi krok: usunąć konto i potwierdzić, że `allocated*`
wróciło. Do dopisania w `docs/ops/CHECKLISTA_D3.md`, część B.

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`

## Czego to nadal nie robi

- **Klient nie wie, że dostał mniej.** Obcięcie zostawia wpis w audycie i ostrzeżenie w logu,
  ale w panelu klienta nie ma o tym śladu. Przy płatnym autoskalowaniu to jest informacja,
  która mu się należy. Wraca jako `Z-17`.
- **Nie ma alertu wyprzedzającego** — `Z-15`, otwarte od `Z-12`.
- **Arytmetyka księgi nie jest sprawdzona testem integracyjnym.** Strażniki są statyczne:
  czytają kod i migracje. Prawdziwe sprawdzenie wymaga bazy, której projekt w testach nie ma
  (`X-04`). To jest realne ograniczenie, nie formalność — statyczny test złapie usunięcie
  linii, nie złapie błędu w znaku delty.
- **Nie ma limitu na pojedyncze konto.** Konto z krotnością 20× może zająć pół węzła, jeśli
  węzeł ma miejsce. Bramka pojemności to dopuszcza i to jest zgodne z ofertą — ale
  operacyjnie warto wiedzieć, że nic tego nie ogranicza poza samą pojemnością.

## Ryzyko i wycofanie

**Ryzyko:** migracja uzgadniająca **przelicza** księgę, a nie dopisuje korektę. Jeśli
`Account.cpuLimit` gdzieś nie odpowiada rzeczywistości w DirectAdminie, migracja utrwali ten
błąd w księdze węzła. Na produkcji bez kont jest to bezpieczne; na środowisku z danymi warto
przed wdrożeniem porównać limity kont z tym, co pokazuje DirectAdmin.

**Wycofanie:** ustawienie `overcommit*` na 1 w panelu ogranicza skutki natychmiast. Powrót do
starego sufitu 10× to zmiana jednej stałej `MAKS_KROTNOSC_AUTOSKALOWANIA`. Migracji się nie
cofa — przeliczona księga jest bliżej prawdy niż stan sprzed niej.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `Z-12` | domyka — pojemność węzła liczona w jednym miejscu, nie w trzech |
| `Z-13` | domyka — sufity z oferty są wreszcie dowożone |
| `Z-15` | nadal otwarte — alert wyprzedzający |
| `Z-17` | otwiera — klient nie wie, że dostał mniej, niż zamówił |
| `X-04` | wzmacnia argument — strażniki statyczne to proteza testu integracyjnego |
| `PB-02` | zasila — procedura D3 wymaga węzła z ruchem |
