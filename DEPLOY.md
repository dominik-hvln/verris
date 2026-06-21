# Deploy Verris (control-plane)

Ten dokument opisuje uruchomienie panelu, API i bazy danych na **dedykowanym serwerze** (control-plane). Węzły obliczeniowe (z DA + CloudLinux LVE + LiteSpeed) konfigurujesz osobno przez panel admina.

Przed pierwszym deployem i przed każdym go-live przejdź checklistę: [GO_NO_GO_PROD.md](./GO_NO_GO_PROD.md).

## Wymagania na maszynie control-plane

- Linux (**Ubuntu 24.04 LTS** zalecane; działa też 22.04 / Debian 12+)
- Docker Engine 24+ i Docker Compose v2 (obrazy aplikacji bazują na `node:20-bookworm-slim`, niezależnie od dystrybucji hosta)
- Port 80 i 443 dostępne z internetu (do TLS i Stripe webhook)
- DNS: rekordy A dla `panel.`*, `staff.`*, `admin.*`, `api.*` i `status.*` skierowane na ten host (ostatni dla publicznej strony statusu)

## `.env.prod` — hasło Postgresa i `DATABASE_URL`

- Ustaw **`POSTGRES_PASSWORD`** (to samo hasło widzi kontener `postgres` i API).
- **`DATABASE_URL` możesz zostawić puste** — skrypt `ops/docker/api-entrypoint.sh` zbuduje poprawny URL z automatycznym kodowaniem hasła (np. gdy hasło zawiera `@`, `/`, `:`).
- Jeśli wpisujesz `DATABASE_URL` ręcznie, hasło w URL musi być **percent-encoded** (`@` → `%40` itd.) — inaczej Prisma zgłosi `P1013 invalid port number`.
- `POSTGRES_USER` / `POSTGRES_DB` muszą być **spójne** z tym, co jest już w wolumenie Postgresa (po pierwszym `up` zmiana usera wymaga nowego volume lub migracji ról).

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
# Użyj skryptu (ustawia DATABASE_URL z POSTGRES_* — zwykły `exec api npx prisma` bez URL w .env zawiedzie):
chmod +x ops/scripts/prod-migrate-deploy.sh
./ops/scripts/prod-migrate-deploy.sh
# UWAGA: nie używamy już `prisma db push` w produkcji — od pierwszej migracji `0_init`
# wszystkie zmiany schematu idą przez `prisma migrate deploy` (patrz sekcja „Migracje DB").

# 6) Wczytaj seed (admin@verris.pl + staff@verris.pl + plany + cennik autoskalowania)
SEED_ADMIN_PASSWORD='<silne_hasło_admina>' \
SEED_STAFF_PASSWORD='<inne_silne_hasło_staff>' \
./ops/scripts/prod-seed.sh
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

1. **Admin → Węzły → Wizard nowego węzła** (`/nodes/wizard`) — checklist CL → DA → LS → bootstrap → profil hostingowy.
2. Alternatywnie: szybka inicjalizacja (`/nodes/init`) tylko z formularzem i skryptem.
3. Na węźle ustaw `LITESPEED_SERIAL_NO` (i opcjonalnie `LSWS_WEBADMIN_ALLOW_IP`), potem uruchom skrypt jako root w `tmux`.
4. Skrypt zgłosi się do panelu — w sekcji „Czeka na akceptację” kliknij „Zaakceptuj”.
5. Skonfiguruj DirectAdmin (host/port/login/login-key) i uruchom test połączenia.
6. Opcjonalnie: `ops/scripts/node-hosting-profile.sh` — spójny profil Governor / CustomBuild (po DA).

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

- **Prometheus** (port 9090, internal) — scrapuje API `/metrics`, postgres-exporter, redis-exporter, **node-exporter** (host CPU/RAM/dysk), **cAdvisor** (RAM/CPU kontenerów) co 15 s, retencja 30 dni.
- **Grafana** (port 3000, internal, publicznie pod `grafana.verris.pl`) — `auth.proxy` mode + Caddy `forward_auth` do `/auth/grafana-validate`.
- **Loki** + **Promtail** — centralne logi kontenerów `verris-*` (retencja 7 dni); dashboard **Logs explorer** w folderze `Verris`.
- **postgres-exporter** + **redis-exporter** — DB i Redis metryki (CPU, lag, slow queries, connections, hit ratio).
- **node-exporter** + **cAdvisor** — metryki hosta i kontenerów Docker.
- **Dashboardy** prowizjonowane jako kod w `ops/observability/grafana/provisioning/dashboards/json/`:
  - `00-ops-overview` — host + kontenery + API HTTP + Postgres/Redis + linki operacyjne
  - `01-control-plane-health` — uptime API, RAM, subscriptions per status, ostrzeżenia PAST_DUE/SUSPENDED
  - `02-compute-fleet` — serwery (status, stale heartbeat), tabela z `server_safe`, kolejka provisioningu
  - `03-cloudlinux-lve` — autoscaling events, top 10 LVE-żerców (CPU/RAM avg z `usage_metric_safe`), serie skalowania
  - `04-business` — MRR (z `subscription_safe`), top-upy, autoscaling revenue, plany × statusy, dzienne flow
  - `05-ops-storage` — backup Postgres w MinIO (wiek, rozmiar), provisioning, webhooki FAILED
  - `08-logs-explorer` — LogQL po serwisie / wyszukiwaniu tekstowym

Odświeżenie stacku observability na prod:

```bash
./ops/scripts/prod-obs-stack-up.sh
```

Link z **admin-panel** i **staff-panel** (sekcja Monitoring): `NEXT_PUBLIC_GRAFANA_URL` → dashboard `verris-ops-storage`. Staff wymaga `canAccessGrafana` (Operatorzy w admin).

### Bezpieczeństwo metryk i danych

