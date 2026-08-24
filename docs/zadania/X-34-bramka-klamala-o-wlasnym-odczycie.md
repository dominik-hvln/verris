# `X-34` — Bramka nie kłamała o Grafanie. Kłamała o własnym odczycie.

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI (usterka w bramce, którą sam dopisałem dzień wcześniej) |
| **Nakład** | S (~2 h) |
| **Zależy od** | `X-33` (to jego kod) |
| **Status** | zamknięte w kodzie, **D3 przy pierwszym zielonym wdrożeniu** |
| **Data** | 2026-08-24 |

---

## Co się stało

Wdrożenie **#72** padło:

```
09:53:12  [deploy] restart obserwowalności (prometheus grafana)…
09:53:18  [deploy] czekam na scheduler alertów (oczekuję 14 reguł, do 180 s)…
09:56:31  [deploy] FAIL: Grafana nie opublikowała metryki
          grafana_alerting_rule_group_rules w ciągu 60 prób co 3s.
          Scheduler alertów nie wystartował.
```

Log **samej Grafany** z tej samej minuty mówi coś przeciwnego:

```
09:53:15.845  ngalert.scheduler  "Starting scheduler" tickInterval=10s maxAttempts=1
09:53:15.845  ngalert.state.manager  "State cache has been initialized" states=14
09:53:31.549  ngalert.sender.router  rule_uid=verris-postgres-backup-stale  "Sending alerts…"
```

Scheduler wystartował **cztery sekundy** po restarcie. Czternaście reguł
w cache'u. Pierwsze alerty poszły w kilkanaście sekund. Bramka twierdziła, że
metryki nie ma, przez **193 sekundy**.

**Grafana była zdrowa. Kłamał mój odczyt.**

## Przyczyna — jedna linijka, próg ostry jak nóż

```bash
printf '%s\n' "$metryki" | grep -q '^grafana_alerting_rule_group_rules{'
```

Skrypt wdrożeniowy pracuje z `set -Eeuo pipefail`.

`grep -q` kończy się **natychmiast po pierwszym dopasowaniu**. `printf` w tym
momencie wciąż wypisuje resztę odpowiedzi. Gdy odpowiedź nie mieści się
w buforze potoku, printf dostaje **SIGPIPE** i kończy się kodem **141**.
`pipefail` przepisuje najwyższy niezerowy status z potoku na cały potok —
więc sprawdzenie zwraca **błąd dokładnie wtedy, gdy metryka JEST**.

Zmierzone, deterministyczne, próg dokładnie na buforze potoku (64 KB):

| rozmiar `/metrics` | wynik sprawdzenia |
|---|---|
| 16 KB | ZNALEZIONO |
| 32 KB | ZNALEZIONO |
| 63 KB | ZNALEZIONO |
| **64 KB** | **BRAK** |
| 80 KB | BRAK |
| 128 KB | BRAK |

## To wyjaśnia wszystko, czego nie umiałem wyjaśnić

`/metrics` Grafany **rośnie** w miarę rejestrowania kolektorów. Wyścig nie
toczył się między bramką a schedulerem, tylko między **pojawieniem się metryki
a przekroczeniem 64 KB przez odpowiedź**:

| | co się stało | jak to wtedy zinterpretowałem |
|---|---|---|
| **#71** | metryka pojawiła się, gdy odpowiedź była jeszcze < 64 KB → odczyt się udał na 17. próbie | „scheduler potrzebuje 54 sekund" |
| **#72** | odpowiedź przekroczyła 64 KB, zanim metryka się pojawiła → 60 odczytów skłamało | „scheduler nie wystartował" |

