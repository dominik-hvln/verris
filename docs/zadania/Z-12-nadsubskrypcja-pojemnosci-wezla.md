# `Z-12` — Nadsubskrypcja pojemności węzła zamiast rezerwacji limitów planu

| | |
|---|---|
| **Sprint** | 3 (nowy, dołożony po PB-01) |
| **Priorytet** | BLOKER STARTU |
| **Nakład** | planowany 16 h · rzeczywisty ~6 h |
| **Zależy od** | `PB-01` (analiza), `Z-13` (plan produkcyjny w bazie — do testu na realnych danych) |
| **Status** | zamknięte w kodzie, czeka na D3 |
| **Data zamknięcia** | 2026-08-22 |

---

## Problem

Węzeł ze 128 GB pamięci przyjmował szesnaście kont i ani jednego więcej. Nie dlatego, że
maszyna była pełna — była praktycznie pusta. Dlatego, że kod traktował sumę limitów planów
jak zajętość sprzętu.

Próg rentowności przy cenie 45 zł to 58 kont na węzeł (`PB-01`). Nie istniała więc liczba
sprzedanych pakietów, przy której węzeł wychodzi na zero: sprzedaż zatrzymywała się na
szesnastym koncie ze stratą ok. 1 074 zł miesięcznie, a siedemnasty klient dostawał
komunikat „All compute nodes are at capacity".

## Dowód przed

```
apps/api/src/subscriptions/provisioning.service.ts:299-301
    allocatedCpu:    { increment: subscription.plan.cpuLimit }
    allocatedMemory: { increment: subscription.plan.ramLimitMb }
    allocatedDisk:   { increment: subscription.plan.diskLimitMb }

apps/api/src/subscriptions/node-selector.service.ts:109-115
    const freeRam = totalRam - server.allocatedMemory;
    if (freeRam < plan.ramLimitMb + reservedRam) continue;
```

Do tego `libs/database/prisma/schema.prisma:474` — `reservedHeadroomPercent Int @default(0)`,
czyli polityka headroom opisana w `docs/strategy/FLEET_SCALING.md` nie obowiązywała nigdzie
poza tym dokumentem.

**Stan w macierzy przed:** `BRAK` / `LUKA` / `BLOKER STARTU`

## Rozwiązanie

Błąd był kategorii, nie arytmetyki. W CloudLinux/LVE `MemoryMax` i `SPEED` są **sufitami**,
do których proces może dobić — nie zasobami odłożonymi na bok. Rezerwowanie sufitu to to samo,
co trzymanie stolika w restauracji dla każdego, kto **mógłby** przyjść.

### Dwie księgi, których nie wolno mylić

| Księga | Co trzyma | Z czym się porównuje |
|---|---|---|
| **SPRZEDANE** — `Server.allocated*` | suma limitów planów | pojemność fizyczna **× overcommit** |
| **REALNE ZUŻYCIE** — `UsageMetric` po `serverId` | ile węzeł faktycznie zjada | pojemność fizyczna **× (1 − headroom)** |

Do tej pory istniała tylko pierwsza i była traktowana jak druga.

### Dwie bramki zamiast jednej

Nowy moduł `apps/api/src/subscriptions/node-capacity.ts` przepuszcza konto tylko wtedy, gdy
przejdzie **obie**:

- **Bramka A (handlowa)** — `sprzedane + limit planu ≤ pojemność × overcommit`
- **Bramka B (fizyczna)** — `realne zużycie ≤ pojemność × (1 − headroom)`

Sama bramka A to hazard: sprzedajesz w ciemno. Sama bramka B to stan sprzed poprawki z inną
etykietą. Dopiero obie razem są nadsubskrypcją, a nie życzeniem.

Bramka B sprawdzana jest **przed** A — świadomie, żeby powód odmowy trafiający do logu
i alertu mówił „węzeł jest realnie zajęty", a nie „skończył się limit handlowy". To dwie
zupełnie różne sytuacje operacyjne.