`grafana_ro` ma `SELECT` **tylko** na `*_safe` views — passwords, tokeny i sekrety DA są niedostępne nawet przez przypadkowe nadpisanie panelu. Lista dozwolonych kolumn jest w `0_init/migration.sql` na końcu pliku.

`/metrics` jest chronione (jeśli `METRICS_AUTH_TOKEN` ustawione) bearer tokenem; w domyślnej konfiguracji Caddy nie wystawia `/metrics` publicznie (Prometheus dosięga API tylko po `verris_internal` net).

### SSO Grafany (F-15)

Cookie panelu (`admin_auth_token` / `staff_auth_token`) musi być widoczne na `grafana.verris.pl`:

1. W `.env.prod` ustaw `AUTH_COOKIE_DOMAIN=.verris.pl` (patrz `.env.prod.example`).
2. Otwieraj Grafanę **linkiem z panelu** (`/grafana/sso`) — hop ustawia cookie na domenie wspólnej i przekierowuje do dashboardu. Bezpośredni URL `grafana.verris.pl` bez wcześniejszego logowania w panelu zwróci 401.

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

Kontenery zapisują logi lokalnie (`json-file`, 10 MB × 5 plików). **Promtail** czyta logi Docker i wysyła je do **Loki** (retencja 7 dni). W Grafanie: folder `Verris` → **Logs explorer** — filtry `service` (compose service) i wyszukiwanie tekstowe.

Live tail bez Grafany: `docker compose ... logs -f api`.

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

### Status webhooks

Status webhooks są konfigurowane w panelu admina **Product Ops / NOC → Status webhooks**. Każdy endpoint:

- ma listę eventów (`INCIDENT_CREATED`, `INCIDENT_UPDATED`, `INCIDENT_RESOLVED`, `MAINTENANCE_SCHEDULED`),
- może mieć sekret podpisu; wtedy API wysyła nagłówek `x-verris-signature` jako HMAC-SHA256 z JSON body,
- dostaje delivery id w `x-verris-delivery` i typ eventu w `x-verris-event`.

Delivery scheduler działa co minutę, bierze najstarsze pending deliveries, timeoutuje request po 10 s i retry'uje maksymalnie 5 razy z backoffem. Po piątej próbie delivery przechodzi do `FAILED` i jest widoczne w admin NOC oraz w metrykach:

- `verris_status_webhook_deliveries_total{status}`,
- `verris_status_webhook_oldest_pending_seconds`.

Alerty produkcyjne: `oldest_pending_seconds > 300` albo `deliveries_total{status="FAILED"} > 0`.

### Public uptime badge

Kliencki badge SVG jest dostępny pod:

```text
GET /public/services/:subscriptionId/uptime-badge.svg
```

Endpoint nie wymaga auth, ale nie pokazuje domeny klienta, planu ani danych konta. Zwraca tylko stan `operational/degraded` wyliczony z publicznych probes na węźle usługi. `subscriptionId` jest UUID; nie traktować badge'a jako źródła danych prywatnych.

## Provisioning Queue — dead-letter i recovery

Provisioning kont DA działa asynchronicznie, gdy `REDIS_URL` jest ustawione. Każdy zakup trafia do BullMQ z idempotentnym `jobId` per subskrypcja i źródło płatności. Status widoczny klientowi jest zapisywany na `Subscription.provisioningStage`: `queued`, `running`, `retrying`, `failed`, `completed`.

### Operacyjny panel recovery

1. Otwórz `https://admin.verris.pl/provisioning-queue`.
2. Filtr `Błędne` pokazuje joby dead-letter po wyczerpaniu retry albo błędzie permanentnym.
3. Sprawdź:
   - kategorię błędu (`transient`/`permanent`),
   - `subscriptionId`, klienta, domenę, konto DA i node,
   - czy w DirectAdmin nie powstało już konto ręcznie lub po timeout.
4. Jeśli konto istnieje w DA, ale nie ma rekordu `Account`, nie klikaj retry w ciemno. Najpierw odtwórz rekord przez procedurę importu konta lub eskaluj do operatora node.
5. Jeśli problem był przejściowy (timeout, 502/503/504, chwilowy brak połączenia, odblokowana pojemność węzła), wpisz konkretny powód i kliknij `Retry`. Powód jest wymagany i trafia do audytu.
6. Jeśli błąd jest permanentny (złe credentials DA, domena już istnieje, walidacja planu), popraw przyczynę przed retry. Bez tego job ponownie wróci do dead-letter.

### Test matrix awarii DirectAdmin

| Scenariusz | Jak zasymulować | Oczekiwany wynik |
| --- | --- | --- |
| Timeout DA | ustaw zły `daHost` lub regułę firewall dla portu DA | status klienta `retrying`, metryka queue depth rośnie, po wyczerpaniu prób `failed` |
| Błędne credentials | wpisz niepoprawny login-key DA na węźle | brak podwójnego konta, `failed` z kategorią permanentną, audyt `PROVISIONING_JOB_FAILED` |
| Brak pojemności węzła | ustaw alokację CPU/RAM/DISK powyżej limitu albo maintenance na wszystkie node | job przechodzi retry tylko dla transient capacity, klient widzi czytelny komunikat bez sekretów |
| Timeout po utworzeniu konta | przerwij proces po stronie API po DA create | kolejne uruchomienie wykrywa istniejący `Account` i promuje subskrypcję do `ACTIVE` bez drugiego DA create |

### Metryki Grafana/Prometheus

`/metrics` wystawia:

- `verris_provisioning_queue_depth{state=...}`,
- `verris_provisioning_jobs_total{event=started|completed|failed|retried|queued}`,
- `verris_provisioning_queue_oldest_waiting_seconds`,
- `verris_provisioning_stage_total{stage=queued|running|retrying|failed|completed}`.

Alerty produkcyjne: `oldest_waiting_seconds > 300`, `queue_depth{state="failed"} > 0`, `stage_total{stage="failed"} > 0`.

## Migration worker protocol — compute-node

