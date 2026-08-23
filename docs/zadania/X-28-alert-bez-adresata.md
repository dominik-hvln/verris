# `X-28` — Alarm, który dzwonił w pustym pokoju

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI |
| **Nakład** | S (~3 h) |
| **Zależy od** | `H-23` (awaria kopii, która to ujawniła) |
| **Status** | zamknięte |
| **Data** | 2026-08-22 |

---

## Jak to wyszło

Przy zamykaniu `H-23` okazało się, że kopia bazy nie wykonała się **ani razu** przez ponad
miesiąc. Zostało wtedy pytanie, na które nie było odpowiedzi: przecież istnieje reguła
`VerrisPostgresBackupStale` z `severity: critical` i progiem 25 godzin. Dlaczego nie
zadzwoniła?

Zadzwoniła. Poprawnie, dokładnie wtedy, kiedy powinna. Nie miała tylko dokąd.

## Przyczyna

W repozytorium były **dwie połowy** jednego mechanizmu i żadna z nich nie działała bez
drugiej.

**Połowa pierwsza — Prometheus miał reguły i nie miał adresata.**
`ops/observability/prometheus/alerts.yml`: trzynaście reguł, w tym pięć z `severity: critical`.
`prometheus.yml` ładował je przez `rule_files` i **nie miał sekcji `alerting:`**. W całym
repozytorium — `docker-compose.prod.yml`, `docker-compose.ghcr.yml`, `ops/` — nie było
usługi `alertmanager`. Prometheus liczył alerty i wyświetlał je we własnym interfejsie.
Na tym się kończyło.

**Połowa druga — Grafana miała adresata i nie miała reguł.**
`provisioning/alerting/contactpoints.yaml` → `dominik@hvln.pl`.
`provisioning/alerting/policies.yaml` → domyślna polityka, `repeat_interval: 4h`.
`GF_SMTP_*` ustawione na usłudze `grafana`. Cała droga do skrzynki gotowa —
i **zero reguł alertowych** do wysłania.

**Dokument był częścią problemu.** `docs/ops/GRAFANA_ALERTING.md` w §1 mówił wprost:
„W Grafana: Alerting → Alert rules → Import lub ręcznie odzwierciedlić progi z pliku YAML".
Instrukcja ręcznego przepisania trzynastu progów przez człowieka nie jest procedurą, tylko
opisem długu. Nikt tego nie zrobił i nie było jak zauważyć, że nie zrobił.

## Rodzina błędów

To ta sama rodzina co `X-14`, `X-23`, `H-19`, `H-20` i `X-27` — **kontrola, która melduje
zamiast zatrzymywać** — tylko o krok dalej. Tam mechanizm istniał i niczego nie bramkował.
Tutaj alarm istnieje, działa, jest poprawnie skonfigurowany i **nie ma odbiorcy**.

Sygnał bez odbiorcy jest gorszy od braku sygnału, bo w macierzy, na dashboardzie i w rozmowie
wygląda jak zabezpieczenie.

## Rozwiązanie

**Reguły przeniesione do Grafany**, nie skopiowane.
`ops/observability/grafana/provisioning/alerting/rules.yaml` — trzynaście reguł, dwie grupy,
te same progi i te same `for`. Ładowane z repo przy starcie kontenera, obok punktu
kontaktowego i polityki, które już działały.

**`alerts.yml` usunięty**, `rule_files` wycięte z `prometheus.yml`, montowanie pliku usunięte
z `docker-compose.prod.yml`.

Kopiowanie było kuszące i byłoby błędem — szóstym w tym projekcie wystąpieniem
**„bliźniaczych miejsc"** (`Z-12`, `Z-16`, `M-06`, `X-24`, `H-24`): dwa egzemplarze jednej
reguły, jeden poprawiony przy następnej zmianie progu, drugi zapomniany. Zapomniana kopia
alertu jest gorsza niż brak alertu, bo wygląda na działającą.

**UID źródła danych wpisany wprost.** `datasources.yml` nie miał `uid`, a odwołują się do
niego dwie rzeczy naraz: dashboardy (JSON-y mają `"uid": "Prometheus"`) i teraz reguły.
Bez jawnego UID Grafana nadaje go losowo, a odwołanie do nieistniejącego źródła nie rzuca
błędem — panel jest po prostu pusty, a reguła nie ma czego policzyć. Kolejny cichy tryb
awarii, ten sam co reszta tej pozycji.

**Jedna reguła zachowuje się inaczej od pozostałych.** `VerrisPostgresBackupStale` dostała
`noDataState: Alerting`; reszta ma `OK`. Prometheusowe wyrażenie z porównaniem zwraca pusty
wynik, gdy jest dobrze, więc brak serii domyślnie znaczy „warunek niespełniony" — i dla
dwunastu reguł tak jest poprawnie. Dla kopii bazy „metryka zniknęła" i „kopia jest świeża"
wyglądałyby identycznie, a to jest **dokładnie ten przypadek**, który kosztował nas miesiąc.
`for: 30m` sprawia, że zwykły restart API nie zapali alarmu.

