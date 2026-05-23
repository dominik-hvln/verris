# Restore test Postgres z MinIO (C.4)

> **Cel:** potwierdzić, że backup w `verris-backups/postgres/` da się odtworzyć.  
> **Gdzie:** staging / osobna maszyna — **nie** na produkcyjnej bazie z klientami bez okna maintenance.  
> **Kontakt / eskalacja (wynik testu, problemy):** dominik@hvln.pl

## Wymagania

- Ten sam stack co prod (`docker-compose.prod.yml`) lub klon węzła
- `.env.prod` z credentials MinIO
- Ostatni obiekt `verris-backups/postgres/latest.sql.gz` istnieje

## Procedura (staging)

```bash
cd /opt/verris   # lub katalog staging
set -a && source .env.prod && set +a

# 1. Zatrzymaj API (opcjonalnie, zalecane)
docker compose -f docker-compose.prod.yml --env-file .env.prod stop api client-panel staff-panel admin-panel

# 2. Restore (interaktywnie wymaga --confirm)
./ops/restore-postgres.sh --from-minio latest.sql.gz --confirm

# 3. Migracje (jeśli dump starszy niż HEAD)
bash ops/scripts/prod-migrate-deploy.sh

# 4. Smoke
curl -sf http://127.0.0.1:3000/healthz
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) FROM \"User\";"

# 5. Uruchom panele
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api client-panel
```

## Weryfikacja MinIO przed restore

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --no-deps \
  --entrypoint /bin/sh minio-bootstrap -c '
  mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc ls verris/verris-backups/postgres/
  mc stat verris/verris-backups/postgres/latest.sql.gz
'
```

## Po teście

Wpisz w `PROD_HEALTH_CHECKLIST.md` §7:

| Pomiar | Wartość |
|--------|---------|
| Restore test (last) | data + `latest.sql.gz` + środowisko (staging) |
| Status | ✅ |

## Rollback

Jeśli restore na staging się nie powiódł — zostaw notatkę w issue; prod **nie** dotykaj do czasu analizy logów `/var/log/verris-backup.log` i `mc ls`.