Duże migracje nie idą przez control-plane. API tylko zapisuje bundle i kolejkę `MigrationWorkerJob`, a compute-node odpytuje:

```text
GET  /node/migration-worker/lease
POST /node/migration-worker/:jobId/complete
POST /node/migration-worker/:jobId/fail
```

Autoryzacja: ten sam `ServerIdentityGuard` co telemetry/probes (`X-Server-Id` + `X-Server-Token`). Node dostaje tylko joby dla kont hostowanych na swoim `serverId`.

Typy jobów:

- `FILES_SFTP_RSYNC` — transfer plików do `public_html`.
- `MYSQL_IMPORT` — import pojedynczej bazy z bundle.
- `IMAP_SYNC` — sync pojedynczej skrzynki.
- `HTTP_POST_CHECK` — końcowy check `https://<targetDomain>`.

Zasady LIVE:

- Worker musi używać `idempotencyKey` joba lokalnie w logach i nie wykonywać destrukcyjnych operacji dwa razy bez sprawdzenia stanu docelowego.
- `complete` przyjmuje liczniki `bytesTransferred`, `filesTransferred`, opcjonalnie `databasesMigrated`, `mailboxesMigrated` oraz log skracany do 256 KiB.
- `fail` przyjmuje `retryable=true` tylko dla błędów przejściowych: timeout, zerwane połączenie, temporary auth lock, niedostępność źródła.
- Request migracji przechodzi na `COMPLETED` dopiero gdy nie ma żadnych aktywnych jobów `QUEUED/RUNNING/RETRYING`.
- Każde complete/fail zapisuje `SubscriptionEvent`, więc klient i staff widzą postęp w timeline bez dostępu do sekretów.

## Aktualizacja

### Zalecane: rolling deploy (STAB-1 — bez okna 502/503)

```bash
cd /opt/verris
./ops/scripts/prod-deploy-rolling.sh
```

Skrypt: buduje wszystkie obrazy (stare kontenery dalej obsługują ruch) → migruje
DB → recreuje usługi **pojedynczo** z bramką health-check (API → panele → status),
więc nigdy nie padają wszystkie naraz. Współgra z:

- **aktywnym health-check Caddy** (`health_uri` + `lb_try_duration 30s`) — proxy
  zdejmuje upstream w trakcie restartu i przetrzymuje/retryuje żądanie aż nowy
  kontener wstanie, zamiast zwracać 502/503;
- **graceful-drain API** — na SIGTERM `/readyz` zwraca 503 (`SHUTDOWN_DRAIN_MS`,
  domyślnie 8 s), Caddy przestaje kierować ruch, żądania w locie się kończą,
  dopiero potem kontener się zamyka (`stop_grace_period: 30s`).

> **Migracje muszą być wstecznie zgodne** (expand→contract): nie usuwaj
> kolumny/tabeli w tej samej migracji, w której kod przestaje jej używać —
> najpierw wdroż kod, w osobnym kroku „contract". Zmiany niezgodne → okno
> maintenance (toggle węzła / pełny `up -d --build`).

### Pełny restart (fallback — krótka przerwa)

```bash
cd /opt/verris
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
```

### Prawdziwe zero-downtime API (opcjonalnie, następny krok)

Dla pełnej eliminacji nawet chwilowego okna na samym API: uruchom **2 repliki**
API i recreuj je po jednej (`docker compose up -d --scale api=2 --no-deps api`
po jednej instancji). Caddy z dynamicznymi upstreamami (DNS) rozłoży ruch na obie
i zawsze jedna będzie zdrowa. Wymaga drobnej zmiany w Caddyfile (`dynamic a`) —
opisane w `docs/PLAN_DALSZYCH_PRAC_2026-06.md`.

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

## Backup (automatyczny) — MinIO

Backup Postgres i pliki użytkowników są w **tym samym MinIO** na control-plane (jak załączniki ticketów). Zewnętrzny serwer to faza 2 (`ops/backup-mirror-external.sh`).

Bucket: `verris-backups` (env `S3_BUCKET_BACKUPS`), ścieżka: `postgres/verris-YYYY-MM-DD-HHMM.sql.gz` oraz `postgres/latest.sql.gz`.

```bash
cd /opt/verris
set -a && source .env.prod && set +a
./ops/backup-postgres.sh

# Lista backupów w MinIO:
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --no-deps \
  --entrypoint /bin/sh minio-bootstrap -c '
  mc alias set verris http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc ls verris/verris-backups/postgres/
'

# Cron (03:17 UTC, ładuje .env.prod):
sudo install -m 0644 ops/cron/verris-backup.cron /etc/cron.d/verris-backup
tail -n 30 /var/log/verris-backup.log
```

Skrypt:

- `pg_dump` → staging `/tmp/verris-backup-staging` → upload przez `mc` do MinIO;
- retencja 14 dni — reguła ILM na buckecie + czyszczenie stagingu;
- bootstrap tworzy bucket `verris-backups` przy `docker compose up`.

### Restore

```bash
# Z MinIO (zalecane na prod):
./ops/restore-postgres.sh --from-minio latest.sql.gz --confirm

# Z lokalnego pliku (staging / ręczna kopia):
./ops/restore-postgres.sh /tmp/verris-backup-staging/verris-....sql.gz --confirm
```

Wolumin `redis_data` można pomijać — Redis jest cache/queue.

### Mirror na zewnętrzny serwer (faza 2)

Gdy będzie drugi MinIO/S3:

```bash
# /etc/default/verris-backup — MIRROR_EXTERNAL_ENABLED=1 + OFFSITE_MC_* 
./ops/backup-mirror-external.sh
```

Stary `ops/backup-offsite-sync.sh` przekierowuje do tego skryptu.

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

### Załączniki ticketów + RODO data exports + DPA PDF — MinIO (S3)

