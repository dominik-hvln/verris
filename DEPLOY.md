# Deploy Verris (control-plane)

Ten dokument opisuje uruchomienie panelu, API i bazy danych na **dedykowanym serwerze** (control-plane). Węzły obliczeniowe (z DA + CloudLinux LVE + LiteSpeed) konfigurujesz osobno przez panel admina.

Przed pierwszym deployem i przed każdym go-live przejdź checklistę: [GO_NO_GO_PROD.md](./GO_NO_GO_PROD.md).

## Wymagania na maszynie control-plane

- Linux (Ubuntu 22.04 / Debian 12 lub nowsze)
- Docker Engine 24+ i Docker Compose v2
- Port 80 i 443 dostępne z internetu (do TLS i Stripe webhook)
- DNS: rekordy A dla `panel.`*, `staff.`*, `admin.*`, `api.*` i `status.*` skierowane na ten host (ostatni dla publicznej strony statusu)

## Pierwsze uruchomienie

```bash
# 1) Sklonuj repo
git clone <repo> /opt/verris && cd /opt/verris

# 2) Skopiuj i uzupełnij konfigurację produkcyjną
cp .env.prod.example .env.prod
# wypełnij: hasło DB, JWT_SECRET, APP_KMS_KEY, STRIPE_*, domeny

# 3) Edytuj ops/Caddyfile (e-mail admina, ewentualnie ograniczenia IP dla staff/admin)

# 4) Zbuduj i wystartuj cały stack
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 5) Zaaplikuj schemat DB przez migrate deploy (idempotentnie, produkcyjnie bezpieczne)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec api npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
# UWAGA: nie używamy już `prisma db push` w produkcji — od pierwszej migracji `0_init`
# wszystkie zmiany schematu idą przez `prisma migrate deploy` (patrz sekcja „Migracje DB").

# 6) Wczytaj seed (admin@verris.pl + staff@verris.pl + plany + cennik autoskalowania)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -e SEED_ADMIN_PASSWORD='<silne_hasło_admina>' \
       -e SEED_STAFF_PASSWORD='<inne_silne_hasło_staff>' \
       api \
  node -e "require('child_process').execSync('npx --yes ts-node libs/database/prisma/seed.ts', { stdio: 'inherit' })"
```

Po starcie sprawdź:

- `https://api.verris.pl/healthz` → `{ "status": "ok" }`
- `https://api.verris.pl/readyz` → `{ "status": "ok", "database": "up" }`
- `https://admin.verris.pl/login` → ekran logowania administratora
- `https://status.verris.pl` → publiczna strona statusu (powinna pokazać „Brak skonfigurowanych probes” jeśli żadna jeszcze nie istnieje)

## Sekrety – minimum produkcyjne

Wartości muszą być wygenerowane raz i przechowywane bezpiecznie (np. wbudowane sekrety hostingu / Vault):


| Zmienna                 | Co ustawić                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| `JWT_SECRET`            | `openssl rand -base64 48` — minimum 32 znaki                               |
| `APP_KMS_KEY`           | `openssl rand -base64 48` — szyfruje hasła DA, niezmienialny po wdrożeniu  |
| `POSTGRES_PASSWORD`     | losowe ≥ 24 znaki                                                          |
| `STRIPE_SECRET_KEY`     | klucz ze Stripe (live)                                                     |
| `STRIPE_WEBHOOK_SECRET` | sekret z Stripe (po skonfigurowaniu webhooka na `/billing/stripe/webhook`) |


> W Stripe Dashboard przypisz do tego endpointu m.in. `**checkout.session.completed**`, zdarzenia `**invoice.***`, `**customer.subscription.***` oraz — dla auto-doładowania portfela (**C-9**) — `**payment_intent.succeeded`** i `**payment_intent.payment_failed**`.

