# Grafana alerting — prod (OPS-3)

> **Start LIVE:** e-mail **dominik@hvln.pl**  
> **Slack:** przygotowane poniżej, włączyć gdy będzie kanał (decyzja D-5).

Reguły Prometheus: `ops/observability/prometheus/alerts.yml`  
Dashboardy: folder `Verris` w Grafana.

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

### Reguły do podpięcia (min. zestaw LIVE)

| Alert (z `alerts.yml`) | Priorytet |
|------------------------|-----------|
| `VerrisPostgresBackupStale` | P0 |
| `VerrisOpenMajorIncident` | P0 |
| `VerrisStaleComputeHeartbeat` | P0 |
| `VerrisProvisioningQueueFailed` | P1 |
| `VerrisStatusWebhookFailed` | P1 |
| `VerrisMigrationJobsFailed` | P1 |

W Grafana: **Alerting → Alert rules → Import** lub ręcznie odzwierciedlić progi z pliku YAML (Unified Alerting).

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

- [ ] Test alertu (np. ręcznie obniżyć próg backupu na staging lub `amtool` silence test)
- [ ] Wpis w [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md): OPS-3 → ✅
- [ ] `PROD_HEALTH_CHECKLIST.md` §9 — „Email alert channel skonfigurowany” → ✅

Kontakt eskalacji: dominik@hvln.pl
