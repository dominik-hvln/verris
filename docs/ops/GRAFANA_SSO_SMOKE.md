# Grafana SSO — smoke (bez węzła)

> **Cel:** `forward_auth` (Caddy → API `/auth/grafana-validate`, ciasteczko `grafana_session`) + SSO z paneli admin/staff przez jednorazowy bilet.

## Automatyczny smoke

```bash
cd /opt/verris
bash ops/scripts/prod-smoke-grafana-bok.sh
```

Sprawdza: Grafana publiczna bez sesji, validate 401, route `/grafana/sso`, metryki HTTP w `/metrics`.

## Ręczny smoke (pełny SSO)

1. Zaloguj się do **admin.verris.pl** (konto `ADMIN`) lub **staff.verris.pl** (`STAFF` + `canAccessGrafana=true` w Operatorzy).
2. Wejdź w **Monitoring** → link do Grafany (lub `/grafana/sso`).
3. Oczekiwane: dashboard Grafana bez formularza loginu, u góry email użytkownika.
4. Staff bez flagi `canAccessGrafana` → **403** / brak dostępu.

## Troubleshooting

| Objaw | Działanie |
|-------|-----------|
| 401 na Grafanie po kliknięciu z panelu | Panel prosi API o bilet (`POST /auth/grafana-ticket`), Caddy kieruje `grafana…/verris-sso` do API (`/auth/grafana-sso`), które ustawia host-only `grafana_session` (8 h). Sprawdź trasę `/verris-sso` w Caddyfile i ciasteczko na hoście Grafany. Ciasteczka paneli (`admin_session`/`staff_session`) są host-only i Grafana ich nie widzi. |
| 403 Forbidden | `UPDATE "User" SET "canAccessGrafana"=true WHERE email='...'` |
| Puste dashboardy | Prometheus scrape `api:3000/metrics` — `METRICS_AUTH_TOKEN` |

Powiązane: [`GRAFANA_ALERTING.md`](./GRAFANA_ALERTING.md), dashboard `verris-control-plane`.
