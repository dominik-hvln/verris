# `X-35` — Reguła nie umiała powiedzieć „jest dobrze". Umiała tylko milczeć.

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI (alarm krytyczny palący się na zdrowym systemie) |
| **Nakład** | M (~4 h) |
| **Zależy od** | `X-28` (to jego plik reguł), `X-31` (dead man's switch) |
| **Status** | **ZAMKNIĘTE — D3 uzyskane na produkcji 2026-08-24** |
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

## Strażnik

`apps/api/src/test/reguly-nie-myla-pustki-ze-zdrowiem.spec.ts` — **7 asercji**.

Sedno siedzi w jednej funkcji: `jestFiltrem()` odpowiada na pytanie, czy
wyrażenie potrafi zwrócić pustkę przy ZDROWYM systemie. Porównanie bez `bool`
filtruje; z `bool` zwraca 0/1 i próbka istnieje zawsze. Reguła filtrująca
z `noDataState: Alerting` to dokładnie konfiguracja, która paliła się trzy
tygodnie.

Poza tym: `noDataState: Alerting` zostaje wyłącznie na dead man's switchu
z `vector(1)`; każdy sentinel istnieje naprawdę w `metrics.service.ts` i ma
swoją regułę `absent()`; cisza całego eksportera ma osobnego strażnika.

**Asercja, na której zależy najbardziej** — `dołożenie nowej granicy emisji
czerwieni ten test`. Wyciąga z `metrics.service.ts` wszystkie bloki
`if (this.…)` i porównuje ze zdeklarowaną listą granic. Dziś są cztery: kolejka
i backup mają sentinele, `runtimeErrors` i `httpMetrics` mają **zapisany powód,
dlaczego nie mogą go mieć** (to liczniki — brak metryki znaczy „nic jej nie
zwiększyło", nie ślepotę). Piąty blok warunkowy rozwala tę asercję i wymusza
decyzję. Bez niej `H-23` wróciłby po cichu przy pierwszym nowym `try/catch`.

**Test sprawdza sam siebie.** Logika sprawdzająca jest wyciągnięta do funkcji
i puszczana przez dwa wejścia: prawdziwy `rules.yaml` (ma przejść) oraz fixture
odtwarzający regułę sprzed X-35 (ma zostać odrzucony, z konkretnym powodem).
Bez tego drugiego wejścia test dowodziłby wyłącznie, że dzisiejszy plik go nie
wyzwala — nie, że sprawdzenie cokolwiek łapie. To lekcja z `X-28` (plik zgodny
z plikiem) i `X-34` (atrapa nie sięgająca progu, na którym usterka żyje).

**Czerwieni się na kodzie sprzed X-35: 4 z 7.** Zmierzone: odtworzyłem plik
sprzed zmiany (14 reguł, stare wyrażenie, `noDataState: Alerting`), puściłem
ten sam zestaw, przywróciłem plik i sprawdziłem sumę kontrolną.

## Dowód D3 — produkcja, 2026-08-24

Przepowiednia zapisana **przed** uruchomieniem: bramka powie „oczekuję 17
reguł", numer próby będzie jednocyfrowy, a `VerrisPostgresBackupStale`
przestanie się palić.

```
20:19:00Z  backup-stale  Sending alerts        ← ostatni przed restartem
20:19:44Z  Starting scheduler                  ← restart grafany
20:20:05Z  backup-stale  Sending alerts        ← 21 s PO: powiadomienie o ROZWIĄZANIU
      ...  cisza
20:54Z     grep -c 'backup-stale' w oknie 25 min → 0
```

Bramka, uruchomiona tą samą biblioteką co skrypt wdrożeniowy:
**`OK: 17/17 reguł aktywnych (próba 1)`**.

Kontrast jest dosadny: **dziewiętnaście wpisów w dziewiętnaście minut** przed
restartem, co minutę jak w zegarku — i zero przez trzydzieści pięć minut po,
czyli przez pełne okno `for: 30m`. Gdyby warunek nadal był spełniony, reguła
zapaliłaby się ponownie o 20:49:44Z. Nie zapaliła.

Wpis z 20:20:05Z to zgaszenie, nie zapalenie: `for` opóźnia zapalenie, nie
zgaszenie, więc reguła fizycznie nie mogła wysłać alarmu 21 sekund po
restarcie. Logger `ngalert.sender.router` wypisuje oba zdarzenia tą samą frazą.

**Czego ten dowód NIE obejmuje.** Nie przeszedł pełnego
`prod-deploy-ghcr.sh` — ta ścieżka jest w tej chwili niesprawna, bo dla
bieżącego `main` nie ma obrazów w GHCR (`compose pull` → `not found`).
Prowizjonowanie jest montowane z dysku, więc restart Grafany wystarczył do
przeładowania reguł, ale to osobna sprawa i osobna pozycja w backlogu.

## Korekta dopisana 2026-08-26 (z `X-43`)

Ta pozycja trafiła na `main` z **czerwoną bramką**, czego wtedy nie zauważyliśmy.

Zmiana `noDataState: Alerting` → `OK` była słuszna i dobrze uzasadniona, ale asercja
w `routing-alertow.spec.ts:141` nadal wymagała `Alerting`. Zmiana i jej strażnik
rozjechały się **wewnątrz jednego zadania**:

| commit | co się stało |
|---|---|
| `9edc2356` — reguła backupu | `deploy.yml` #75 czerwone na kroku `API unit tests` |
| `5a725fe2` — poprawka `.gitignore` | `ci.yml` #101 i `deploy.yml` #76 — oba czerwone |
| `ab7522f8` — strażnicy ciszy | bramka testowa przeszła; naprawione |

Czerwień trwała trzy commity i **nie została wtedy odczytana** — zamknęliśmy pozycję
na D3 z produkcji, nie patrząc na bramkę. Produkcja potwierdziła, że reguła działa;
bramka mówiła równocześnie, że strażnik tej reguły twierdzi coś przeciwnego.

Wniosek, który zostaje: **zmieniając zachowanie, przeszukaj strażników tego zachowania
w tym samym commicie.** Nie „uruchom testy" — to zrobiliśmy i było czerwono — tylko
przeczytaj wynik, zanim uznasz zadanie za zamknięte.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-28` | jego plik; reguły przeniesione z Prometheusa miały tę wadę od początku |
| `X-31` | jego dead man's switch przejmuje całą odpowiedzialność za ciszę kanału |
| `X-33` | jego bramka policzyła 17 reguł bez zmiany w skrypcie |
| `H-23` | miesiąc ciszy o niewykonanej kopii — źródło nadkorekty, którą tu cofamy |
| `X-36` | osobno: security watch, którego znalezisko maskowało tę sprawę |
| `X-43` | koryguje — ujawnił, że ta pozycja trafiła na `main` z czerwoną bramką |

## Dowód po

- `ops/observability/grafana/provisioning/alerting/rules.yaml` — wyrażenie
  całkowite w `verris-postgres-backup-stale`, `noDataState: OK`, nowa grupa
  `verris_cisza_eksporterow` z trzema regułami
  (sha256 `09d6cb420da7808840fb90391330cf158cbf45483876518ece5d40aab4d1815f`,
  zweryfikowana na produkcji — pierwszy raz w tym projekcie mamy dowód
  zgodności repozytorium z hostem, a nie założenie)
- `apps/api/src/test/reguly-nie-myla-pustki-ze-zdrowiem.spec.ts` — 7 asercji,
  fixture sprzed X-35 odrzucany, 4/7 czerwone na starym pliku

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 — cztery zapytania na produkcji · [x] **D3 — 35 minut ciszy
  po restarcie, bramka 17/17** · [ ] D4