Wszystkie uploady (załączniki ticketów, eksporty RODO, PDF-y DPA, w
przyszłości faktury) są przechowywane w **MinIO** (S3-compatible object
storage) działającym jako serwis `minio` w `docker-compose.prod.yml`.
Lokalny FS nie jest używany — daje to:

- **Przenośność**: kiedyś można przepiąć `S3_ENDPOINT` na osobny serwer
  storage (np. dedykowany node MinIO, AWS S3, Backblaze B2, Cloudflare R2)
  bez zmiany jednej linii kodu.
- **Backup w jednym miejscu**: Postgres w buckecie `verris-backups`; cały volume MinIO → mirror zewnętrzny (faza 2).
- **Lifecycle policy**: `verris-data-exports` ma natywne 7-dniowe expiry
  (defense in depth ponad app-level RetentionScheduler).

Konfiguracja w `.env.prod`:

```bash
# Endpoint widoczny dla kontenera api (http://minio:9000 wewnątrz docker network)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=verris-panel
S3_SECRET_KEY=<openssl rand -base64 32>
S3_REGION=eu-central-1
S3_USE_SSL=false
S3_PATH_STYLE=true

# Buckety (domyślne nazwy)
S3_BUCKET_TICKET_ATTACHMENTS=verris-ticket-attachments
S3_BUCKET_DATA_EXPORTS=verris-data-exports
S3_BUCKET_DPA_PDFS=verris-dpa-pdfs
S3_BUCKET_INVOICES=verris-invoices
S3_BUCKET_BACKUPS=verris-backups

# MinIO root (tylko do bootstrap-containera; api używa S3_ACCESS_KEY/SECRET)
MINIO_ROOT_USER=verris-root
MINIO_ROOT_PASSWORD=<openssl rand -base64 32>

# Tymczasowy katalog na build ZIP-ów (przed wgraniem do MinIO)
DATA_EXPORT_TEMP_DIR=/tmp/verris-data-exports
```

Bootstrap (przy `docker compose up -d`):

1. `minio` startuje, healthcheck na `/minio/health/live`.
2. `minio-bootstrap` (one-shot) tworzy buckety (w tym `verris-backups`), ustawia anonymous=none
   i aplikuje 7-dniową regułę expiry na `verris-data-exports`.
3. `api` startuje **dopiero po `minio-bootstrap` (condition: completed_successfully)**.
4. Aplikacja przy starcie wywołuje `ObjectStorageService.onApplicationBootstrap`
   który ponownie weryfikuje istnienie bucketów (idempotentnie) — gdyby
   bootstrap-container nie zadziałał, panel sam je dotworzy.

Tworzenie dedykowanego usera dla API (zamiast root) — **🔴 wymagane przed LIVE**:

```bash
docker compose -f docker-compose.prod.yml exec minio sh -c '
  mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc admin user add local verris-panel '"$S3_ACCESS_KEY"' '"$S3_SECRET_KEY"'
  mc admin policy attach local readwrite --user verris-panel
'
```

Limity (API): najczęściej 8 MB na plik, do 5 plików na żądanie, do 40 na
zgłoszenie; dozwolone MIME m.in. PDF, JPG/PNG/GIF/WebP, txt/csv, ZIP.

#### Migracja istniejących plików z FS → MinIO (jeśli były)

Jeżeli przed wgraniem tej wersji istniały już załączniki na dysku (np. ze
stagingu) to należy je przeładować do bucketów:

```bash
# Dry-run (tylko skanuje + raportuje)
pnpm --filter api cli:storage-migrate-from-fs

# Apply + usunięcie lokalnych po sukcesie
pnpm --filter api cli:storage-migrate-from-fs -- --apply --unlink-local
```

Skrypt jest idempotentny — pliki już w MinIO są pomijane. Czyta
`TICKET_UPLOAD_DIR` i `DATA_EXPORT_STORAGE_DIR` (jeśli ustawione) jako
ścieżki źródłowe; ich nieobecność oznacza świeży deploy bez legacy.

---


## Checklist migracji na produkcję (bez PayU)

Wykonaj po kolei przed pierwszym ruchem z prawdziwymi klientami (adapter **PayU** zostaje na osobny sprint według `PROJECT_STATUS`).

1. **DNS** — rekordy A/AAAA na control-plane dla `panel`, `staff`, `admin`, `api`, `status`, `grafana` (zgodnie z `CADDY_*_DOMAIN` w `.env.prod`).
2. **Sekrety** — `JWT_SECRET`, `APP_KMS_KEY`, `POSTGRES_PASSWORD`, Stripe **live**, `STRIPE_WEBHOOK_SECRET` ustawione; webhook w Stripe wskazuje na `PUBLIC_API_URL/billing/stripe/webhook` (zdarzenia jak w „Sekrety – minimum produkcyjne”, w tym `**payment_intent.*`** przy auto‑doładowaniu portfela).
3. `**docker compose**` — build + up jak w pierwszym uruchomieniu (`DEPLOY`), potem `**prisma migrate deploy**`.
4. **Seed** — `admin@verris.pl` oraz `**staff@verris.pl`** (STAFF — `libs/database/prisma/seed.ts`); hasła przez `SEED_ADMIN_PASSWORD` / `**SEED_STAFF_PASSWORD**`.
5. **Mail** (`SMTP_*`) — tickety, alerty (`SECURITY_ALERT_EMAIL`) jeśli używasz.
6. **Redis** — `REDIS_URL` (domyślnie `redis://redis:6379`); auto‑top‑up wymaga Stripe.
7. **Object storage (MinIO)** — `MINIO_ROOT_USER`/`PASSWORD` ustawione, dedykowany user `verris-panel` utworzony przez `mc admin user add`, `S3_ACCESS_KEY`/`SECRET_KEY` w `.env.prod`, smoke `mc ls verris/` pokazuje 4 buckety (patrz „Załączniki ticketów + RODO data exports + DPA PDF — MinIO (S3)” wyżej).
8. **Stripe** — uzupełnij `**price_*`** przy planach (admin lub seed).
9. **Pierwszy węzeł** — CloudLinux + LiteSpeed/LSPHP, zmienne `LITESPEED_SERIAL_NO` / `LSWS_WEBADMIN_ALLOW_IP` na węźle, bootstrap → akceptacja → DA → minimum probes (patrz „Węzły obliczeniowe” i „Status Page”).
10. **Backup** — cron + zalecany off-site (`rclone` itd.).
11. **Smoke** — rejestracja → zakup → provisioning → billing → ticket w panelu klienta + obsługa w **staff** (`/login`).

