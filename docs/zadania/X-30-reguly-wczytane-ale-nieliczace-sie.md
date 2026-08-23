# `X-30` — Reguła wczytana to nie reguła działająca

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI |
| **Nakład** | S (~2 h) |
| **Zależy od** | `X-28`, `X-29` |
| **Status** | **zamknięte** |
| **Data** | 2026-08-23 |

---

## Jak to wyszło

Wdrożenie **#67** przeszło na zielono. Krok `X-29` zrobił dokładnie to, co miał: `promtool`
przyjął konfigurację, Prometheus i Grafana zostały odtworzone i zrestartowane, oba odpowiedziały
na health-check. Grafana zalogowała `starting to provision alerting` i `finished to provision
alerting`. Trzynaście reguł stanęło w jej bazie.

Sprawdziliśmy log — bo tego dnia już raz się okazało, że „zielone" nie znaczy „działa":

```
level=error msg="Failed to build rule evaluator"
error="failed to build query 'A': data source not found"
```

Wszystkie trzynaście, co trzydzieści sekund, łącznie z `VerrisPostgresBackupStale` — czyli tą
jedyną, dla której to wszystko było robione.

## Przyczyna

Reguły odwołują się do źródła danych po `uid`. `X-28` dopisało `uid: Prometheus` do
`datasources.yml` — i to nie wystarczyło.

**Grafana przy provisioningu aktualizuje istniejące źródło danych po NAZWIE i zostawia mu `uid`
nadany przy pierwszym utworzeniu.** Ten uid jest losowy. Dopisanie `uid:` do pliku nie zmienia
rekordu, który już istnieje.

Dashboardy tego nie zauważyły, bo mają starą, nazwową ścieżkę zgodności — `"uid": "Prometheus"`
w JSON-ie rozwiązuje się u nich po nazwie. **Reguły alertowe takiej ścieżki nie mają.**

## Mój błąd, nazwany wprost

Strażnik `routing-alertow.spec.ts` (z `X-28`) sprawdzał, że `datasourceUid` użyty w regułach
**występuje** w `datasources.yml`.

Występował. Plik był spójny z plikiem.

**I to nie dowodziło niczego o działającym systemie**, bo pytanie nie brzmiało „czy napis się
zgadza", tylko „czy Grafana rozwiąże to odwołanie". Test zgodności plików nie widzi semantyki
upsertu Grafany.

To ta sama pułapka co przy `Z-01`, `H-20` i dwa razy przy diagnozie `@prisma/client`:
**test przechodzi, system nie działa.** Napisałem o niej w komentarzu do `X-28` i wpadłem w nią
godzinę później. Zapisuję to tutaj, bo lista wystąpień jest dłuższa niż lista przypadków, które
udało mi się przewidzieć.

## Rozwiązanie — dwie rzeczy, bo to dwa różne problemy

### 1. Źródło danych jest odtwarzane, a nie aktualizowane

```yaml
deleteDatasources:
  - name: Prometheus
    orgId: 1
```

`deleteDatasources` wykonuje się **przed** wstawieniem, więc źródło powstaje od nowa z uid-em
z repozytorium. Kosztuje odtworzenie rekordu przy każdym starcie Grafany — rekord jest w całości
zadeklarowany w pliku, więc nie ma czego stracić. Przy okazji naprawia to również dashboardy:
przestają zależeć od ścieżki zgodności, bo uid, na który wskazują, wreszcie istnieje.

### 2. Wdrożenie pyta działającą Grafanę, czy reguły się LICZĄ

Krok `4.6`, po tym jak monitoring wstał:

- **Liczba reguł.** `grafana_alerting_rule_group_rules` musi być większa od zera. Pusty
  provisioning wygląda identycznie jak zdrowa Grafana: `/api/health` odpowiada, kontener stoi,
  log nie krzyczy.
- **Przyrost nieudanych ewaluacji.** `grafana_alerting_rule_evaluation_failures_total`, odczyt
  **dwa razy** w odstępie 75 sekund. Wartość bezwzględna nie wystarcza — pojedyncze
  niepowodzenie zaraz po restarcie, gdy Prometheus jeszcze wstaje, jest normalne. Liczy się to,
  czy reguły czerwienią się **nadal**. Odstęp jest dłuższy niż cykl najkrótszej grupy (30 s);
  krótszy pokazałby zero błędów tylko dlatego, że nic się jeszcze nie policzyło.

Przy przyroście wdrożenie kończy się `exit 1` i wypisuje najczęstszą przyczynę wprost, razem
z poleceniem do logu. Aplikacja zostaje wdrożona i zdrowa — czerwony jest **monitoring**, i tak
ma być.

## Czego to NIE łapie i dlaczego nie da się inaczej