Obie interpretacje były fałszywe. Model, który zbudowałem na podstawie #71
(„Grafana startuje wolno, dajmy trzykrotny zapas"), **nie opisywał niczego
prawdziwego** — a ja zdążyłem na jego podstawie podnieść okno i napisać
w komentarzu uzasadnienie, które brzmiało solidnie.

**Ten sam mechanizm prawdopodobnie stoi za #70.** Sprawdziliśmy tam metrykę
siedemnaście godzin później i uznaliśmy sprawę za zamkniętą.

## Dlaczego stara bramka tego nie miała

Poprzednia wersja czytała metryki tak:

```bash
compose exec … | awk '…'
```

**AWK czyta wejście do końca.** Nie zamyka potoku wcześniej, więc SIGPIPE nie
powstaje. Wdrożenia #68 i #69 działały nie dlatego, że były szczęśliwe — tylko
dlatego, że nie miały tej usterki.

**Ten błąd wprowadziłem ja, razem z `grep -q`.**

## Rozwiązanie

W bibliotece **nie ma już ani jednego potoku**:

- obecność metryki sprawdza **sama powłoka**, wzorcem na zmiennej (`case`) —
  żadnego procesu, żadnego potoku, żadnego SIGPIPE;
- tam gdzie potrzebny jest awk, wejście idzie przez `<<<`, a nie przez `|` —
  here-string to **przekierowanie**, nie potok, więc `pipefail` nie ma czego
  zepsuć.

### Okno zostaje 180 s, ale z innego powodu

Stare uzasadnienie („zmierzone 54 s × 3") było **nieprawdziwe** i zostawiłem je
w komentarzu przekreślone, żeby nikt go nie odtworzył. Prawdziwy pomiar, z logu
Grafany: scheduler startuje ~4 s po restarcie, metryka pojawia się na pierwszym
takcie. Sześćdziesiąt sekund w zupełności by wystarczyło.

Zostawiam 180 s, bo **czekanie jest darmowe** — pętla kończy się w chwili
zgodności, więc zdrowe wdrożenie nie trwa ani sekundy dłużej. Skoro zapas nic
nie kosztuje, nie ma powodu ścinać go do wartości dobranej z jednego pomiaru.

Czego ta liczba **nie ma** robić: maskować usterki odczytu. Gdyby bramka znów
zaczęła czekać minutami, odpowiedzią jest diagnoza, a nie 300 s.

## Dlaczego strażnik z `X-33` tego nie złapał — i to jest najważniejsza część

Test był **zielony**, a kod kłamał sześćdziesiąt razy z rzędu. Nie dlatego, że
sprawdzał złą rzecz. Dlatego, że **jego środowisko różniło się od produkcyjnego
w dwóch wymiarach, które akurat decydowały o wyniku**:

**Atrapa ważyła 200 bajtów.** Prawdziwe `/metrics` Grafany waży setki
kilobajtów. Przy 200 bajtach `printf` zdąży zapisać wszystko do bufora, zanim
`grep` się zamknie — SIGPIPE nigdy nie powstanie. Atrapa nie mogła dotknąć
usterki, bo nie sięgała progu, na którym usterka żyje.

**Harness ustawiał `set -u`, produkcja `set -Eeuo pipefail`.** Bez `pipefail`
ta usterka **nie istnieje**. Testowałem inną powłokę niż ta, która to uruchamia.

To nowa odmiana rodziny „test, który niczego nie dowodzi" (`Z-01`, `H-20`,
`M-06`, `X-28`): nie fałszywa asercja, tylko **fałszywe środowisko**. Asercje
były dobre. Kłamały dane wejściowe.

Pytanie do każdego przyszłego harnessu: **czym moja atrapa różni się od
produkcji — i czy któraś z tych różnic może decydować o wyniku?** Rozmiar
wejścia i flagi powłoki to nie są szczegóły techniczne. To są warunki, w których
kod działa albo nie.

## Strażnik

`apps/api/src/test/bramka-regul-nie-myli-braku-z-oczekiwaniem.spec.ts` —
**13 asercji** (było 11).

- atrapa waży teraz **ponad 64 KB** i test to **asertuje**, żeby nikt jej nie
  „uprościł" z powrotem;
- harness ustawia **dokładnie te flagi co skrypt wdrożeniowy**;
- osobna asercja: odpowiedź większa niż bufor potoku **nie** zamienia się
  w „brak metryki";
- asercja o treści biblioteki: żadnego `| grep`, żadnego `printf … |`. Wiem,
  czym grozi asercja na tekście pliku (`X-28`) — dlatego stoi **obok**
  zachowaniowej, nie zamiast niej. Tamta łapie usterkę, ta pilnuje, żeby nie
  wróciła tą samą drogą, gdy ktoś będzie „porządkował" bibliotekę.

**Czerwieni się na kodzie sprzed X-34: 7 z 13.**

## Czego to NIE dowodzi

Że działa na produkcji. Dowód **D3** powstanie przy pierwszym zielonym
wdrożeniu z tą biblioteką — i tym razem oczekuję **niskiego numeru próby**
(kilkanaście sekund, nie pięćdziesiąt cztery). Jeżeli znowu zobaczę
dwucyfrowy numer, to znaczy, że nadal czegoś nie rozumiem.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-33` | **D3 cofnięte** — wdrożenie #71 przeszło przypadkiem, nie dlatego, że bramka działała |
| `X-30` | jego bramka; nadal ta sama intencja |

## Dowód po

- `ops/scripts/lib/bramka-regul-alertowych.sh` — `metryka_istnieje` bez potoku,
  `regul_w_stanie` przez `<<<`
- `apps/api/src/test/bramka-regul-nie-myli-braku-z-oczekiwaniem.spec.ts` —
  13 asercji, atrapa > 64 KB, harness z `set -Eeuo pipefail`

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4