W `docker-compose.prod.yml` ustawione jest `**API_URL=http://api:3000`** przy panelach (SSR do API po sieci wewnętrznej); klient przeglądarki nadal gada z `**PUBLIC_API_URL**` przez `NEXT_PUBLIC_*`.

## Provisioning queue (BullMQ) — runbook dead-letter / recovery

Sprint 5 (R-11+B-7) wprowadza asynchroniczną kolejkę provisioningu opartą o **BullMQ + Redis**. Worker uruchamia się automatycznie w procesie API gdy `REDIS_URL` jest ustawiony — bez Redisa kolejka działa synchronicznie (zachowanie pre-R-11) i wszystkie operacje DA wykonują się inline w request handlerze.

**Aktywacja:** `REDIS_URL=redis://redis:6379` w `.env.prod` panelu API. Nie wymaga osobnego procesu/kontenera workera — pojedyncza instancja API jest jednocześnie producentem i workerem (concurrency = 1, żeby uniknąć podwójnego DA tego samego konta).

**Idempotency.** `jobId` jest zawsze deterministyczny: `wallet-<subId>` / `manual-<subId>` / `stripe-<subId>`. Dorzucenie tego samego enqueue dwa razy w BullMQ jest no-op. Dodatkowo runner sprawdza istnienie `Account` po `subscriptionId` przed wywołaniem DA — jeśli poprzednia próba przeszła ale upadł krok po niej, nie wołamy DA ponownie i tylko promujemy subskrypcję do `ACTIVE`. Robi to całość bezpieczną na **podwójne wywołanie / restart Redisa / restart API**.

**Klasyfikacja błędów.** `categorizeError` (`provisioning-queue.service.ts`) traktuje jako *transient* (= retry z exp backoff, `attempts=3`, `delay=5s`):

- `timeout`, `etimedout`, `econnrefused`, `econnreset`, `socket hang up`, `fetch failed`
- HTTP 502 / 503 / 504 z DA
- `all compute nodes are at capacity` (`NodeSelectorService`)
- `cloudlinux lve limits could not be applied` (DA już założył konto, kończymy LVE w retry)

Pozostałe (4xx z DA poza 408/429, walidacja, `domain already exists`) są *permanent* — od razu hard-fail bez kolejnych prób.

**Statusy widoczne dla klienta** (`Subscription.provisioningStage`): `queued | running | retrying | failed | completed`. Renderuje je panel klienta na karcie usługi. Pełen tekst błędu nigdy nie idzie do klienta — przepuszczamy go przez `humanizeProvisioningError` w `services.controller.ts`.

**Obserwowalność.**

- Prometheus `/metrics`:
  - `verris_provisioning_pending` — subskrypcje w stanie `PROVISIONING`.
  - `verris_provisioning_stage_total{stage}` — breakdown po `provisioningStage` z DB.
  - `verris_provisioning_queue_depth{state}` — `active|waiting|delayed|failed|completed|paused` z BullMQ.
  - `verris_provisioning_jobs_total{event}` — counters `started|completed|failed|retried` z workera.
- Grafana: dashboard **01 control-plane health** ma panel „Provisioning queue depth" oraz „Provisioning failures" (PromQL: `increase(verris_provisioning_jobs_total{event="failed"}[1h])`).
- Audit: każdy retry / hard-fail / recovery zapisany w `AuditLog` (`PROVISIONING_RETRY_SCHEDULED`, `SUBSCRIPTION_PROVISIONING_FAILED`, `PROVISIONING_RECOVERED_FROM_PARTIAL`).

**Admin queue panel.** `https://admin.<host>/provisioning-queue` (rola ADMIN) — counts per state, lista 100 ostatnich jobów, błąd, czas trwania, przycisk **Retry** (wywołuje `POST /admin/provisioning-queue/:jobId/retry`).

**Dead-letter recovery — runbook.**

1. **Diagnoza:** `https://admin.<host>/provisioning-queue?state=failed` — sprawdź `failedReason` i `subscriptionId`.
2. **Audit:** `https://admin.<host>/audit?category=ADMIN_OPS` (filtr action `PROVISIONING_*`) → potwierdź `category: transient | permanent`.
3. **Klient:** `subscriptionId` → `https://admin.<host>/customers/<userId>` → karta usługi pokazuje stage `failed`.
4. **Decyzja:**
   - *Transient permanent* (np. domain exists): otwórz ticket z klientem przed retry — domena może wymagać ręcznej zmiany.
   - *Wszystko inne*: kliknij **Retry** w admin queue. Idempotency zadba o brak podwójnego konta.
5. **Brak Account po `subscriptionId`** ale `failed` — bezpieczny retry. Runner sam zwoła DA (sprawdzi że account nie istnieje) i ustawi stage = `running`.
6. **Account istnieje, ale subskrypcja nie ACTIVE** — retry promuje subskrypcję do `ACTIVE` bez wywołania DA (krok recovery), audit `PROVISIONING_RECOVERED_FROM_PARTIAL`.
7. **Wallet refund.** Hard-fail provisioningu walletowego automatycznie zwraca środki (`WalletTxType.REFUND`, `idempotencyKey=sub-<id>-initial-refund`) i przywraca status `PENDING_PAYMENT`. Klient widzi to w portfelu.

**Testy awarii DA** (`apps/api/test/`, do rozbudowy w follow-up):

