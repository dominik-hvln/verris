# Grafana alerting — prod (OPS-3)

> **Start LIVE:** e-mail **dominik@hvln.pl**  
> **Slack:** przygotowane poniżej, włączyć gdy będzie kanał (decyzja D-5).

Reguły alertowe: `ops/observability/grafana/provisioning/alerting/rules.yaml`  
Dashboardy: folder `Verris` w Grafana.

> **Zmiana z 2026-08-22 (X-28).** Reguły stały wcześniej w
> `ops/observability/prometheus/alerts.yml`. Prometheus je liczył i pokazywał
> u siebie — i na tym się kończyło: nigdzie w repozytorium nie było
> Alertmanagera, a `prometheus.yml` nie miał sekcji `alerting:`. Trzynaście
> reguł, pięć z `severity: critical`, nie miało DOKĄD trafić. Kopia bazy nie
> wykonała się ani razu przez miesiąc; `VerrisPostgresBackupStale` zapaliło się
> poprawnie i nie dotarło do nikogo.
>
> Ten dokument był częścią problemu: w §1 kazał „ręcznie odzwierciedlić progi
> z pliku YAML" i nikt tego nie zrobił. Instrukcja ręcznego przepisania progów
> jest opisem długu, nie procedurą — dlatego zniknęła.
>
> Reguły są teraz provisionowane z repo razem z punktem kontaktowym i polityką.
> Jeden dom, nie dwa: `alerts.yml` został usunięty, `rule_files` wycięte
> z `prometheus.yml`. Pilnuje tego `apps/api/src/test/routing-alertow.spec.ts`.

---

## 1. Contact point — e-mail (wymagane na start)

**Provisioning (repo):** po deploy z `live-release-readiness` Grafana ładuje automatycznie:

- `ops/observability/grafana/provisioning/alerting/contactpoints.yaml` → `verris-ops-email` → `dominik@hvln.pl`
- `ops/observability/grafana/provisioning/alerting/policies.yaml` → domyślna polityka (repeat 4h)

Wymaga **GF_SMTP_*** na serwisie `grafana` w `docker-compose.prod.yml` (relay na Postfix, jak API).

**Ważne:** `GF_SMTP_HOST` musi być w formacie **`host:port`** (np. `host.docker.internal:25`). Grafana **nie** łączy osobno `SMTP_HOST` + `SMTP_PORT` jak API — błąd `missing port in address` oznacza brak `:25` w `GF_SMTP_HOST`. Opcjonalnie w `.env.prod`: `GRAFANA_SMTP_HOST=host.docker.internal:25`.

### Test OK w UI, brak maila w skrzynce

1. **Postfix na panelu** — `/var/log/mail.log`: szukaj `to=<dominik@hvln.pl>` i `status=sent`. Jeśli jest `relay=mail.hvln.pl` + `250 Ok: queued`, wiadomość **opuściła** Verris; dalsza ścieżka to **mail.hvln.pl** (spam/kolejka/reguły).
2. **Grafana** często wysyła **pusty `Message-ID`** — na hoście ustaw `postconf -e always_add_missing_headers=yes` i `systemctl reload postfix`.
3. Sprawdź **spam** i filtry na **hvln.pl**; w logach MX szukaj ID z Postfix (np. `queued as B05742F20644`).
4. Test porównawczy z hosta: temat `[Verris] OPS-3 plain test` — jeśli dojdzie, a test Grafana nie, winny jest szablon/HTML alertu (duży HTML ~30 KB).

Ręcznie (jeśli provisioning nie załadował się):

1. Zaloguj się do Grafana (admin/staff → link SSO lub `https://grafana.verris.pl`).
2. **Alerting → Contact points → New contact point**
   - Name: `verris-ops-email`
   - Integration: **Email**
   - Addresses: `dominik@hvln.pl`
   - (Opcjonalnie) Subject template: `[Verris {{ .CommonLabels.alertname }}] {{ .CommonAnnotations.summary }}`
3. **Test** — wyślij test; sprawdź skrzynkę i spam.
4. **Notification policies → Default policy** (lub nowa gałąź `verris-*`):
   - Contact point: `verris-ops-email`
   - Group by: `alertname`, `severity`
   - Repeat interval: 4h (dostosuj)

### Reguły — nie podpina się ich ręcznie

Wszystkie trzynaście reguł ładuje się z repo przy starcie Grafany:
`ops/observability/grafana/provisioning/alerting/rules.yaml`. Nic nie trzeba
klikać ani przepisywać. Zmiana progu = zmiana w tym pliku + deploy.

Priorytety operacyjne (do dyżuru, nie do konfiguracji):

| Alert | Priorytet |
|-------|-----------|
| `VerrisPostgresBackupStale` | P0 |
| `VerrisOpenMajorIncident` | P0 |
| `VerrisStaleComputeHeartbeat` | P0 |
| `VerrisProvisioningQueueFailed` | P1 |
| `VerrisStatusWebhookFailed` | P1 |
| `VerrisMigrationJobsFailed` | P1 |

**Jedna reguła zachowuje się inaczej od pozostałych.**
`VerrisPostgresBackupStale` ma `noDataState: Alerting`. Reszta ma `OK`, bo
prometheusowe wyrażenie z porównaniem zwraca pusty wynik, gdy jest dobrze —
brak serii znaczy tam „warunek niespełniony". Dla kopii bazy „metryka
zniknęła" i „kopia jest świeża" wyglądałyby identycznie, a to jest dokładnie
ten przypadek, który kosztował nas miesiąc bez kopii. `for: 30m` sprawia, że
zwykły restart API nie zapali alarmu.

**Ręczne dopisywanie reguł w UI Grafany nie ma sensu** — provisioning nadpisuje
je przy każdym starcie. Reguła dopisana w UI zniknie po pierwszym deployu i
nikt nie zauważy, kiedy przestała działać.

---

## 2. Contact point — Slack (opcjonalnie, później)

Gdy będzie webhook Slacka:

1. Slack → App **Incoming Webhooks** → kanał `#verris-alerts` (lub inny).
2. Grafana → **Contact points → New → Slack**
   - Webhook URL: `https://hooks.slack.com/services/...`
   - Username: `Verris Alerts`
3. W **Notification policies** dodaj matcher np. `channel=slack` albo przenieś wybrane alerty na drugi contact point.
4. Env (opcjonalnie, jeśli kiedyś provisioning as code): `GRAFANA_SLACK_WEBHOOK_URL` — **nie commitować URL**.

Do czasu włączenia Slacka wszystkie alerty → tylko e-mail.

---

## 3. Po konfiguracji

- [ ] **Dowód D3, którego wciąż nie ma:** jeden alert faktycznie zapalony na
      produkcji i jeden mail w skrzynce, z datą. Provisioning i testy dowodzą,
      że droga jest ZDEFINIOWANA — nie że list dochodzi. Najtaniej sprawdzić to
      na `VerrisSecurityWatchStale`: zatrzymać timer na 20 minut i obejrzeć
      skrzynkę. Dopóki tego nie ma, „alerty działają" jest założeniem.
- [ ] Test alertu (np. ręcznie obniżyć próg backupu na staging)
- [ ] Wpis w [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md): OPS-3 → ✅
- [ ] `PROD_HEALTH_CHECKLIST.md` §9 — „Email alert channel skonfigurowany” → ✅

Kontakt eskalacji: dominik@hvln.pl
