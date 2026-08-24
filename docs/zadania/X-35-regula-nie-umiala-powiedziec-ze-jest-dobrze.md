# `X-35` — Reguła nie umiała powiedzieć „jest dobrze". Umiała tylko milczeć.

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI (alarm krytyczny palący się na zdrowym systemie) |
| **Nakład** | M (~4 h) |
| **Zależy od** | `X-28` (to jego plik reguł), `X-31` (dead man's switch) |
| **Status** | **CZEKA NA WDROŻENIE — D2 uzyskane na produkcji** |
| **Data** | 2026-08-24 |

---

## Co się stało

`VerrisPostgresBackupStale` — jedyna reguła w tym pliku z etykietą
`severity: critical`, która dotyczy kopii bazy — paliła się nieprzerwanie przy
w pełni zdrowym backupie. Kopia miała 10 h 27 min przy progu 25 h.

Zapytanie wprost do Prometheusa, produkcja, 2026-08-24:

```
query=verris_backup_present == 0 or verris_backup_latest_age_seconds > 90000
→ {"status":"success","data":{"resultType":"vector","result":[]}}
```

Pusty wynik. Nie „zero" — **brak próbki**.

## Przyczyna — `==` i `>` w PromQL nie zwracają prawdy ani fałszu

To są **filtry**. Zdrowy stan (`present=1`, wiek 37 620 s) nie przechodzi przez
żaden z nich, więc wektor wynikowy jest pusty. Grafana pustkę nazywa **NoData**,
a ta reguła miała `noDataState: Alerting`.

Zdrowie było więc odczytywane jako awaria. Przy każdej ewaluacji. Bez końca.

## Skąd się tam wzięło `noDataState: Alerting`

To była **jedyna** reguła w pliku z tym ustawieniem — pozostałych trzynaście
miało `OK`. I akurat ta, która wcześniej sparzyła: w `H-23` kopia bazy nie
wykonała się ani razu przez miesiąc, w zupełnej ciszy.

Ustawienie było **nadkorektą po tamtym**: „niech pustka nigdy więcej nie znaczy
spokoju". Intencja słuszna. Dźwignia niewłaściwa.

## Dlaczego to niewłaściwa dźwignia — i to jest sedno

`noDataState` nie umie odróżnić dwóch **przeciwnych** powodów pustki:

```
pustka, bo WSZYSTKO DZIAŁA       filtr nikogo nie przepuścił
pustka, bo METRYKI NIE MA        eksporter padł, MinIO nie odpowiada
```

Obie docierają do Grafany jako to samo NoData. Każda wartość tego pola jest
więc błędna w jednym z dwóch przypadków:

| wartość | zdrowy system | martwy eksporter | ile reguł |
|---|---|---|---|
| `OK` | czyta dobrze | **MILCZY** | 13 |
| `Alerting` | **ALARMUJE** | czyta dobrze | 1 |

Ten plik miał obie wady naraz, każdą po innej stronie. Przestawienie jednej
dźwigni zamieniłoby jedną na drugą — co dokładnie zrobił autor nadkorekty.

## Rozwiązanie — przestać używać dźwigni, a nie przestawiać ją

Wyrażenie jest teraz **całkowite**: zwraca dokładnie jedną próbkę ZAWSZE.

```
(max(verris_backup_present == bool 0) or vector(0))
+ (max(verris_backup_latest_age_seconds > bool 90000) or vector(0))
```

`== bool` daje 0/1 zamiast filtrować, `max(…)` ściąga wynik do jednej
bezetykietowej próbki, `or vector(0)` domyka przypadek braku metryki.

| stan | wartość |
|---|---|
| zdrowo | 0 + 0 = **0** |
| kopia starsza niż 25 h | 0 + 1 = **1** |
| brak obiektu w MinIO | 1 + 0 = **1** |
| metryki nie ma wcale | 0 + 0 = **0** ← celowo, patrz niżej |

Zdrowie to teraz **jawne zero**, a nie brak odpowiedzi. `noDataState` wraca do
`OK` i przestaje być nośnikiem znaczenia: przy całkowitym wyrażeniu NoData jest
nieosiągalne inaczej niż przez milczenie samego Prometheusa, a to łapie
`execErrState` i `verris-kanal-alertow-zyje` z `X-31`.

## Druga pustka — trzy reguły, nie trzynaście

Ostatni wiersz tabeli jest celowy. „Nie widzę backupu" to **inna awaria** niż
„backup jest stary" i wymaga innej reakcji człowieka, więc dostaje własną
regułę. Wpychanie obu w jedną wartość dałoby alarm, który nie mówi, co robić.

Ale po jednej regule ślepoty na każdą regułę warunkową byłoby trzynaście maili
o jednej awarii — czyli `X-28` od nowa. **Granicą nie jest reguła, tylko
miejsce, w którym emisja może zniknąć niezależnie od reszty.**
W `apps/api/src/observability/metrics.service.ts` są dokładnie trzy takie
miejsca — i to nie jest liczba dobrana z wyczucia, tylko przeczytana z kodu:

| granica | co ją tworzy | nowa reguła |
|---|---|---|
| cały eksporter | `/metrics` API przestaje odpowiadać; zabiera jedenaście metryk naraz | `verris-eksporter-api-niemy` |
| backup | `if (this.objectStorage)` + własny `try/catch`, którego `catch` tylko loguje warn | `verris-metryki-backupu-nieobecne` |
| kolejka | `if (this.provisioningQueue && isAsync())` + własny `try/catch` | `verris-metryki-kolejki-nieobecne` |

Host ma czwartą taką granicę (textfile node_exportera) i ona miała już swojego
strażnika: `verris-security-watch-stale`. To był jedyny poprawnie zbudowany
strażnik ciszy w całym pliku — i posłużył za wzór dla pozostałych trzech.

Dwie dolne mają `unless on() absent(verris_process_uptime_seconds)`: zgłoś
ślepotę na backup **tylko wtedy, gdy eksporter poza tym żyje**. Gdy padnie całe
API, mówi o tym jedna reguła, a nie trzy.

Reguł jest teraz 17 zamiast 14. Bramka z `X-33` liczy oczekiwaną liczbę
z pliku, więc dostosowała się sama — gdyby liczba stała wpisana w skrypcie
wdrożeniowym, byłoby to szóste bliźniacze miejsce w tym projekcie.

## Czego to NIE łapie

Metryki liczników — `verris_runtime_errors_total` i pokrewne — mogą nie istnieć
zupełnie legalnie, bo jeszcze nic ich nie zwiększyło. Dla nich `absent()` nie
odróżnia „zero błędów" od „blok się nie wykonał"; jedyne, co je pilnuje, to
obecność całego eksportera. Zapisuję to tutaj, żeby nikt nie odczytał trzech
nowych reguł jako pełnego pokrycia.

## Dowód D2 — produkcja, przed wdrożeniem

Przepowiednia zapisana **przed** uruchomieniem zapytań: nowe wyrażenie zwróci
jedną próbkę o wartości `0`, a trzy `absent()` — pustkę. Cokolwiek innego
znaczyłoby, że nadal czegoś nie rozumiem.

```
(max(verris_backup_present == bool 0) or vector(0)) + (max(… > bool 90000) or vector(0))
  → [{"metric":{},"value":[1787582505.649,"0"]}]     jedna próbka, wartość 0
absent(verris_process_uptime_seconds)                 → []
absent(verris_backup_present) unless on() absent(…)   → []
absent(verris_provisioning_queue_oldest_…) unless …   → []
```

Cztery na cztery. Wyrażenie jest całkowite na żywych danych, nie na atrapie —
i to jest istotne po `X-34`, gdzie atrapa różniła się od produkcji akurat
w wymiarze, który decydował o wyniku.

## Czego brakuje do D3

**Strażnika nie ma i nie udaję, że jest.** Ma to być test, który czyta
`rules.yaml` i czerwieni się na dwóch rzeczach:

- reguła, której wyrażenie jest wyłącznie filtrem (`==`, `>`, `<` bez `bool`),
  **nie może** mieć `noDataState: Alerting` — to jest dokładnie ta konfiguracja,
  która paliła się przez trzy tygodnie;
- każda granica emisji z `metrics.service.ts` musi mieć swojego strażnika
  ciszy — inaczej dołożenie czwartego `try/catch` po cichu odtworzy `H-23`.

Druga asercja jest trudniejsza i ważniejsza, bo pilnuje zgodności dwóch plików,
a nie treści jednego. Bez niej `X-35` naprawia stan, a nie mechanizm.

## Przepowiednia na wdrożenie

- log bramki powie **„oczekuję 17 reguł"**, nie 14;
- `VerrisPostgresBackupStale` wyjdzie ze stanu Alerting w pierwszej ewaluacji
  po wczytaniu reguł (`for` opóźnia zapalenie, nie zgaszenie);
- żadna z trzech nowych reguł nie zapali się.

Gdyby backup nadal się palił, diagnoza jest zła i wracam do niej, a nie do
przestawiania `noDataState`.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-28` | jego plik; reguły przeniesione z Prometheusa miały tę wadę od początku |
| `X-31` | jego dead man's switch przejmuje całą odpowiedzialność za ciszę kanału |
| `X-33` | jego bramka policzyła 17 reguł bez zmiany w skrypcie |
| `H-23` | miesiąc ciszy o niewykonanej kopii — źródło nadkorekty, którą tu cofamy |
| `X-36` | osobno: security watch, którego znalezisko maskowało tę sprawę |

## Dowód po

- `ops/observability/grafana/provisioning/alerting/rules.yaml` — wyrażenie
  całkowite w `verris-postgres-backup-stale`, `noDataState: OK`, nowa grupa
  `verris_cisza_eksporterow` z trzema regułami

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] **D2 — cztery zapytania na produkcji** · [ ] D3 — wdrożenie · [ ] D4