> **Uwaga**: rotacja `APP_KMS_KEY` wymaga ponownego zaszyfrowania wszystkich sekretów (DA passwords, 2FA secrets, recovery codes). Procedura krok-po-kroku znajduje się w sekcji [Rotacja `APP_KMS_KEY](#rotacja-app_kms_key)` poniżej.

## Węzły obliczeniowe: CloudLinux, LiteSpeed i bootstrap

Docelowy serwer musi być **CloudLinux** z narzędziami LVE (co najmniej `cloudlinux-statistic` lub `lveinfo`) oraz **LiteSpeed Web Server** z **LSPHP**. Agent telemetryczny wysyłany do control-plane opiera się na tych narzędziach; bez nich bootstrap dokończy handshake, ale agent zakończy się błędem przy pierwszym uruchomieniu.

Skrypt generowany w panelu admina:

- jeśli nie ma `/usr/local/lsws/bin/lswsctrl`, uruchamia oficjalny instalator [get.litespeed.sh](https://get.litespeed.sh) z numerem licencji ze zmiennej `LITESPEED_SERIAL_NO`;
- sprawdza obecność binariów **LSPHP** w `/usr/local/lsws/lsphp*/bin/lsphp`;
- startuje LSWS i weryfikuje działanie usługi oraz nasłuch **WebAdmin na porcie 7080**;
- opcjonalnie, gdy ustawisz `LSWS_WEBADMIN_ALLOW_IP`, podmienia `<allow>` w `admin/conf/admin_config.xml` i restartuje LSWS (ograniczenie dostępu do konsoli administracyjnej).

Materiały referencyjne: [CloudLinux — instalacja / LVE](https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_installation/), [LiteSpeed Web Server](https://docs.litespeedtech.com/lsws/).

### Zmienne środowiskowe na węźle (nie w `.env.prod` control-plane)

Ustaw je w sesji **root na serwerze węzła** przed uruchomieniem wklejonego skryptu (np. `export …`), albo wklej na początek skryptu dwa wiersze `export`.

| Zmienna                   | Wymagana | Opis |
| ------------------------- | -------- | ---- |
| `LITESPEED_SERIAL_NO`     | Tak, gdy na hoście **nie** ma jeszcze LiteSpeed | Numer licencji przekazywany do instalatora. Gdy `lswsctrl` już istnieje, krok instalacji jest pomijany. |
| `LSWS_WEBADMIN_ALLOW_IP`  | Nie      | Wartość trafiająca do `<allow>` w konfiguracji WebAdmin (np. pojedyncze IP biura lub CIDR). Zawsze dociągnij też firewall poza LSWS. |
| `PUBLIC_IP`               | Nie      | Publiczny adres węzła; jeśli pusty, skrypt próbuje go wykryć (`ipify`, `checkip.amazonaws.com`, `hostname -I`). |

### Limity LVE w planach (EP i NPROC)

W bazie i API pola planu oraz konta hostingowego to **`entryProcesses`** (CloudLinux **EP** — Entry Processes) oraz **`nprocLimit`** (**NPROC** — limit procesów). Przy synchronizacji z DirectAdmin używane są parametry `ep` i `nproc`. API przy tworzeniu/aktualizacji planu wymaga **NPROC > EP + 15**, zgodnie z zaleceniami CloudLinux dla spójnych limitów LVE.

### Pierwszy węzeł — kroki w panelu

1. Zaloguj się do panelu admina i otwórz „Węzły & serwery → Dodaj nowy węzeł”.
2. Wpisz nazwę i wygeneruj skrypt bootstrap.
3. Na węźle ustaw `LITESPEED_SERIAL_NO` (i opcjonalnie `LSWS_WEBADMIN_ALLOW_IP`), potem uruchom skrypt jako root.
4. Skrypt zgłosi się do panelu — w sekcji „Czeka na akceptację” kliknij „Zaakceptuj”.
5. Skonfiguruj DirectAdmin (host/port/login/login-key) i uruchom test połączenia.

### Checklist po bootstrapie (operator)

- [ ] `/usr/local/lsws/bin/lswsctrl status` — usługa w stanie działającym; vhosty odpowiadają po HTTP/S.
- [ ] Pod `/usr/local/lsws/lsphp*` istnieje działający `lsphp` (wersja zgodna z polityką hostingu).
- [ ] Dostęp do WebAdmin (`https://<węzeł>:7080`) jest ograniczony (firewall i/lub `LSWS_WEBADMIN_ALLOW_IP`).
- [ ] `cloudlinux-statistic` lub `lveinfo` działa; w logach `/var/log/verris-agent.log` brak stałych błędów o braku narzędzi CloudLinux.
- [ ] W panelu admina węzeł zaakceptowany; sonda DA API (Status Page) przechodzi; limity kont testowego klienta w DA zgadzają się z EP/NPROC planu.

## Observability (Prometheus + Grafana)

Stack monitoringu uruchamia się razem z całym `docker-compose.prod.yml`. Po pierwszym `up -d --build`:

```bash
# 1) Ustaw mocne hasło dla read-only roli Postgresa (utworzonej przez 0_init):
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec postgres psql -U verris -d verris_db \
  -c "ALTER USER grafana_ro PASSWORD '$(openssl rand -base64 32)';"
# Zapisz to hasło w .env.prod jako GRAFANA_DB_RO_PASSWORD i zrestartuj Grafanę:
docker compose -f docker-compose.prod.yml --env-file .env.prod restart grafana

# 2) Ustaw token dla Prometheus (jeśli chcesz scrape tylko z naszego Prom):
sed -i.bak "s|^METRICS_AUTH_TOKEN=.*|METRICS_AUTH_TOKEN=$(openssl rand -hex 32)|" \
  .env.prod && rm -f .env.prod.bak
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api prometheus
```

### Co jest w stacku

- **Prometheus** (port 9090, internal) — scrapuje API `/metrics`, postgres-exporter, redis-exporter co 15 s, retencja 30 dni.
- **Grafana** (port 3000, internal, publicznie pod `grafana.verris.pl`) — `auth.proxy` mode + Caddy `forward_auth` do `/auth/grafana-validate`.
- **postgres-exporter** + **redis-exporter** — DB i Redis metryki (CPU, lag, slow queries, connections, hit ratio).
- **4 dashboardy** prowizjonowane jako kod w `ops/observability/grafana/provisioning/dashboards/json/`:
  - `01-control-plane-health` — uptime API, RAM, subscriptions per status, ostrzeżenia PAST_DUE/SUSPENDED
  - `02-compute-fleet` — serwery (status, stale heartbeat), tabela z `server_safe`, kolejka provisioningu
  - `03-cloudlinux-lve` — autoscaling events, top 10 LVE-żerców (CPU/RAM avg z `usage_metric_safe`), serie skalowania
  - `04-business` — MRR (z `subscription_safe`), top-upy, autoscaling revenue, plany × statusy, dzienne flow

### Bezpieczeństwo metryk i danych

`grafana_ro` ma `SELECT` **tylko** na `*_safe` views — passwords, tokeny i sekrety DA są niedostępne nawet przez przypadkowe nadpisanie panelu. Lista dozwolonych kolumn jest w `0_init/migration.sql` na końcu pliku.

`/metrics` jest chronione (jeśli `METRICS_AUTH_TOKEN` ustawione) bearer tokenem; w domyślnej konfiguracji Caddy nie wystawia `/metrics` publicznie (Prometheus dosięga API tylko po `verris_internal` net).

### SSO Grafany (F-15)

Dostęp do Grafany jest gatekept przez API:


| `User.role` | `User.canAccessGrafana` | Wynik                             |
| ----------- | ----------------------- | --------------------------------- |
| `ADMIN`     | (ignorowane)            | Grafana role **Admin**            |
| `STAFF`     | `true`                  | Grafana role **Editor**           |
| `STAFF`     | `false`                 | 403 (Caddy odrzuca przed Grafaną) |
| `USER`      | (cokolwiek)             | 403                               |


Włączenie dostępu STAFF-owi:

```sql
UPDATE "User" SET "canAccessGrafana" = true WHERE email = 'imie.nazwisko@verris.pl';
```

### Logi

Każdy serwis używa `json-file` driver z 10 MB × 5 plików (= 50 MB max per kontener; po przekroczeniu rotuje stare). Live tail: `docker compose ... logs -f api`. Aby przejść na Loki/Grafana Cloud — w `docker-compose.prod.yml` zamień driver `json-file` w bloku `x-logging` na `loki` i ustaw `loki-url`. Reszta stacka pozostaje bez zmian.

## Konfiguracja Status Page (probes)

Publiczna strona `https://status.verris.pl` jest pusta dopóki admin nie skonfiguruje probes per serwer. Probes są **dwuwymiarowe**:

- **Server-side** (cron co 30s w API): blackbox HTTP/HTTPS/TCP/MySQL/DA-API/DNS — wykrywa problemy z DNS, firewall, certyfikatami z punktu widzenia internetu.
- **Node-side** (`verris-probes.sh` zainstalowany przez bootstrap): lokalne `nc -z` co minutę — wykrywa problemy *na samym serwerze* nawet gdy z zewnątrz wygląda OK.

Procedura konfiguracji nowego serwera:

1. Po zaakceptowaniu węzła w panelu admina przejdź do **„Status Page → Probes (Monitory)”**.
2. Dodaj minimum dla każdego nowego węzła:
  - `HTTPS` → `https://<domena-testowa>/` (severity MAJOR, SLA 99.9%)
  - `MYSQL` → `<host-bazy>:3306` (severity MAJOR)
  - `SMTP` → `mail.<domena>:25` (severity MINOR)
  - `IMAP` → `mail.<domena>:143` (severity MINOR)
  - `DA_API` → `https://<host>:2222/` (severity MAJOR — sygnalizuje że provisioning działa)
3. Zaznacz „Pokaż na publicznej stronie statusu” dla wszystkich które chcesz reklamować klientom.
4. Po zapisaniu — w ciągu 30s pojawią się pierwsze próbki, w ciągu 90s ewentualny incydent (engine wymaga 2 kolejnych failów).
5. Dla każdego nowego incydentu, w **„Status Page → Historia Incydentów”** edytujesz **publiczny komunikat** (widoczny dla klientów na status.verris.pl). Engine ustawia tylko techniczny tytuł — zespół supportu dopisuje co się dzieje.

> Eksport historii incydentów do CSV (np. dla materiałów sprzedażowych „99.97% za 90 dni”): w **„Historia Incydentów”** kliknij **Eksport CSV**. Strumień, działa nawet dla 12-miesięcznych okien.

## Aktualizacja

```bash
cd /opt/verris
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
```

## Migracje DB

Schemat Prismy (`libs/database/prisma/schema.prisma`) jest źródłem prawdy. Migracje produkcyjne idą przez `prisma migrate deploy`, deweloperskie przez `prisma migrate dev`.

### Stan początkowy

Pierwsza migracja `0_init` została wygenerowana z `migrate diff --from-empty` na bazie aktualnego schematu (652 linie DDL: enums, tabele, indeksy, FK). Istniejące produkcje zaktualizowane sprzed tej migracji muszą zostać **zbaseline'owane** raz (jednorazowo):

```bash
# Tylko jeśli prod był wcześniej zarządzany przez `db push` i tabela _prisma_migrations
# nie istnieje. Sprawdza się tym że psql -c "\dt _prisma_migrations" zwraca pusto.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  npx prisma migrate resolve --applied 0_init --schema=libs/database/prisma/schema.prisma
```

Po baseline'owaniu kolejne deploye używają wyłącznie `migrate deploy` — Prisma sama policzy co aplikować.

### Dodawanie nowej migracji (workflow developer'a)

```bash
# 1) Edytuj libs/database/prisma/schema.prisma
# 2) Wygeneruj nową migrację lokalnie (Postgres dev musi działać)
pnpm --filter @verris/database db:migrate:dev -- --name <descriptive_name>
# 3) Zweryfikuj migrations/<timestamp>_<name>/migration.sql w PR
# 4) Po merge na produkcji: kolejny `migrate deploy` zaaplikuje nową migrację
```

### Reset DB (TYLKO dev / staging — irreversible)

```bash
pnpm --filter @verris/database db:migrate:reset
# Drop + recreate + apply all migrations + (skip seed; uruchom oddzielnie jeśli trzeba)
```

## Backup (automatyczny)

W repo jest gotowy skrypt + szablon crona, który robi codzienny zrzut Postgresa (`pg_dump`), kompresuje go i pilnuje retencji.

```bash
# Manualne uruchomienie (dobre do pierwszego sprawdzenia):
sudo BACKUP_DIR=/var/backups/verris \
     RETENTION_DAYS=14 \
     COMPOSE_PROJECT_NAME=verris \
     ./ops/backup-postgres.sh

# Instalacja crona (uruchamia się codziennie o 03:17 UTC):
sudo install -m 0644 ops/cron/verris-backup.cron /etc/cron.d/verris-backup

# Sprawdzenie logów (powinien być wpis "backup complete"):
tail -n 20 /var/log/verris-backup.log
```

Skrypt:

- używa `pg_dump --clean --if-exists --no-owner --no-privileges` → zrzut jest idempotentny i przenośny;
- weryfikuje, że plik jest poprawnym gzip i ma sensowny rozmiar (≥ 1 KB) zanim go zatwierdzi (atomowe `mv` z pliku `.partial`);
- usuwa pliki starsze niż `RETENTION_DAYS` (domyślnie 14).

### Restore

```bash
# UWAGA: drop wszystkich obiektów w docelowej DB (--clean --if-exists)
sudo ./ops/restore-postgres.sh /var/backups/verris/verris-2026-04-28-0317.sql.gz --confirm
```

Wolumin `redis_data` można pomijać — Redis jest cache/queue, można odtworzyć.

### Off-site (zalecane)

Backupy lokalne to za mało dla produkcji. Skopiuj `/var/backups/verris` co dobę do zewnętrznego storage (S3/Backblaze/wewnętrzny NFS), np.:

```cron
27 3 * * *  root  rclone copy /var/backups/verris remote:verris-backups --max-age 30d
```

## Rotacja `APP_KMS_KEY`

`APP_KMS_KEY` szyfruje wszystkie sekrety przechowywane w bazie (hasła kont DA na serwerach i kontach klienckich, sekrety TOTP 2FA, recovery codes). W normalnej operacji nie należy go zmieniać — jeśli musisz to zrobić (kompromitacja klucza, polityka rotacji), skorzystaj z gotowego CLI `cli:rotate-kms` w pakiecie `api`.

### Kiedy rotować

- klucz wyciekł (np. wyciek `.env`, kompromitacja serwera)
- raz w roku, w ramach planowej higieny
- przy zmianie operatora lub miejsca przechowywania sekretów

### Procedura

> **Krytyczne**: API musi być **wyłączone** podczas `--apply`. W przeciwnym razie pisze świeże ciphertexty starym kluczem w trakcie, gdy CLI je przepisuje, co skutkuje utratą sekretów.

```bash
# 1) Wygeneruj nowy klucz (≥ 32 znaki)
NEW_KMS=$(openssl rand -base64 48)
echo "NEW_KMS_KEY=$NEW_KMS"   # zapisz w trezorze ZANIM zatrzymasz API

# 2) Najpierw dry-run pod aktualnym ruchem (bez zatrzymywania API):
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -e OLD_KMS_KEY="$(grep ^APP_KMS_KEY .env.prod | cut -d= -f2-)" \
       -e NEW_KMS_KEY="$NEW_KMS" \
       api pnpm --filter api cli:rotate-kms
# Oczekiwany wynik: "Dry run successful." + raport ile wierszy/tabel zostanie ruszonych.

# 3) Maintenance window — zatrzymaj WYŁĄCZNIE API (DB i panele zostają):
docker compose -f docker-compose.prod.yml --env-file .env.prod stop api

# 4) Re-encrypt na żywej DB:
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm \
       -e OLD_KMS_KEY="$(grep ^APP_KMS_KEY .env.prod | cut -d= -f2-)" \
       -e NEW_KMS_KEY="$NEW_KMS" \
       api pnpm --filter api cli:rotate-kms -- --apply
# Oczekiwany wynik: "Rotation complete. Restart the API with NEW_KMS_KEY now."

# 5) Podmień APP_KMS_KEY w .env.prod na wartość z $NEW_KMS:
sed -i.bak "s|^APP_KMS_KEY=.*|APP_KMS_KEY=$NEW_KMS|" .env.prod && rm -f .env.prod.bak

# 6) Wystartuj API z nowym kluczem:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api

# 7) Sanity check (najlepiej z konta testowego):
#  - login z 2FA (TOTP) → musi działać (potwierdza odszyfrowanie sekretu TOTP)
#  - DA-suspend / unsuspend dowolnej subskrypcji → musi przejść (potwierdza odszyfrowanie hasła DA)
```

### Co rotuje CLI


| Tabela    | Kolumna                     | Co zawiera                            |
| --------- | --------------------------- | ------------------------------------- |
| `Server`  | `daPasswordEnc`             | hasło konta admina DA na danym węźle  |
| `Account` | `daPasswordEnc`             | hasło konta klienta DA                |
| `User`    | `twoFactorSecret`           | sekret TOTP 2FA użytkownika           |
| `User`    | `twoFactorRecoveryCodesEnc` | hashowane + szyfrowane recovery codes |


Po dodaniu nowej kolumny szyfrowanej `APP_KMS_KEY` zaktualizuj listę `COLUMNS` w `apps/api/src/cli/rotate-kms.ts` (test pokrywa to przypomnienie).

### Tryby

- `--dry-run` (default) — odszyfrowuje wszystko `OLD_KMS_KEY` i sprawdza że re-encrypt z `NEW_KMS_KEY` da z powrotem ten sam plaintext, ale **nie pisze do DB**. Bezpieczne, można uruchomić w godzinach pracy.
- `--apply` — zapisuje nowe ciphertexty (batchami po 100 wierszy w transakcji). Wymaga zatrzymanego API.

Każde uruchomienie (również dry-run) zostawia wpis w `AuditLog` z `action=KMS_KEY_ROTATED` i podsumowaniem (ile wierszy w każdej tabeli, błędy, czy to dry run). To pozwala potem prześledzić historię rotacji.

### Co zrobić, jeśli rotacja się nie powiedzie

CLI raportuje błędy per wiersz i kończy się z `exit code 1` jeśli były niepowodzenia. Dopóki nie zatrzymałeś API i `.env.prod` nie został zaktualizowany — wszystko nadal działa na `OLD_KMS_KEY`. Wyniki dry-runu można porównać z `--apply` po fakcie: liczby `scanned`/`rotated` muszą być identyczne, a `errors=0`. Jeśli nie — odtwórz Postgresa z najświeższego backupu (sekcja powyżej) i zacznij od nowa.

---

### Załączniki ticketów (E‑4)

API (`apps/api`) składuje pliki **na dysku** w katalogu z `TICKET_UPLOAD_DIR` (gdy puste: `uploads/tickets` względem katalogu roboczego procesu). Panele Next.js pobierają pliki przez **Route Handlery** (`/api/tickets/…/attachments/…/file`) z nagłówkiem `Authorization` z httpOnly cookie — nie trzeba JWT w URL.

W produkcji:

1. Nadaj API trwały katalog: ustaw `TICKET_UPLOAD_DIR` (np. `/data/ticket-uploads`) w `.env.prod` / `docker-compose.prod.yml`.
2. Zamontuj **named volume** lub bind mount na tę ścieżkę przy serwisie `api`; inaczej załączniki znikną przy przebudowie obrazu kontenera.

Limity (API): najczęściej 8 MB na plik, do 5 plików na żądanie, do 40 na zgłoszenie; dozwolone MIME m.in. PDF, JPG/PNG/GIF/WebP, txt/csv, ZIP.

---


## Checklist migracji na produkcję (bez PayU)

Wykonaj po kolei przed pierwszym ruchem z prawdziwymi klientami (adapter **PayU** zostaje na osobny sprint według `PROJECT_STATUS`).

1. **DNS** — rekordy A/AAAA na control-plane dla `panel`, `staff`, `admin`, `api`, `status`, `grafana` (zgodnie z `CADDY_*_DOMAIN` w `.env.prod`).
2. **Sekrety** — `JWT_SECRET`, `APP_KMS_KEY`, `POSTGRES_PASSWORD`, Stripe **live**, `STRIPE_WEBHOOK_SECRET` ustawione; webhook w Stripe wskazuje na `PUBLIC_API_URL/billing/stripe/webhook` (zdarzenia jak w „Sekrety – minimum produkcyjne”, w tym `**payment_intent.*`** przy auto‑doładowaniu portfela).
3. `**docker compose**` — build + up jak w pierwszym uruchomieniu (`DEPLOY`), potem `**prisma migrate deploy**`.
4. **Seed** — `admin@verris.pl` oraz `**staff@verris.pl`** (STAFF — `libs/database/prisma/seed.ts`); hasła przez `SEED_ADMIN_PASSWORD` / `**SEED_STAFF_PASSWORD**`.
5. **Mail** (`SMTP_*`) — tickety, alerty (`SECURITY_ALERT_EMAIL`) jeśli używasz.
6. **Redis** — `REDIS_URL` (domyślnie `redis://redis:6379`); auto‑top‑up wymaga Stripe.
7. **Załączniki ticketów** — `TICKET_UPLOAD_DIR` + volume dla `api` (patrz wyżej: „Załączniki ticketów”).
8. **Stripe** — uzupełnij `**price_*`** przy planach (admin lub seed).
9. **Pierwszy węzeł** — CloudLinux + LiteSpeed/LSPHP, zmienne `LITESPEED_SERIAL_NO` / `LSWS_WEBADMIN_ALLOW_IP` na węźle, bootstrap → akceptacja → DA → minimum probes (patrz „Węzły obliczeniowe” i „Status Page”).
10. **Backup** — cron + zalecany off-site (`rclone` itd.).
11. **Smoke** — rejestracja → zakup → provisioning → billing → ticket w panelu klienta + obsługa w **staff** (`/login`).

W `docker-compose.prod.yml` ustawione jest `**API_URL=http://api:3000`** przy panelach (SSR do API po sieci wewnętrznej); klient przeglądarki nadal gada z `**PUBLIC_API_URL**` przez `NEXT_PUBLIC_*`.