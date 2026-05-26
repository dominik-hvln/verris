# Grafana SSO — smoke (bez węzła)

> **Cel:** `forward_auth` (Caddy → API `/auth/grafana-validate`) + linki z paneli admin/staff.

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
| 401 na Grafanie po kliknięciu z panelu | Cookie `admin_auth_token` / `staff_auth_token` — domena `AUTH_COOKIE_DOMAIN` |
| 403 Forbidden | `UPDATE "User" SET "canAccessGrafana"=true WHERE email='...'` |
| Puste dashboardy | Prometheus scrape `api:3000/metrics` — `METRICS_AUTH_TOKEN` |

Powiązane: [`GRAFANA_ALERTING.md`](./GRAFANA_ALERTING.md), dashboard `verris-control-plane`.