| Scenariusz | Symulacja | Oczekiwane zachowanie |
|------------|-----------|----------------------|
| **Timeout** | `nc -l` na porcie DA + 30 s sleep | 3 retry z exp backoff, każdy log `PROVISIONING_RETRY_SCHEDULED`; po wyczerpaniu — refund + `PENDING_PAYMENT`. |
| **Bad credentials** | `DA_PASSWORD` zafałszowane | 1 próba (permanent), hard-fail, audit, mail do supportu. |
| **No capacity** | Wszystkie węzły `MAINTENANCE` lub w 100% wysycone | `ServiceUnavailableException` w runnerze, klient widzi „brak wolnych węzłów”, retry; admin manualnie zwalnia węzeł i klika **Retry**. |

**Pamiętaj:** restart API (np. deploy) powoduje że BullMQ przejmie joby z Redisa — żaden job nie znika. Joby zakończone (completed) trzymane są ostatnie 1000, błędne 5000. To wystarcza do operacyjnego runbooka.

## Mailing (SMTP) — Postfix na serwerze panelu

Verris świadomie nie korzysta z zewnętrznych dostawców (Resend / Postmark / SES). Wszystkie maile transakcyjne wychodzą przez **Postfix uruchomiony lokalnie na serwerze control-plane**, podpisane DKIM przez `opendkim`. Daje to:

- pełną kontrolę nad treścią, retry i kolejką (`mailq`),
- brak zewnętrznych zależności / kosztów / SLA,
- jeden wpis SPF / DKIM w DNS panel-domeny zamiast osobnych dla każdego serwisu.

API łączy się z Postfixem przez `localhost:25` bez auth (zaufane `mynetworks = 127.0.0.0/8`). Provider w kodzie (`apps/api/src/mail/smtp-mailer.provider.ts`) automatycznie wykrywa `SMTP_HOST=localhost` i przełącza się w tryb plain TCP, no-AUTH.

### Lista maili wysyłanych aktualnie

| Trigger | Adresat | Plik wywołujący |
|---------|---------|-----------------|
| Klient utworzył ticket | klient | `tickets.service.ts` (`newTicketCreatedTemplate`) |
| Klient utworzył ticket z assignee | przypisany staff | `tickets.service.ts` |
| Klient odpowiedział w tickecie | przypisany staff | `tickets.service.ts` |
| Staff odpowiedział w tickecie | klient | `tickets.service.ts` |
| Zmiana statusu ticketu | klient | `tickets.service.ts` (`ticketStatusChangedTemplate`) |
| Admin ręcznie kredytuje portfel | klient | `billing.service.ts` (`adminCreditNotificationTemplate`) |
| 5+ nieudanych logowań na email/IP | `SECURITY_ALERT_EMAIL` | `suspicious-activity.service.ts` |

Wszystkie szablony używają wspólnego `email-shell.ts` (HTML + plaintext, branding Verris, footer compliance). Pełna roadmapa pozostałych maili (potwierdzenia płatności, doładowania, RODO etc.) — `docs/mail/AUDIT.md`.

### Instalacja Postfix + opendkim na panelu (Ubuntu 24.04)

```bash
# Konto poczty: domena, helo
HOST_NAME=panel.verris.pl
MAIL_DOMAIN=verris.pl

# 1) Instalacja paczek
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  postfix postfix-pcre opendkim opendkim-tools mailutils

# 2) Konfiguracja Postfix — outgoing only, nasłuch tylko na localhost
postconf -e "myhostname = ${HOST_NAME}"
postconf -e "mydomain = ${MAIL_DOMAIN}"
postconf -e "myorigin = \$mydomain"
postconf -e "inet_interfaces = loopback-only"
postconf -e "inet_protocols = ipv4"
postconf -e "mydestination = "                             # nic nie odbieramy lokalnie
postconf -e "mynetworks = 127.0.0.0/8 [::1]/128"
postconf -e "smtpd_relay_restrictions = permit_mynetworks reject_unauth_destination"
postconf -e "smtp_tls_security_level = may"                # TLS opportunistic na egress
postconf -e "smtp_tls_loglevel = 1"
postconf -e "smtputf8_enable = yes"
# Outbound MX hostname używany w EHLO — musi się rozwijać do publicznego IP serwera
postconf -e "smtp_helo_name = ${HOST_NAME}"

# 3) opendkim — klucz dla domeny
mkdir -p /etc/opendkim/keys/${MAIL_DOMAIN}
opendkim-genkey -b 2048 -d ${MAIL_DOMAIN} -D /etc/opendkim/keys/${MAIL_DOMAIN}/ -s panel -v
chown -R opendkim:opendkim /etc/opendkim/keys
chmod 600 /etc/opendkim/keys/${MAIL_DOMAIN}/panel.private

cat > /etc/opendkim.conf <<EOF
Syslog                  yes
UMask                   002
Mode                    s
Canonicalization        relaxed/simple
Domain                  ${MAIL_DOMAIN}
Selector                panel
KeyFile                 /etc/opendkim/keys/${MAIL_DOMAIN}/panel.private
Socket                  inet:8891@localhost
PidFile                 /run/opendkim/opendkim.pid
OversignHeaders         From
EOF

# 4) Połącz Postfix z opendkim (milter)
postconf -e "milter_default_action = accept"
postconf -e "smtpd_milters = inet:localhost:8891"
postconf -e "non_smtpd_milters = inet:localhost:8891"

systemctl enable --now opendkim postfix
systemctl restart postfix
```

### DNS na poziomie verris.pl

Po instalacji opendkim wypisz publiczną część klucza:

```bash
cat /etc/opendkim/keys/verris.pl/panel.txt
```

Wstaw 4 rekordy DNS:

