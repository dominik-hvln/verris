# Restore test Postgres z MinIO (OPS-2 / C.4)

> **Cel:** potwierdzić, że backup w `verris-backups/postgres/` da się odtworzyć.  
> **Środowisko (2026-05-24):** jeden serwer pre-LIVE (`204.168.174.138`) — **bez osobnego stagingu**; przed startem LIVE 100% serwer zostanie zresetowany.  
> **Kontakt:** dominik@hvln.pl

---

## Tryb A — drill bez niszczenia `verris_db` (zalecany teraz)

Skrypt przywraca dump do **tymczasowej** bazy `verris_restore_drill` i usuwa ją po teście.

```bash
cd /opt/verris
set -a && source .env.prod && set +a

# Weryfikacja obiektu w MinIO
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --no-deps \
  --entrypoint /bin/sh minio-bootstrap -c '
  mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc ls verris/verris-backups/postgres/
  mc stat verris/verris-backups/postgres/latest.sql.gz
'

# Drill (nie dotyka verris_db)
./ops/scripts/restore-drill-isolated.sh --owner "Imię Nazwisko"
```

`chmod +x` zniknął stąd przy `X-26`. Był obejściem: skrypt miał w gicie tryb
644, więc po świeżym `git clone` to polecenie kończyło się „Permission denied".
Dziś wszystkie skrypty w repozytorium mają bit wykonywalności, a pilnuje tego
test `apps/api/src/test/skrypty-wykonywalne.spec.ts`.

`--owner` jest OBOWIĄZKOWY od `H-20`: bez właściciela zapis próby nie spełnia
poziomu dowodu D4 i nie zdejmuje blokady startu sprzedaży.

Oczekiwany koniec: `RESTORE DRILL OK` + liczby wierszy powyżej progów. Skrypt
przerywa, jeżeli odtworzona baza jest pusta — sam kod wyjścia `psql` tego nie
wychwytywał.

Opcje:

- `--object nazwa.sql.gz` — inny plik z MinIO niż `latest.sql.gz`
- `--keep-db` — zostaw `verris_restore_drill` do ręcznej inspekcji

---

## Tryb B — pełny restore na `verris_db` (tylko przed resetem LIVE)

**Nie uruchamiaj** na serwerze z prawdziwymi klientami. Na obecnym hoście pre-LIVE — **tylko tuż przed** planowanym resetem / czystą instalacją LIVE.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop api client-panel staff-panel admin-panel
./ops/restore-postgres.sh --from-minio latest.sql.gz --confirm
bash ops/scripts/prod-migrate-deploy.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api client-panel
curl -sf http://127.0.0.1:3000/healthz
```

---

## Po teście (Tryb A wystarczy dla OPS-2 na pre-LIVE)

Wpisz w `PROD_HEALTH_CHECKLIST.md` §7 i `HOSTING_LAUNCH_TASKS.md` (OPS-2):

| Pomiar | Wartość |
|--------|---------|
| Restore drill (last) | data + `latest.sql.gz` + `verris_restore_drill` |
| Serwer | pre-LIVE (ten sam co prod docelowo) |
| Status | ✅ |

---

## Rollback

- Tryb A: nie wymaga rollbacku (`verris_db` nietknięty).
- Tryb B: ponowny deploy / restore z innego dumpu lub reset serwera przed LIVE.