### Zmiana semantyki headroomu

To jest zmiana, o której trzeba pamiętać przy czytaniu starych liczb. Wcześniej headroom
pomniejszał pojemność porównywaną z **księgą handlową** — mieszanie jednostek: rezerwa „pod
burst" zabezpiecza przed zdarzeniem fizycznym, a odejmowano ją od zobowiązań handlowych.
Teraz chroni realne zużycie.

Praktyczny skutek: w scenariuszu S2 arkusz `PB-01` podaje 51 kont, kod wpuszcza 64. Model jest
zachowawczy wobec implementacji, nie z nią sprzeczny — decyzja cenowa oparta na 51 kontach
obowiązuje tym bardziej. Uwaga o tej różnicy jest dopisana w zakładce `Gestosc` arkusza.

### Dysk nie jest RAM-em

`overcommitDisk` ma limit górny 3×, a CPU i RAM 8×. Powód: quota dyskowa jest **realnie
egzekwowana przez system plików**. Klient MOŻE ją wypełnić w całości i wtedy gigabajty są
zajęte na stałe — nie zwolnią się po piku, jak pamięć. Przy bazie 50 GB i węźle 1,92 TB
nadsubskrypcja 3× to 5,7 TB sprzedanego miejsca; gdyby klienci zaczęli realnie wypełniać
quoty, nie da się tego cofnąć inaczej niż migracją kont.

### Degradacja przy braku telemetrii

Nadsubskrypcja bez wglądu w realne zużycie jest zgadywaniem. Gdy węzeł nie przysłał metryki
w ciągu 30 minut, `overcommit` spada do 1,0 — do zachowania sprzed poprawki.

Świadomie **nie** blokujemy wtedy sprzedaży całkowicie. Awaria telemetrii nie powinna
zatrzymywać firmy, a zachowanie zachowawcze jest bezpieczne: węzeł już nadsubskrybowany
przestaje przyjmować nowe konta do powrotu metryk, a istniejące działają bez zmian. Odmowa
z tego powodu leci do logu jako `warn` z nazwą węzła — to sytuacja operacyjna, nie zwykłe
„węzeł pełny".

Osobny przypadek: węzeł z **zerem kont** nie ma telemetrii, ale jego realne zużycie nie jest
nieznane — jest zerowe. Bez tego rozróżnienia świeży węzeł z ustawionym overcommitem
zapełniałby się najpierw do 16 kont i dopiero potem nadsubskrypcja by ruszyła.

### Domyślne 1,0 jest celowe

Migracja **nie zmienia zachowania placementu**. Gdyby default był wyższy, wdrożenie po cichu
przestawiłoby zasady umieszczania kont na całej flocie — a to musi być decyzją operatora, nie
skutkiem ubocznym deployu. Admin podnosi współczynnik świadomie, per węzeł, w panelu.

### Ten sam błąd piętro wyżej

Planer drenażu w `servers.service.ts` (OPS-4, plan ewakuacji węzła) miał **dokładnie tę samą**
arytmetykę. Skutek byłby gorszy niż w sprzedaży: przy awarii węzła plan powiedziałby „nie ma
dokąd przenieść kont" w chwili, gdy miejsce jest. Poprawiony tym samym modułem, ale liczy
overcommit zachowawczo (bez telemetrii) — drenaż to operacja awaryjna i lepiej, żeby wskazał
mniej miejsca, niż żeby przepełnił węzeł docelowy.