| Typ  | Nazwa                          | Wartość                                                                      |
|------|--------------------------------|------------------------------------------------------------------------------|
| **A**    | `panel.verris.pl`             | `<publiczne IP control-plane>` (już powinno być)                              |
| **MX**   | `verris.pl`                    | `10 panel.verris.pl.` *(opcjonalnie — wystarcza dla SMTP-out, MX nie jest wymagane)* |
| **TXT**  | `verris.pl` (SPF)              | `v=spf1 ip4:<publiczne IP control-plane> -all`                                 |
| **TXT**  | `panel._domainkey.verris.pl`   | wartość z `panel.txt` (zaczyna się od `v=DKIM1; k=rsa; p=…`)                    |
| **TXT**  | `_dmarc.verris.pl`             | `v=DMARC1; p=quarantine; rua=mailto:postmaster@verris.pl; adkim=s; aspf=s`    |

> **Uwaga**: jeśli serwer panelu siedzi za Cloudflare, otwórz na firewallu **wyjściowy** port 25 (Hetzner i OVH domyślnie blokują outgoing 25 — odblokuj w panelu hostingowym przed deploymentem).

### `.env.prod` na panelu

Wystarczy minimum:

```
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_FROM_ADDRESS=noreply@verris.pl
SMTP_FROM_NAME=Verris

# Opcjonalnie — adres pod który lecą alerty bezpieczeństwa (5+ failed logins)
SECURITY_ALERT_EMAIL=security@verris.pl
```

`SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE` można pominąć — provider auto-detect localhost daje `secure=none` i pomija AUTH.

### Smoke test po deploy

```bash
# 1) Z poziomu API kontener'a (lub serwera) — testowy mail
docker compose -f docker-compose.prod.yml exec api node -e "
require('./dist/main.js'); // odpalonej apki nie ruszamy — to tylko import
" && echo "(używamy panelu — patrz niżej)"

# 2) W praktyce: zaloguj się jako admin, w admin/Klienci kliknij 'Kredytuj +1 K'
#    z dowolnego konta testowego. Klient powinien dostać mail.

# 3) Sprawdź kolejkę
mailq
# powinna być pusta (mail wyszedł).
# Jeśli zastygły wiadomości — `postqueue -p` + zerknij /var/log/mail.log

# 4) Test deliverability
echo "test treści" | mail -s "Verris SMTP smoke" -a "From: noreply@verris.pl" \
  test-pl-2026@mail-tester.com
# Otwórz https://www.mail-tester.com/test-pl-2026, oczekiwany wynik: ≥ 8/10
# (DKIM pass, SPF pass, DMARC align).
```

### Co zrobić gdy port 25 jest zablokowany u dostawcy

Część dostawców (Hetzner Cloud — domyślnie, OVH — dla nowych kont) blokuje outgoing 25 w pierwszych dniach. Trzy opcje:

1. **Otwarcie w panelu hostingowym** — preferowane. Hetzner: ticket „enable port 25"; OVH: czas oczekiwania ~72h.
2. **Smarthost przez relay innego dostawcy** — Postfix dalej zostaje (DKIM/queue/retries lokalnie), ale wysyłka leci przez np. dedykowany relay-host na porcie 587 z auth. To jest pull-back do "miniresend" — używaj tylko jako tymczasowy mostek.
3. **Switch na port 587 publicznego MTA** — np. własny mailserver na osobnym IP z odblokowaną 25.

### Logi i monitoring

- `/var/log/mail.log` — logi Postfix.
- `journalctl -u opendkim` — logi DKIM milter.
- Probe `SMTP localhost:25` w status-page — dorzuć w `/admin/status/probes` jako `severity=MINOR`, `isPublic=false`. Daje alerting jeśli Postfix padnie.

## Stripe API upgrade (runbook)

Pin domyślnej wersji API Stripe leży w `apps/api/src/billing/stripe/stripe.client.ts` jako `DEFAULT_STRIPE_API_VERSION`. Aktualnie: `2026-04-22.dahlia`. Każdy request i webhook musi mieć tę samą wersję — inaczej payloady różnią się shape'm.

> Zanim cokolwiek upgrade'ujesz, przeczytaj `STRIPE_DAHLIA_COMPATIBILITY.md` w katalogu repo. Tam jest aktualna lista pól które używamy z fallbackami cross-version.

### Procedura upgrade na nową **major** Stripe (np. dahlia → next-major)

