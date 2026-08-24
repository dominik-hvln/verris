# `X-33` — Bramka mierzyła szybkość startu, a meldowała o poprawności

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI (bramka fałszywie alarmująca to bramka wyłączona) |
| **Nakład** | S (~2 h) |
| **Zależy od** | `X-30` (to jego bramka) |
| **Status** | **ZAMKNIĘTE — D3 uzyskane na wdrożeniu #71** |
| **Data** | 2026-08-23 |
| **Decyzja** | właściciel produktu wybrał „czekaj + porównaj z `rules.yaml`" |

---

## Co się stało

Wdrożenie **#70** (commit `b64db02`, scalenie `X-32`) padło. Bramka `X-30`
zameldowała:

```
[deploy] FAIL: Grafana nie ma ANI JEDNEJ reguły alertowej po provisioningu.
```

W tej samej chwili Grafana miała czternaście działających reguł:

```
grafana_alerting_rule_group_rules{org="1",state="active"} 14
grafana_alerting_rule_group_rules{org="1",state="paused"}  0
```

Oś czasu z logu wdrożenia:

```
15:43:09  compose restart prometheus grafana
15:43:15  /api/health OK   → bramka uznaje, że obserwowalność wstała
15:43:16  odczyt /metrics  → zero → FAIL
```

**Siedem sekund od restartu.**

## Dlaczego zero nie znaczyło zera

Z kodu Grafany 10.4.2, `pkg/services/ngalert/metrics/scheduler.go`:

```go
GroupRules: promauto.With(r).NewGaugeVec(
    prometheus.GaugeOpts{ ... Name: "rule_group_rules" ... },
    []string{"org", "state"},
),
```

To **GaugeVec z etykietami**. Ustawiany jest w `processTick()` — czyli na
pierwszym takcie schedulera alertów (domyślnie co 10 s), a nie przy starcie
procesu. Do tego momentu metryka **nie ma w `/metrics` ani jednej linii**.

Nie „ma zero". **Nie ma jej wcale.** A stara bramka sumowała pasujące linie
przez `awk` i drukowała `s + 0` — czyli zero. Pustka i katastrofa wyglądały
identycznie.

`/api/health` odpowiada dużo wcześniej niż tyknie scheduler. Wdrożenia #68
i #69 wygrały ten wyścig, #70 przegrało. O werdykcie bramki decydowało to,
jak szybko wstała Grafana, a nie to, w jakim stanie były reguły.

## Dlaczego to poważniejsze niż jeden czerwony deploy

Bramka, która potrafi zapalić się na zdrowym systemie, uczy człowieka klikać
**„re-run"**. Od tej chwili nie chroni już niczego — a nadal wygląda, jakby
chroniła, i nadal figuruje w audycie jako dowód `D2`.

To nowy typ w kolekcji tego projektu. Mieliśmy już:

- **bramki, które melduły zamiast bramkować** (`X-14`, `X-23`, `H-19`, `H-20`,
  `X-27`, `X-28`),
- **testy, które niczego nie dowodziły** (`Z-01`, `H-20`, `M-06`, `X-28`),
- **poprawną kontrolę, której się kłamie** (`Z-18`).

Ta jest czwarta: **kontrola, która nie odróżnia „nie ma" od „jeszcze nie ma"**.
Mierzy stan systemu w chwili, w której system nie zdążył jeszcze nic o sobie
powiedzieć, i milczenie interpretuje jako odpowiedź.

Warto to zapamiętać jako pytanie do każdej przyszłej bramki: **czy brak danych
i zła wartość dają w niej ten sam wynik?** Jeżeli tak, bramka mierzy czas,
a nie stan.

## Rozwiązanie

`ops/scripts/lib/bramka-regul-alertowych.sh` — logika bramki w osobnym,
wczytywanym pliku. `prod-deploy-ghcr.sh` ją `source`'uje.

### Czekamy, zamiast ścigać się