To już drugi raz w tym audycie, kiedy poprawka w jednym miejscu miała bliźniaka w drugim
(pierwszy: `Z-11`). Stąd decyzja o wyniesieniu arytmetyki do osobnego modułu — nie dla
elegancji, tylko po to, żeby trzeci raz nie było gdzie się rozjechać.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/subscriptions/node-capacity.ts` | nowy — cała arytmetyka pojemności i walidacja współczynników |
| `apps/api/src/subscriptions/node-selector.service.ts` | przepisany na dwie bramki + pobieranie telemetrii węzła |
| `apps/api/src/servers/servers.service.ts` | `setCapacityPolicy` przyjmuje współczynniki; planer drenażu naprawiony |
| `apps/api/src/servers/servers.admin.controller.ts` | DTO endpointu polityki pojemności |
| `libs/database/prisma/schema.prisma` | `overcommitCpu/Ram/Disk Float @default(1)` na `Server` |
| `libs/contracts/src/server.dto.ts` | pola w kontrakcie publicznym |
| `apps/admin-panel/.../capacity-policy-panel.tsx` | trzy pola + objaśnienie, dlaczego dysk ma niższy limit |
| `apps/admin-panel/.../nodes/[id]/page.tsx` | przekazanie propsów |
| `apps/admin-panel/.../nodes/actions.ts` | typ akcji serwerowej |

Migracja bazy: `20260822090000_node_overcommit` — trzy kolumny, `DEFAULT 1`.
Zmienne środowiskowe: —

## Testy

`node-capacity.spec.ts` — 21 testów arytmetyki:

| Grupa | Co sprawdza |
|---|---|
| zachowanie sprzed poprawki | przy 1,0 na węzeł wchodzi dokładnie 16 kont — tyle, co przed zmianą |
| bramka handlowa | 4×/4×/2× daje 64 konta; próg 58 osiągalny przy 4×, nieosiągalny przy 1× |
| bramka fizyczna | węzeł realnie zajęty odmawia mimo zapasu handlowego; headroom 20% tnie przy 80%, nie przy 100% |
| profil zużycia z PB-01 | 0,5 GB/konto mieści się z zapasem; dwukrotnie większe zużycie zatrzymuje sprzedaż, zanim maszyna padnie |
| degradacja telemetrii | brak metryk → 1,0×; węzeł nadsubskrybowany odmawia, ale nie rzuca błędem |
| dysk | limit górny niższy niż CPU/RAM; wartość ponad limit przycinana; walidacja tłumaczy dlaczego; `NaN` nie przechodzi |
| stare zabezpieczenia | `maxAccounts` i brak raportu pojemności nadal działają |
| sortowanie | obciążenie bierze **gorsze** z handlowego i fizycznego |

`node-selector.service.spec.ts` — 9 testów podłączenia:

| Test | Co sprawdza |
|---|---|
| bez nadsubskrypcji odmawia przy pełnej pojemności | punkt odniesienia |
| z `overcommitRam` 4× ten sam węzeł przyjmuje konto | serwis faktycznie czyta pole z węzła |
| nieświeża telemetria degraduje overcommit | okno świeżości działa end-to-end |
| świeży węzeł bez kont nie jest jak węzeł z zepsutym agentem | rozróżnienie „zero" od „nieznane" |
| realne zużycie blokuje mimo zapasu handlowego | bramka B jest podpięta |
| jedna najnowsza próbka na subskrypcję | sześć próbek w oknie nie liczy się sześć razy |
| woli węzeł realnie luźniejszy | sortowanie po właściwym obciążeniu |
| `maxAccounts` mimo nadsubskrypcji | stare guardraile przeżyły przepisanie |
| pyta o metryki tylko z okna świeżości | zapytanie ma poprawny zakres czasu |

**Czy test najpierw czerwienił się na starym kodzie?** Tak. Sprawdzone przez wymuszenie
`efektywnyOvercommit` na stałe 1,0 — czyli symulację stanu sprzed Z-12. Wynik: **6 z 30 testów
na czerwono**, reszta zielona (bo celowo opisuje zachowanie, które miało zostać nietknięte).
Po przywróceniu: 30/30. Cały pakiet API: **346 testów w 44 zestawach**.

## Dowód po

- `apps/api/src/subscriptions/node-capacity.ts` — `czyZmiesciSie`, `efektywnyOvercommit`, `bladWspolczynnika`
- `apps/api/src/subscriptions/node-selector.service.ts:95-140` — obie bramki w pętli po kandydatach
- `apps/api/src/subscriptions/node-selector.service.ts` — `realneZuzycieWezlow`
- `libs/database/prisma/migrations/20260822090000_node_overcommit/migration.sql`

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — test przechodzi w CI
- [ ] D3 — zaobserwowane na produkcji (data)
- [ ] D4 — powtarzalna procedura z właścicielem i datą

**D3 jest tu wymagane**, bo pozycja dotyczy pieniędzy i pojemności produkcyjnej. Procedura:
po wdrożeniu ustawić na węźle testowym `overcommitRam=4`, `overcommitCpu=4`, `overcommitDisk=2`
i potwierdzić w logu API wpis `Selected server=… overcommit cpu=4× ram=4× disk=2×
telemetria=świeża` przy założeniu konta ponad siedemnastym. Do dopisania w
`docs/ops/CHECKLISTA_D3.md`, część B (wymaga węzła).

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`