**Przepisywanie było skryptowe, nie ręczne.**
`ops/observability/grafana/migracja-regul-do-grafany.py` — trzynaście reguł przepisanych
palcami to trzynaście okazji na literówkę w progu, której nikt nie sprawdzi. Skrypt zostaje
w repo jako zapis, **jak** powstał wynik, nie jako narzędzie do powtarzania.

## Strażnik

`apps/api/src/test/routing-alertow.spec.ts` — 31 asercji w trzech grupach:

1. **Reguły mają jeden dom i ten dom powiadamia** — wszystkie trzynaście tytułów obecnych
   (lista wpisana wprost, bo plik źródłowy już nie istnieje: przeniesienie, które gubi regułę,
   jest gorsze od braku przeniesienia, bo wygląda na zrobione), pięć krytycznych zachowało
   `severity`, każda reguła ma etykietę, kanarek od kopii ma `noDataState: Alerting` i
   `for: 30m`, a użyte `datasourceUid` istnieje w `datasources.yml`.
2. **Droga od reguły do człowieka kończy się adresem** — odbiorca z polityki istnieje wśród
   punktów kontaktowych (literówka w nazwie jest cicha: Grafana przyjmuje politykę i nic nie
   wysyła), a punkt kontaktowy ma niepusty adres z małpą.
3. **Nie ma drugiego domu** — `prometheus.yml` bez `rule_files`, `alerts.yml` nie istnieje,
   compose nie montuje nieistniejącego pliku (Docker przy nieistniejącym źródle bind-mounta
   tworzy pusty **katalog** i startuje bez słowa skargi), katalog provisioningu Grafany jest
   naprawdę podmontowany, a gdyby `rule_files` kiedyś wróciło — musi wrócić razem z sekcją
   `alerting:` i usługą `alertmanager` w compose.

**Czerwieni się na starym kodzie: 26 z 31.** Pięć asercji przechodziło i przed poprawką —
te o punkcie kontaktowym i polityce, bo ta połowa mechanizmu naprawdę była w porządku.
Strażnik, który czerwieni się cały, zwykle sprawdza własną tezę zamiast kodu; ten rozróżnia.

## Czego to NIE dowodzi

Nie dowodzi, że **mail dochodzi**. Dowodzi rzeczy słabszej i sprawdzalnej w CI: że każda
reguła ma zdefiniowaną drogę do człowieka i że ta droga kończy się adresem, a nie w połowie.

Dowód, że list dochodzi, jest poziomu **D3** — wymaga zapalonego alertu na produkcji i maila
w skrzynce, z datą. Nie ma go i jest to dopisane jako otwarty punkt w
`docs/ops/GRAFANA_ALERTING.md` §3. Najtaniej sprawdzić na `VerrisSecurityWatchStale`:
zatrzymać timer na dwadzieścia minut i obejrzeć skrzynkę.

Uznanie tej pozycji za zamkniętą na podstawie samego provisioningu byłoby rozumowaniem
zakazanym w tym projekcie: mamy mechanizm, więc uznajmy, że mamy wynik.

## Czego to nie obejmuje

- **Eskalacji i dyżurów** — jeden odbiorca, jeden adres. Przy jednoosobowym zespole to jest
  właściwa wielkość; Opsgenie/PagerDuty to inna rozmowa i inny moment.
- **Slacka** — przygotowany w dokumencie, wyłączony do czasu, aż będzie kanał.
- **Wyciszeń (silences)** — Grafana ma je w UI; nie są provisionowane i nie muszą być.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `H-23` | to jest odpowiedź na pytanie „dlaczego nikt się nie dowiedział" |
| `H-20` | ta sama reguła D4: procedura bez dowodu wykonania nie liczy się wcale |
| `X-23` | ta sama klasa: alarm, który nie zatrzymuje, przestaje być czytany |
| `X-14` | ta sama klasa: kontrola, która liczy i nie sprawdza |

## Dowód po

- `ops/observability/grafana/provisioning/alerting/rules.yaml` — 13 reguł, 2 grupy
- `ops/observability/grafana/provisioning/datasources/datasources.yml` — `uid: Prometheus`
- `ops/observability/prometheus.yml` — bez `rule_files`, z opisem dlaczego
- `docker-compose.prod.yml` — bez montowania usuniętego pliku
- `ops/observability/grafana/migracja-regul-do-grafany.py` — zapis, jak powstał wynik
- `apps/api/src/test/routing-alertow.spec.ts` — 31 asercji, 26 czerwonych na starym kodzie
- `docs/ops/GRAFANA_ALERTING.md`, `docs/SPRINT_C_OPS.md` — zaktualizowane

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**Stan w macierzy po:** `DZIAŁA` / `PARYTET` — z jawnym zastrzeżeniem, że dostarczalność
maila to osobny, otwarty punkt poziomu D3.