`czekaj_na_reguly` odpytuje Grafanę do 60 razy co 3 s (**180 s** — pierwotnie
60 s, patrz niżej: wdrożenie #71 pokazało, że to za mało). Kończy się sukcesem,
gdy liczba reguł aktywnych zgadza się z oczekiwaną i żadna nie wisi w stanie
`paused`.

To **nie jest poluzowanie bramki**. Stara wersja przepuszczała dziewięć reguł
z czternastu (bo 9 > 0) i odrzucała czternaście z czternastu (bo mierzyła za
wcześnie). Nowa robi dokładnie odwrotnie w obu przypadkach.

### Trzy różne niepowodzenia, trzy różne komunikaty

| Sytuacja | Komunikat | Co naprawiać |
|---|---|---|
| metryki nigdy nie było | „Grafana nie opublikowała metryki… scheduler alertów nie wystartował" | Grafanę |
| jest linia, jest za mało reguł | „prowizjonowanie CZĘŚCIOWE: 9 z 14" | `rules.yaml` |
| reguły w stanie `paused` | „…wisi w stanie paused — wczytane, ale NIE LICZĄ SIĘ" | stan reguł |

Bramka, która na trzy różne awarie mówi jedno zdanie, każe człowiekowi
diagnozować od zera. To jest ta sama lekcja co przy `Z-18`.

### Liczba odniesienia z pliku, nie ze skryptu

`policz_reguly_w_pliku` liczy wpisy `- uid:` w `rules.yaml` **w chwili
wdrożenia**. Wpisanie `14` do skryptu byłoby **szóstym bliźniaczym miejscem**
w tym projekcie (`Z-12`, `Z-16`, `M-06`, `X-24`, `H-24`): jedna reguła w dwóch
kopiach, z których ktoś kiedyś zaktualizuje tylko jedną. Dopisanie
piętnastej reguły ma czerwienić bramkę wtedy i tylko wtedy, gdy Grafana jej nie
wczyta.

### Czego świadomie NIE zrobiliśmy

**Nie skróciliśmy taktu schedulera Grafany.** Zmiana ustawienia produkcyjnego
po to, żeby zadowolić bramkę, odwraca zależność: to bramka ma się dostosować do
systemu, nie odwrotnie.

## Strażnik

`apps/api/src/test/bramka-regul-nie-myli-braku-z-oczekiwaniem.spec.ts` —
11 asercji.

**Ten strażnik wygląda inaczej niż poprzednie i to jest jego sedno.** Strażnik
`X-28` sprawdzał, że uid użyty w `rules.yaml` występuje w `datasources.yml` —
plik był zgodny z plikiem, a system nie działał. Tu nie ma ani jednej asercji
w rodzaju „w skrypcie występuje słowo `sleep`". Test **uruchamia prawdziwą
funkcję bashową** i podstawia jej atrapę Grafany, która zachowuje się dokładnie
tak, jak zachowała się Grafana 23 sierpnia o 15:43:16: trzy odpowiedzi bez
metryki, potem odpowiedź z czternastoma regułami.

Właśnie po to logika trafiła do osobnego pliku. Dopóki siedziała w skrypcie
wdrożeniowym, jedyną możliwą asercją było czytanie tekstu skryptu.

Przypadki: wyścig #70 · metryka, której nigdy nie ma · metryka obecna
i naprawdę zerowa (inny komunikat!) · prowizjonowanie częściowe · reguła
`paused` · komplet za pierwszym razem · liczba odniesienia zgodna z `rules.yaml`
· skrypt wdrożeniowy faktycznie używa tej biblioteki, a nie własnej kopii.

**Czerwieni się na starym kodzie: 9 z 9** (z 9 asercji pierwszej wersji; po
podniesieniu okna jest ich 11).

Sam ten wynik byłby jednak mało pouczający — na starym stanie repozytorium
biblioteki nie ma wcale, więc wszystko wysypuje się na braku pliku. Dlatego
zmierzyłem to drugi raz, podstawiając **starą semantykę pod ten sam interfejs**
(jeden odczyt, warunek „więcej niż zero"): **7 z 9 czerwonych**. To jest
uczciwsza liczba, bo oddziela zmianę zachowania od zniknięcia pliku. Dwie
asercje, które przechodzą w tym wariancie, to test dymny i liczenie reguł
z `rules.yaml`.

## Co złapali strażnicy, którzy już byli

Zmiana zapaliła dwa istniejące testy i oba miały rację:

**`skrypty-wykonywalne.spec.ts`** — nowa biblioteka nie miała bitu
wykonywalności. Kusiło, żeby dopisać wyjątek („to plik wczytywany, nie
uruchamiany"). Nie dopisałem: komentarz tego strażnika mówi wprost, że reguła
jest bezwyjątkowa właśnie dlatego, że lista wyjątków byłaby kolejnym bliźniaczym
miejscem — i że wykonywalny skrypt nic nie kosztuje. `chmod +x`, strażnik bez
zmian. Poluzowanie strażnika pod nowy plik byłoby jedenastym wystąpieniem
rodziny „strażnik dopasowuje własną prozę".

**`reguly-alertowe-licza-sie.spec.ts`** (strażnik `X-30`) — sprawdzał treść
`prod-deploy-ghcr.sh`, a logika przeniosła się do biblioteki. Gdybym tylko
usunął tę asercję, strażnik `X-30` zacząłby pilnować mniej niż wcześniej, nie
mówiąc o tym ani słowem. Zamiast tego czyta teraz skrypt **razem
z bibliotekami, które skrypt sam wczytuje** — czyli to, co naprawdę się
wykonuje — a asercja o pustym provisioningu została **wzmocniona** z „więcej niż
zero" do „komplet reguł".

## Dowód D3 — wdrożenie #71, i mocniejszy, niż zakładałem

```
09:30:43  [deploy] czekam na scheduler alertów (oczekuję 14 reguł, do 60 s)…
09:31:37  [deploy] OK: 14/14 reguł aktywnych (próba 17).
09:32:52  [deploy] reguły liczą się bez błędów (0 → 0).
```

**Próba siedemnasta.** Metryka pojawiła się **54 sekundy** po restarcie, nie
siedem i nie dziesięć. To nie jest dowód „bramka przeszła" — to dowód, że
w tym samym miejscu poprzednia wersja padłaby **po raz drugi**, na zdrowym
systemie.

Wdrożenie trwało 3 m 58 s zamiast ~3 m. Cała różnica to te 54 sekundy
czekania. Uczciwy koszt.

## Ten sam log wykrył błąd w mojej własnej liczbie

Zakładałem takt schedulera ~10 s i ustawiłem okno na 60 s, czyli 20 prób.
Zużyliśmy 17. **Zapas wynosił trzy próby — dziewięć sekund.**

Przy odrobinę wolniejszym starcie Grafany kolejne wdrożenie padłoby dokładnie
tak jak #70 i z dokładnie tego samego nie-powodu. Mechanizm był dobry, liczba
dobrana na wyczucie, a wyczucie o 80% za optymistyczne.

**Okno podniesione do 180 s** (60 prób co 3 s) — trzykrotny zapas, nie
dwukrotny, bo 54 s to **jedna obserwacja, nie rozkład**; nie wiem, czy to był
dobry dzień Grafany, czy zły.

Dłuższe okno **nie spowalnia zdrowego wdrożenia ani o sekundę**: pętla kończy
się w chwili, w której reguły się zgadzają. Płacimy wyłącznie przy prawdziwej
awarii prowizjonowania — błąd przyjdzie po trzech minutach zamiast po jednej.
To dobry kurs wymiany: fałszywy alarm uczy klikać „re-run", a dwie minuty
dłuższego czekania na prawdziwą awarię nie uczą niczego.

### I od razu bliźniacze miejsce, którego omal nie zrobiłem

Pierwsza wersja poprawki wpisywała `180` do komunikatu w skrypcie
wdrożeniowym, a `60` prób do biblioteki. Log mówiłby „do 180 s" niezależnie od
tego, ile bramka naprawdę czeka — i okłamałby pierwszą osobę czytającą go
w trakcie awarii. Okno podaje teraz `okno_bramki_sekundy` i tylko ona; asercja
pilnuje, żeby w skrypcie nie pojawiła się druga liczba.

Dwie dodatkowe asercje (razem **11**): okno ma co najmniej trzykrotny zapas nad
zmierzonymi 54 s, a skrypt nie ma własnej kopii tej liczby. Obie czerwienią się
na kodzie sprzed #71.

## Stan produkcji po #70

`exit 1` w tym miejscu kończy skrypt **przed** sekcją rollbacku, więc nic się
nie cofnęło: na produkcji stoi `b64db02`, `/healthz` przeszedł,
`.last-good-image-tag` jest zapisany, przycisk **Odrzuć** z `X-32` jest live,
a czternaście reguł się liczy. Wdrożenie było **udane**; nieudana była bramka.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-30` | to jego bramka; asercja o pustym provisioningu wzmocniona |
| `X-32` | wdrożył się mimo czerwonego deployu — dlatego D3 dla `X-32` da się zdobyć od razu |
| `X-31` | reguła bicia serca działa (jest wśród tych czternastu) |
| `X-25` | strażnik wykonywalności skryptów zadziałał przeciwko mnie i miał rację |

## Dowód po

- `ops/scripts/lib/bramka-regul-alertowych.sh` — `czekaj_na_reguly`,
  `policz_reguly_w_pliku`, `regul_w_stanie`, `metryka_istnieje`
- `ops/scripts/prod-deploy-ghcr.sh` — krok 4.6a
- `apps/api/src/test/bramka-regul-nie-myli-braku-z-oczekiwaniem.spec.ts` —
  11 asercji, 9 czerwonych na starym stanie repozytorium (7 przy podstawionej
  starej semantyce), 2 czerwone na kodzie sprzed #71
- `ops/scripts/lib/bramka-regul-alertowych.sh` — `okno_bramki_sekundy`
  (jedno źródło okna, żeby log nie kłamał)
- `apps/api/src/test/reguly-alertowe-licza-sie.spec.ts` — czyta skrypt razem
  z bibliotekami

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [x] **D3 — wdrożenie #71, „próba 17"** · [ ] D4

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`.