Naturalnym odruchem jest „dołóżmy alarm o niedziałających alarmach" — regułę na
`increase(grafana_alerting_rule_evaluation_failures_total[10m]) > 0`.

**Nie zadziała w tym przypadku.** Meta-reguła jest regułą Grafany i liczy się z tego samego
źródła danych. Gdy źródło jest zepsute, meta-reguła też się nie liczy i też milczy. Łapie
pojedynczą regułę z błędnym wyrażeniem — nie łapie złamanego źródła danych.

Ten przypadek łapie **wyłącznie bramka we wdrożeniu**, bo ona pyta z zewnątrz. Dlatego nie
dokładam meta-reguły: dałaby poczucie pokrycia, którego nie ma. Wracamy do tego, gdy Prometheus
zacznie skrobać metryki Grafany i alarm będzie mógł powstać po stronie Prometheusa — czyli poza
mechanizmem, o którego awarii ma meldować.

## Strażnik

`apps/api/src/test/reguly-alertowe-licza-sie.spec.ts` — 11 asercji w dwóch grupach:

1. **Wdrożenie pyta Grafanę:** czyta `3000/metrics` z działającego kontenera (nie plik z repo),
   odrzuca wdrożenie z zerem reguł, porównuje licznik błędów **dwa razy**, czeka dłużej niż
   30 sekund, przerywa z komunikatem wskazującym przyczynę, a całość idzie **po** tym, jak
   monitoring wstał (pytanie o metryki kontenera, który jeszcze nie odpowiada, dałoby pustkę,
   czyli fałszywą zieleń).
2. **Uid jest wymuszony:** `deleteDatasources` obecne, stoi **przed** deklaracją, a uid ze
   źródła zgadza się z `datasourceUid` w regułach.

**Czerwieni się na starym kodzie: 7 z 11.**

`routing-alertow.spec.ts` zostaje bez zmian. Sprawdzanie zgodności plików jest **potrzebne** —
okazało się tylko **niewystarczające**.

## Dowód D3 — z logu produkcyjnej Grafany

Wdrożenie **#68** (`2788011`) przeszło przez krok 4.6 i trwało 9m54s — o te 75 sekund dłużej.
Krok przechodzi tylko wtedy, gdy Grafana ma reguły **i** licznik nieudanych ewaluacji nie urósł.

```
11:01:46 provisioning.datasources  msg="deleted datasource based on configuration" name=Prometheus
11:01:46 provisioning.datasources  msg="inserting datasource from configuration" name=Prometheus uid=Prometheus
```

Wszystkie wpisy `Failed to build rule evaluator` mają znacznik **10:58–11:01:39**, czyli sprzed
restartu. Po 11:01:46 nie ma **ani jednego**.

Wpisy `Detected stale state entry ... reason=Error` o 11:02–11:03 to Grafana sprzątająca stare
wpisy w stanie „Alerting z powodu błędu" — stąd wiadomości `[RESOLVED]`.

### Potwierdzenie uboczne, mocniejsze od samego logu

`VerrisProvisioningQueueFailed` **nie ucichła** po naprawie: wysyła alarm co minutę od 11:12.
Reguła ma `for: 10m`, restart był 11:01:46 → pierwsze zapalenie o 11:12 zgadza się co do sekundy.

Warunek `verris_provisioning_queue_depth{state="failed"} > 0` jest więc **prawdziwie spełniony**.
Alerting zaczął działać i w ciągu dziesięciu minut znalazł na produkcji coś realnego.

**Reguła, która zapala się z właściwego powodu, dowodzi więcej niż cisza.** Sama awaria jobów
prowizjonowania to osobna pozycja — nie ta.

### Ta awaria zamknęła przy okazji inny otwarty punkt

`execErrState: Alerting` sprawił, że błąd ewaluacji zapalił alarmy — i **dziesięć maili dotarło**
na `dominik@hvln.pl` z tematami `[FIRING:1] <alertname> <severity> (Verris)`. Droga do skrzynki
była w audycie niepotwierdzona od początku projektu; potwierdziła się sama, z niewłaściwego
powodu. Szczegóły przy `X-31` i w `docs/ops/GRAFANA_ALERTING.md` §3.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-28` | jego strażnik był potrzebny i niewystarczający — to jest ta różnica |
| `X-29` | dowiózł pliki; ta pozycja sprawdza, czy pliki coś zmieniły |
| `Z-01`, `H-20` | ta sama rodzina: test przechodzi, system nie działa |

## Dowód po

- `ops/observability/grafana/provisioning/datasources/datasources.yml` — `deleteDatasources`
- `ops/scripts/prod-deploy-ghcr.sh` — krok 4.6
- `apps/api/src/test/reguly-alertowe-licza-sie.spec.ts` — 11 asercji, 7 czerwonych na starym kodzie

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [x] D3 · [ ] D4

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`