## Definicja ukończenia

Placement nadsubskrybuje RAM i CPU zamiast je rezerwować, ma osobną bramkę na realne zużycie,
a admin może ustawić współczynniki per węzeł. Spełnione.

## Czego to nadal nie robi

- **Nie ma alertu, gdy realne zużycie zbliża się do progu.** Bramka B odmawia dopiero po
  przekroczeniu; operator dowiaduje się, że węzeł jest pełny, w momencie nieudanej sprzedaży.
  Wraca do backlogu jako `Z-15`.
- **Nie przelicza wstecz.** Jeśli węzeł ma dziś konta założone przy `1,0×`, nic się nie stanie
  — to jest w porządku, bo `allocated*` liczy się tak samo. Ale gdyby ktoś **obniżył**
  overcommit poniżej obecnego zagęszczenia, kod nie zaprotestuje: po prostu przestanie
  przyjmować nowe konta. Sensowne, ale niekomunikowane.
- **Nie pilnuje sumy po flocie.** Każdy węzeł ocenia się osobno; nikt nie liczy, ile łącznie
  sprzedano ponad pojemność całej floty. Przy jednym węźle to bez znaczenia, przy pięciu już nie.
- **Okno świeżości 30 minut jest stałą w kodzie**, nie ustawieniem. Do zmiany, gdy okaże się,
  że agent raportuje rzadziej.

Lista nie jest pusta, ale nie zmienia stanu na `CZĘŚCIOWE`: brakujące elementy to nowe funkcje
operacyjne, a nie części definicji ukończenia tej pozycji. `Z-15` dopisane do macierzy.

## Ryzyko i wycofanie

**Największe ryzyko:** overcommit ustawiony na podstawie założeń z `PB-01`, które nie są
pomiarem. Jeżeli realne zużycie okaże się dwukrotnie wyższe, bramka B zatrzyma sprzedaż — i to
jest zachowanie pożądane, ale zobaczymy je dopiero na węźle z ruchem. Dlatego `PB-02` ma pomiar
w definicji ukończenia, a współczynniki zostają na `1,0` do czasu tego pomiaru.

**Wycofanie:** ustawić `overcommit*` z powrotem na 1 w panelu — bez wdrożenia, bez migracji,
efekt natychmiastowy. Kolumny mogą zostać. To był główny powód, dla którego domyślna wartość
jest neutralna: wycofanie jest przestawieniem pola, nie rollbackiem.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `PB-01` | spełnia warunek 1 decyzji cenowej — cena 45 zł ma pokrycie w produkcie |
| `Z-13` | nadal otwarte: nadsubskrypcja nie ma czego umieszczać, dopóki plan nie istnieje w bazie |
| `Z-15` | otwiera — alert wyprzedzający zamiast odmowy po fakcie |
| `PB-02` | zmienia zakres — pomiar realnego zużycia decyduje o wartościach współczynników |
| OPS-4 (drenaż) | naprawia przy okazji — plan ewakuacji widzi teraz realną pojemność węzłów docelowych |
