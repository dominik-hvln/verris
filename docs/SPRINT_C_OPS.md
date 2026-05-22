# Sprint C — operacje produkcyjne

> Cel: `PROD_HEALTH_CHECKLIST.md` bez ❌ w sekcjach 1–12 przed pełnym GO klientów zewnętrznych.

## Architektura storage (ustalona)

| Warstwa | Co trafia | Gdzie |
|---------|-----------|--------|
| **Pliki aplikacji** | Załączniki ticketów, eksporty RODO, DPA, faktury | MinIO — buckety `verris-*` (jak w `.env.prod`) |
| **Backup Postgres** | `pg_dump` gzip | MinIO — `verris-backups/postgres/verris-*.sql.gz` + `latest.sql.gz` |
| **Faza 2 (zewnętrzny)** | Mirror całego bucketu backupów (+ ewent. całego MinIO volume) | `ops/backup-mirror-external.sh` |

Lokalny `/var/backups/verris` nie jest już docelowym storage — tylko krótki **staging** (`/tmp/verris-backup-staging`) przed uploadem.

## 1. Backup Postgres → MinIO

Skrypt: `ops/backup-postgres.sh` (upload domyślnie `UPLOAD_TO_MINIO=1`).

```bash
cd /opt/verris
set -a && source .env.prod && set +a
./ops/backup-postgres.sh
```

Weryfikacja:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --no-deps \
  --entrypoint /bin/sh minio-bootstrap -c '
  mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc ls verris/verris-backups/postgres/
'
```

Restore z MinIO:

```bash
./ops/restore-postgres.sh --from-minio latest.sql.gz --confirm
# lub konkretny plik: --from-minio verris-2026-05-22-0317.sql.gz --confirm
```

## 2. Cron na hoście

```bash
sudo install -m 0644 /opt/verris/ops/cron/verris-backup.cron /etc/cron.d/verris-backup
```

Cron ładuje `.env.prod` (MinIO credentials). Log: `/var/log/verris-backup.log`.

## 3. Zewnętrzny serwer (faza 2)

`ops/backup-mirror-external.sh` — `mc mirror` z `verris/verris-backups` na drugi endpoint.

```bash
# /etc/default/verris-backup
MIRROR_EXTERNAL_ENABLED=1
OFFSITE_MC_ALIAS_URL=https://backup.twojadomena.pl
OFFSITE_MC_ACCESS_KEY=...
OFFSITE_MC_SECRET_KEY=...
OFFSITE_MC_BUCKET=verris-backups
```

Cron np. 30 min po backupie DB.

## 4. Alerty Prometheus + Grafana

Reguły: `ops/observability/prometheus/alerts.yml`. Contact point w Grafana — Slack/email.

## 5. `.env.prod` — checklist

- `S3_BUCKET_BACKUPS=verris-backups` (opcjonalnie, domyślnie tak)
- `MINIO_ROOT_*`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `REDIS_URL`, SMTP, Stripe, `METRICS_AUTH_TOKEN`

## 6. Kryterium DONE Sprint C

- [ ] Cron backup + wpis w logu + obiekt w `verris-backups/postgres/`
- [ ] Restore test ze staging (`--from-minio`) — udokumentowany
- [ ] (Faza 2) Mirror na zewnętrzny serwer włączony
- [ ] Grafana contact point
- [ ] `PROD_HEALTH_CHECKLIST.md` sekcje 1–12 wypełnione

Powiązane: [`DEPLOY.md`](../DEPLOY.md) (MinIO), [`PROD_HEALTH_CHECKLIST.md`](../PROD_HEALTH_CHECKLIST.md).
