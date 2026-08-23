# `X-29` — Konfiguracja obserwowalności zmieniała się w repo i nie docierała na produkcję

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI |
| **Nakład** | S (~2 h) |
| **Zależy od** | `X-28` (przy nim wyszło) |
| **Status** | zamknięte |
| **Data** | 2026-08-23 |

---

## Jak to wyszło

Zaraz po scaleniu `X-28` — poprawki, która **przenosi** reguły alertowe z Prometheusa do
Grafany — padło pytanie kontrolne: co się właściwie stanie po wdrożeniu?

Odpowiedź: **nic.**

`ops/scripts/prod-deploy-ghcr.sh` robi na serwerze `checkout` repozytorium do wdrażanego SHA,
więc nowe pliki lądują na dysku. Potem restartuje dokładnie tyle:

```bash
APP_SERVICES="api client-panel staff-panel admin-panel status-page www"
```

Prometheusa i Grafany na tej liście nie ma. Oba czytają konfigurację **tylko przy starcie
kontenera** i oba mają ją podmontowaną z repozytorium. Nowy `rules.yaml` leżałby więc na
serwerze, a Grafana dalej działałaby z tym, co wczytała przy ostatnim restarcie — czyli
z zerem reguł.

## Zasięg jest szerszy niż alerty

Tą samą drogą nie docierało na produkcję **wszystko** pod `ops/observability/`:

- `prometheus.yml` — cele scrapowania, etykiety, retencja
- `grafana/provisioning/datasources/` — źródła danych
- `grafana/provisioning/dashboards/json/` — dwadzieścia kilka dashboardów
- `grafana/provisioning/alerting/` — punkty kontaktowe i polityki

Każda zmiana w tych plikach od ostatniego ręcznego restartu Grafany istniała wyłącznie
w repozytorium.

## Rodzina błędów

Ten sam kształt co `X-28` (alarm bez odbiorcy), `X-14` i `X-23` (kontrola, która melduje
zamiast zatrzymywać) i `H-20` (procedura bez dowodu wykonania):

> **coś wygląda na zrobione, bo istnieje.**

Zielone CI, zielony deploy, plik na dysku, pozycja zamknięta w macierzy — i zero zmiany
w działającym systemie. Różnica wobec poprzednich wystąpień jest tylko taka, że tutaj
zawodziło ostatnie ogniwo: nie budowa, nie test, nie bramka, tylko **dostarczenie**.

## Rozwiązanie

Krok `4.5` w `prod-deploy-ghcr.sh`, po bramce zdrowia aplikacji i po zapisaniu ostatniego
dobrego tagu.

**Dwa polecenia, nie jedno.**
`compose up -d` odtwarza kontener, gdy zmieniła się **definicja** usługi — a `X-28` usunęło
montowanie `alerts.yml`. `compose restart` wymusza ponowne wczytanie, gdy zmieniła się tylko
**treść** podmontowanego pliku; tego compose nie widzi i sam z siebie nie zrobi nic.

**Bezwarunkowo, nie „gdy się zmieniło".**
Porównanie z poprzednim SHA wymagałoby obu wersji w repozytorium na serwerze, a `fetch`
jest tam płytki (`--depth 1`). Nieudane porównanie skończyłoby się cichym
„brak zmian → nie restartuj" — czyli **dokładnie tym błędem, który ta pozycja naprawia**.
Restart dwóch kontenerów kosztuje kilkanaście sekund przerwy w zbieraniu metryk. Cicha
rozbieżność konfiguracji kosztowała miesiąc bez kopii bazy.

**Sprawdzenie przed restartem.**
`promtool check config` na pliku z repozytorium. Restart na zepsutej konfiguracji zdejmuje
monitoring, a zauważyć to miał właśnie monitoring. Uruchamiane jako
`compose run --rm --no-deps --entrypoint promtool`, nie `exec` — świeży kontener z tą samą
definicją usługi, więc sprawdzenie działa również wtedy, gdy Prometheus akurat leży. Przy
`exec` padałoby w jedynym momencie, w którym naprawdę zależy nam na restarcie.

**Sprawdzenie po restarcie.**
„Wydałem polecenie restartu" to nie to samo co „wróciły". Grafana odpowiada na
`/api/health`, Prometheus na `/-/healthy` — pytany **z kontenera Grafany**, bo obraz
Prometheusa nie ma czym wykonać zapytania HTTP, a obie usługi są w tej samej sieci. Dwadzieścia
prób co trzy sekundy, potem `exit 1`.

**Kolejność ma znaczenie w dwie strony.**
Awaria monitoringu nie może wywrócić sprawnego wdrożenia aplikacji — dlatego krok jest po
bramce zdrowia i po zapisaniu `.last-good-image-tag`. Ale wdrożenie nie może też zostać
uznane za skończone, zanim monitoring dostanie nową konfigurację — dlatego kończy się
`exit 1`, a nie ostrzeżeniem. Gdyby Grafana nie wstała, chcemy głośnego błędu, a nie cofania
się do wersji sprzed dwóch.

## Strażnik

`apps/api/src/test/wdrozenie-obserwowalnosci.spec.ts` — 8 asercji:

1. usługi obserwowalności nazwane wprost (`OBS_SERVICES`),
2. **nie** doklejone do `APP_SERVICES` — doklejenie zadziałałoby przypadkiem i zepsuło dwie
   inne rzeczy: rollback cofałby monitoring razem z aplikacją (a on nie ma tagu obrazu
   z GHCR), a `compose pull ${APP_SERVICES}` próbowałby pobrać je po `IMAGE_TAG`,
3. `up -d` **i** `restart`, nie jedno z dwóch,
4. `promtool check config` **przed** restartem,
5. sprawdzenie `/api/health` i `/-/healthy` **po** restarcie, z `exit 1`,
6. restart **po** bramce zdrowia aplikacji,
7. zapis ostatniego dobrego tagu **przed** restartem obserwowalności,
8. strażnik czyta właściwy plik.

**Czerwieni się na starym kodzie: 6 z 8.** Dwie przechodziły i przed poprawką — „strażnik
czyta właściwy plik" oraz ta o `APP_SERVICES`, bo Prometheusa i Grafany naprawdę tam nie
było (tyle że nie było ich też nigdzie indziej).

## Czego to NIE dowodzi

Że po najbliższym wdrożeniu Grafana **ma reguły**. Dowodzi, że wdrożenie je jej dowiezie
i przerwie, jeśli po restarcie nie odpowie. Sprawdzenie, że reguły faktycznie się załadowały,
to osobna obserwacja na produkcji (**D3**): `Alerting → Alert rules` w Grafanie powinno
pokazać trzynaście reguł w folderze `Verris`.

## Skutek uboczny wart odnotowania

`Deploy #66` (scalenie `X-28`) poszedł jeszcze **starym** skryptem — więc pliki wjechały na
serwer, a monitoring został z poprzednią konfiguracją. Naprawia się to samo przy pierwszym
wdrożeniu z tą zmianą; ręczna interwencja nie jest potrzebna.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `X-28` | bez tego X-28 byłoby zamknięte w repo i nieobecne na produkcji |
| `H-23` | domyka łańcuch: reguła istnieje → ma odbiorcę → dociera na serwer |
| `X-14`, `X-23` | ta sama klasa: coś wygląda na zrobione, bo istnieje |

## Dowód po

- `ops/scripts/prod-deploy-ghcr.sh` — krok 4.5
- `apps/api/src/test/wdrozenie-obserwowalnosci.spec.ts` — 8 asercji, 6 czerwonych na starym kodzie

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`