1. **Audit kodu pod nową wersję** — dla każdego pola które używamy w `stripe.client.ts`, `billing.service.ts`, `subscriptions.service.ts`, `invoices.service.ts`:

   - Sprawdzić [Stripe changelog](https://docs.stripe.com/changelog) sekcję nowego majora.
   - Przejść każdy „Breaking change" i wyznaczyć helper z `stripe.client.ts` (`getSubscriptionPeriod`, `getInvoiceSubscriptionId`, `getInvoiceClientSecret`, …) który trzeba zaktualizować lub dopisać.
   - Dodać typ + helper z fallbackiem do poprzedniej majora (cross-version).

2. **Update `DEFAULT_STRIPE_API_VERSION` w stagingu** — w branchu, ale zostaw produkcję pinowaną na poprzednią. Można też ustawić `STRIPE_API_VERSION=<new_version>` w `.env.staging`.

3. **Stripe CLI smoke test** — z planem z `STRIPE_DAHLIA_COMPATIBILITY.md` → "Smoke test plan", ale z `--api-version <new_version>`. Wszystkie 7 scenariuszy MUSI być GREEN przed promocją.

4. **Promocja webhooków** — w Stripe Dashboard → Workbench → Webhooks → endpoint `/billing/stripe/webhook` → upgrade API version. Stripe ma 72h okna na rollback.

5. **Promocja default API version konta** — w Stripe Dashboard → Workbench → Overview → "API versions" → upgrade. Też 72h okno na rollback.

6. **Deploy na prod** — merge brancha, redeploy API. `STRIPE_API_VERSION` w `.env.prod` zostawiamy puste (default z kodu) **lub** explicit ustawiamy nową wartość (audit trail w env).

7. **Obserwuj 24h** — Workbench → Webhooks → success rate musi być 100%. Logi API: brak "malformed payload", "cannot read billing period", "cannot map invoice".

8. **Rollback (gdy regresja)** — w `.env.prod` ustaw `STRIPE_API_VERSION=2026-04-22.dahlia` (poprzedni major), restart API. W Stripe Dashboard → rollback webhook + default API version (jeśli w 72h oknie).

9. **Cleanup po stabilnym 7 dniach** — `STRIPE_API_VERSION` env może zostać usunięte z `.env.prod`, fallbacki do poprzedniej majora można usunąć z helpers'ów (PR osobny, aby trzymać git history czyste).

### Monthly minor upgrade (np. `2026-04-22.dahlia` → `2026-05-XX.dahlia`)

Bezpieczne, minor zmiany są backward-compatible. Wystarczy:

1. Upgrade w Stripe Dashboard → Workbench (default API + webhook).
2. Zmiana `DEFAULT_STRIPE_API_VERSION` w kodzie i deploy (lub `STRIPE_API_VERSION` env).
3. Smoke test: 1 zakup subskrypcji, 1 top-up, 1 invoice.paid webhook. Bez full 7-scenariuszowego testu.

### Wartości na produkcji (current)

| Klucz | Wartość |
| --- | --- |
| `DEFAULT_STRIPE_API_VERSION` (kod) | `2026-04-22.dahlia` |
| `STRIPE_API_VERSION` (env, opcjonalne) | nieustawione (używa default z kodu) |
| Webhook endpoint API version | musi być **identyczny** z requestami |
| Stripe Dashboard default API version | musi być **identyczny lub kompatybilny** (bo automated jobs typu auto-renewal generują webhooki na tej wersji) |
---

## Ograniczenie: pojedyncza replika API (crony + rate limiting)

> **Audit F-14 (2026-06-09).** API uruchamiamy w **dokładnie jednej replice**.

Dwa mechanizmy w API zakładają jeden proces:

1. **Crony `@nestjs/schedule`** (~20 zadań: autoscaling engine co 1 min, block billing co 5 min,
   renewal co 1 h, retention 04:00, …) **nie mają leader-election** — druga replika
   oznaczałaby podwójne wykonania (podwójne wywołania DA, wyścigi na portfelu mimo
   `FOR UPDATE` — idempotency by uratowała pieniądze, ale nie spam e-mail/audyt).
2. **Rate limiting** (`RateLimitGuard`) trzyma okna w pamięci procesu.

**Skalowanie dozwolone:** wertykalne (CPU/RAM kontenera `api`).
**Przed skalowaniem horyzontalnym wymagane:** distributed lock (Redis/redlock) dla każdego
crona + przeniesienie rate-limit store do Redis. Do tego czasu w `docker-compose.prod.yml`
nie ustawiaj `deploy.replicas > 1` dla `api`.

## Migracje audytu 2026-06-09

Po wdrożeniu tego release uruchom:

```
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
```

Nowe migracje:
- `20260609120000_server_da_tls_verification` — `Server.daAllowInvalidCert`
  (istniejące węzły z DA dostają `true` — zachowanie bez zmian; audyt węzła flaguje
  do czasu wdrożenia certu na :2222 i wyłączenia opcji),
- `20260609121000_server_hardening_status` — raport hardeningu z agenta,
- `20260609122000_stripe_webhook_event_dedupe` — dedupe webhooków Stripe.

**Identity tokeny węzłów (F-03):** lazy-migracja — przy pierwszym żądaniu agenta po
deployu wpis w DB jest podnoszony do SHA-256 (log `Upgraded legacy plaintext identity
token`). Węzły NIE wymagają żadnej akcji.

## VPN WireGuard dla paneli wewnętrznych (ETAP 8)

Panele **admin** i **staff** mogą (i powinny) być dostępne wyłącznie przez VPN.
Zarządzanie dostępami pracowników odbywa się w panelu admina (**/vpn**):
generowanie konfiguracji per urządzenie (klucz prywatny zwracany jednorazowo,
nigdy nie zapisywany), cofanie dostępu działa do ~1 min.

Kolejność wdrożenia (WAŻNA — inaczej można odciąć sobie panel):

1. Na control-plane: `bash ops/scripts/vpn-wireguard-setup.sh`
   (instaluje wireguard-tools, generuje klucze serwera, stawia `wg0` 10.88.0.1/24:51820/udp).
2. Wypisane wartości wpisz do `.env.prod`:
   `VPN_WG_SERVER_PUBLIC_KEY`, `VPN_WG_ENDPOINT`, `VPN_SYNC_TOKEN`
   oraz zalecane `VPN_WG_CLIENT_ALLOWED_IPS=10.88.0.0/24,<public-ip>/32`
   (publiczny IP control-plane — żeby ruch do paneli szedł tunelem).
3. `docker compose ... up -d api` (restart API z nowym env).
4. Timer synchronizacji peerów na hoście:
   `bash ops/scripts/vpn-sync-peers.sh --install`
   → uzupełnij `/etc/default/verris-vpn-sync` (URL API od strony hosta + token).
5. Panel admin → **VPN (dostęp paneli)** → wygeneruj profil dla SIEBIE,
   zaimportuj do aplikacji WireGuard, połącz się i sprawdź, że panele działają.
6. Dopiero teraz włącz restrykcję: `CADDY_INTERNAL_ALLOW_CIDR=10.88.0.0/24`
   w `.env.prod` + `docker compose ... up -d caddy`. Od tej chwili
   staff./admin. odpowiadają 403 spoza tunelu.

Rollback awaryjny (utrata dostępu): na hoście usuń/zmień
`CADDY_INTERNAL_ALLOW_CIDR` w `.env.prod` i `docker compose ... up -d caddy`.

Audyt: każde utworzenie/cofnięcie peera trafia do logu audytowego
(`VPN_PEER_CREATED` / `VPN_PEER_REVOKED`).
