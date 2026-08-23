# `X-31` — Cisza, która znaczy dwie różne rzeczy

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | ŚREDNI |
| **Nakład** | S (~1 h) |
| **Zależy od** | `X-28`, `X-30` |
| **Status** | zamknięte w kodzie, **D3 po pierwszym mailu** |
| **Data** | 2026-08-23 |
| **Decyzja** | właściciel produktu wybrał wariant „jeden mail na dobę" |

---

## Problem

Po naprawie `X-30` alerty ucichną. Cisza będzie znaczyła „nic się nie pali".

Będzie też wyglądała **identycznie** jak:

- Grafana padła,
- Postfix na panelu przestał przyjmować,
- `mail.hvln.pl` zaczął odrzucać albo wrzucać do spamu,
- ktoś zmienił adres w punkcie kontaktowym,
- polityka powiadomień przestała pasować do etykiet.

To jest **dokładnie ta sama cisza**, która przez ponad miesiąc znaczyła „kopia bazy jest
w porządku" (`H-23`). Wtedy kosztowała nas wszystkie kopie zapasowe.

## Rozwiązanie

`VerrisKanalAlertowZyje` — reguła, która **pali się zawsze** i której **brak** jest sygnałem.

```yaml
expr: vector(1)          # stała jedynka przy każdej ewaluacji
for: 0s
noDataState: Alerting
execErrState: Alerting   # gdy Prometheus milczy — zapala się tym bardziej
labels:
  severity: info
  kanal: heartbeat
```

Nie da się jej „nie zapalić": normalnie warunek jest spełniony, a gdyby źródło danych przestało
odpowiadać, oba stany awaryjne też prowadzą do `Alerting`. Milczenie ma znaczyć awarię, nigdy
spokój.

## Jeden mail na dobę, nie sześć

Osobna gałąź polityki powiadomień:

```yaml
routes:
  - receiver: verris-ops-email
    object_matchers:
      - ['kanal', '=', 'heartbeat']
    group_wait: 0s
    group_interval: 24h
    repeat_interval: 24h
```

Na domyślnej polityce (`repeat_interval: 4h`) byłoby ich sześć dziennie. **Alert przychodzący
sześć razy dziennie przestaje być czytany po tygodniu** — a wtedy przestaje cokolwiek dawać, bo
jego brak jest jedyną informacją, jaką niesie.

`continue` zostaje domyślnie fałszem, więc heartbeat nie idzie dodatkowo przez politykę domyślną.
Strażnik pilnuje osobno, że sama polityka domyślna **nie** została przy okazji przestawiona na
dobę: prawdziwy alarm ma się przypominać co cztery godziny.

## Haczyk, który trzeba nazwać

**Mail, którego się nie czyta, wraca do punktu wyjścia.** Jeśli po tygodniu ten jeden dziennie
przestanie być zauważany, reguła przestaje działać — nie dlatego, że jest zepsuta, tylko dlatego,
że przestała być czytana. To jest realne ograniczenie tego rozwiązania i nie da się go naprawić
kodem.

## Czego to nie obejmuje

- **Awarii całego serwera.** Heartbeat mieszka na tej samej maszynie co Grafana; gdy zginie host,
  milczy razem z resztą. Odporny byłby watchdog **spoza** naszej infrastruktury (typu
  healthchecks.io, pukany cronem z panelu) — nie ma go i to świadoma decyzja, nie przeoczenie.
- **Poprawności pozostałych reguł.** Dowodzi wyłącznie, że droga Grafana → SMTP → skrzynka jest
  drożna. Że reguły się *liczą*, pilnuje bramka z `X-30`.

## Skąd wiadomo, że droga w ogóle działa

Z awarii `X-30`, tego samego dnia. Reguły miały `execErrState: Alerting`, źródło danych się nie
rozwiązywało, więc błąd ewaluacji zapalił alarmy i **dziesięć maili dotarło** na
`dominik@hvln.pl` z tematami `[FIRING:1] <alertname> <severity> (Verris)`.

Ten przypadek potwierdził przy okazji rzecz, której planowany test jednego alertu **nie**
potwierdziłby: zapaliło się dziesięć reguł z trzynastu, a nie zapaliły się dokładnie te trzy
z najdłuższym `for:` — `VerrisPostgresBackupStale` (30 m), `VerrisStatusWebhookFailed` (30 m)
i `VerrisSecurityWatchStale` (20 m) — bo od restartu nie minęło jeszcze tyle czasu. Skrypt
migracyjny mógł te wartości po cichu przekręcić i żaden test w CI by tego nie zobaczył.
**Zobaczyła to skrzynka.**

## Strażnik

Dopisane do `apps/api/src/test/routing-alertow.spec.ts` (36 asercji łącznie, 5 dotyczy `X-31`):
reguła pali się zawsze (`vector(1)`, oba stany awaryjne na `Alerting`, `for: 0s`), ma etykietę
`kanal: heartbeat`, idzie osobną gałęzią z `repeat_interval: 24h`, a polityka domyślna **nie**
została przestawiona na dobę.

Doszła też lista `DOPISANE_POZNIEJ`, trzymana osobno od `ALERTY`. Tamta odpowiada na pytanie
„czy migracja czegoś nie zgubiła" i ma zostać zamrożona; ta na „czy ktoś czegoś po cichu nie
dołożył". Nowa reguła musi trafić na listę świadomie, a nie prześlizgnąć się przy okazji.

**Czerwieni się na starym kodzie: 5 z 36.**

## Dowód po

- `ops/observability/grafana/provisioning/alerting/rules.yaml` — grupa `verris_kanal_alertow`
- `ops/observability/grafana/provisioning/alerting/policies.yaml` — gałąź `kanal: heartbeat`
- `apps/api/src/test/routing-alertow.spec.ts` — 5 asercji `X-31`
- `docs/ops/GRAFANA_ALERTING.md` §4

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**D3 powstanie przy pierwszym mailu** `[FIRING:1] VerrisKanalAlertowZyje info (Verris)`.

**Stan w macierzy po:** `CZĘŚCIOWE` / `CZĘŚCIOWY` — do pierwszego maila.
