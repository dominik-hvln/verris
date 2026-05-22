# Sprint C — operacje produkcyjne

> Cel: `PROD_HEALTH_CHECKLIST.md` bez ❌ w sekcjach 1–12 przed pełnym GO klientów zewnętrznych.

## 1. Backup Postgres (on-host)

Już w repo:

| Artefakt | Opis |
|----------|------|
| `ops/backup-postgres.sh` | `pg_dump` → `verris-YYYY-MM-DD-HHMM.sql.gz` |
| `ops/restore-postgres.sh` | Restore z potwierdzeniem `--confirm` |
| `ops/cron/verris-backup.cron` | Cron 03:17 UTC → `/var/backups/verris` |

**Prod (jednorazowo):**

```bash
sudo install -m 0644 /opt/verris/ops/cron/verris-backup.cron /etc/cron.d/verris-backup
# Edytuj WORKDIR w pliku cron jeśli ścieżka ≠ /opt/verris
sudo mkdir -p /var/backups/verris
cd /opt/verris && ./ops/backup-postgres.sh
```

## 2. Off-site backup (wymagane na LIVE)

Skrypt: `ops/backup-offsite-sync.sh` — synchronizuje najnowszy dump z katalogu lokalnego do zdalnego storage (S3-compatible / rclone).

**Env (np. `/etc/default/verris-backup`):**

```bash
BACKUP_DIR=/var/backups/verris
OFFSITE_ENABLED=1
# Opcja A — rclone (zalecane, dowolny backend)
RCLONE_REMOTE=verris-backups
# Opcja B — aws cli
# AWS_S3_BUCKET=s3://twoj-bucket/verris-db/
```

**Cron po lokalnym backupie (np. 03:25 UTC):**

```bash
25 3 * * * root cd /opt/verris && OFFSITE_ENABLED=1 ./ops/backup-offsite-sync.sh >> /var/log/verris-backup-offsite.log 2>&1
```

## 3. Restore test (staging lub prod izolowany)

Co kwartał / przed GO:

1. Pobierz najnowszy `verris-*.sql.gz` z off-site.
2. Na **staging** (nie prod!): `docker compose down api client-panel staff-panel admin-panel`
3. `./ops/restore-postgres.sh /path/to/verris-....sql.gz --confirm`
4. `docker compose up -d` + smoke: login klienta, 1 ticket, healthz.

Zapisz datę i wynik w `PROD_HEALTH_CHECKLIST.md` § backup.

## 4. Alerty Prometheus + Grafana

| Krok | Akcja |
|------|--------|
| Reguły | `ops/observability/prometheus/alerts.yml` (provisioning, heartbeat, incydenty, webhooki, migracje) |
| Mount | `docker-compose.prod.yml` — volume `alerts.yml` (już w diffie Sprint C) |
| Reload | `docker compose up -d prometheus` lub `curl -X POST http://localhost:9090/-/reload` (lifecycle włączone) |
| Grafana | Alerting → Contact points (Slack/email) → powiąż z Prometheus datasource |
| Weryfikacja | W Prometheus UI → Alerts: reguły `Verris*` w stanie Pending/Inactive (OK) |

Metryki biznesowe: `GET /metrics` na API (token `METRICS_AUTH_TOKEN`).

## 5. `.env.prod` — checklist nowych kluczy

Upewnij się, że są ustawione (zgodnie ze środowiskiem live/test):

- `STATUS_WEBHOOK_*` / public badge URL
- `REDIS_URL` (kolejka provisioningu async)
- MinIO / załączniki ticketów
- SMTP (zaproszenia IAM, tickety)
- `METRICS_AUTH_TOKEN`, `GF_SECURITY_ADMIN_PASSWORD`, `GRAFANA_DB_RO_PASSWORD`
- Stripe live vs test + webhook secret

## 6. Migracje DB

```bash
cd /opt/verris && bash ops/scripts/prod-migrate-deploy.sh
```

Na czystej bazie i na kopii prod-like — oba przebiegi bez błędu.

## 7. Kryterium DONE Sprint C

- [ ] Cron backup + log `/var/log/verris-backup.log` bez błędów 7 dni
- [ ] Off-site sync OK (plik widoczny poza serwerem prod)
- [ ] Restore test udokumentowany (data, środowisko, wynik)
- [ ] Prometheus ładuje `alerts.yml`; co najmniej 1 contact point w Grafana
- [ ] `PROD_HEALTH_CHECKLIST.md` wypełniony po smoke na prod

Powiązane: [`PROD_HEALTH_CHECKLIST.md`](../PROD_HEALTH_CHECKLIST.md), [`LIVE_READINESS_PLAN.md`](../LIVE_READINESS_PLAN.md).
