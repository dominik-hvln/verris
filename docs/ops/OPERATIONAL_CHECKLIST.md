# OPERATIONAL CHECKLIST — wgranie panelu Verris na serwer

> Lista zadań **operacyjnych**, których nie da się wykonać z poziomu kodu.
> Wykonywać po wgraniu builda na serwer panelu (control-plane) i pierwszego
> compute-node z DirectAdmin.
>
> Wszystko poniżej powinno być zrobione **przed** zaproszeniem pierwszego
> klienta zewnętrznego (LIVE).

Legenda: `🔴` blocker LIVE, `🟡` ważne (rób w pierwszym tygodniu po LIVE),
`🟢` nice-to-have / optymalizacja.

---

## 1. Sekrety i konfiguracja środowiska

### 1.1. Plik `.env.prod` na control-plane 🔴

Wymagane zmienne przed pierwszym uruchomieniem `apps/api`:

```bash
# Core
NODE_ENV=production
PORT=4000
PUBLIC_API_URL=https://api.verris.pl
CLIENT_PANEL_URL=https://panel.verris.pl
ADMIN_PANEL_URL=https://admin.verris.pl
STAFF_PANEL_URL=https://staff.verris.pl
STATUS_PAGE_URL=https://status.verris.pl

# Database
DATABASE_URL=postgresql://verris:<...>@127.0.0.1:5432/verris?schema=public

# Redis (BullMQ + provisioning queue)
REDIS_URL=redis://127.0.0.1:6379/0

# JWT / Auth
JWT_SECRET=<openssl rand -base64 64>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-04-22.dahlia
STRIPE_PUBLIC_KEY=pk_live_...

# SMTP (panel-local Postfix — patrz sekcja 4)
SMTP_HOST=127.0.0.1
SMTP_PORT=25
SMTP_SECURE=none
# (SMTP_USER / SMTP_PASS pozostawić puste przy localhost)
SMTP_FROM_ADDRESS=panel@verris.pl
SMTP_FROM_NAME=Verris

# Object storage (MinIO) — wszystkie uploady (tickety, eksporty RODO, DPA PDF)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=verris-panel
S3_SECRET_KEY=<openssl rand -base64 32>
S3_REGION=eu-central-1
S3_USE_SSL=false
S3_PATH_STYLE=true
S3_BUCKET_TICKET_ATTACHMENTS=verris-ticket-attachments
S3_BUCKET_DATA_EXPORTS=verris-data-exports
S3_BUCKET_DPA_PDFS=verris-dpa-pdfs
S3_BUCKET_INVOICES=verris-invoices
DATA_EXPORT_TEMP_DIR=/tmp/verris-data-exports

# MinIO — root credentials (do `mc` i bootstrap-containera; nie wystawiaj
# kluczy root do api — utwórz dedykowanego usera przez `mc admin user add`)
MINIO_ROOT_USER=verris-root
MINIO_ROOT_PASSWORD=<openssl rand -base64 32>

# Observability
METRICS_AUTH_TOKEN=<openssl rand -hex 32>
SECURITY_ALERT_EMAIL=security@verris.pl

# Stripe redirects
STRIPE_SUCCESS_URL=https://panel.verris.pl/dashboard/billing?topup=ok
STRIPE_CANCEL_URL=https://panel.verris.pl/dashboard/billing?topup=cancel
```

- [ ] `🔴` plik `.env.prod` istnieje i ma `chmod 600`, właściciel `root:root`
      (lub user usługi systemd)
- [ ] `🔴` `JWT_SECRET` wygenerowany świeżo, **nie** hardcode'owany ani
      commitowany do gita
- [ ] `🔴` `STRIPE_SECRET_KEY` to klucz **live** (`sk_live_...`), nie test
- [ ] `🔴` `STRIPE_WEBHOOK_SECRET` zgrany z dashboardu Stripe **po** dodaniu
      endpointa webhooka (`https://api.verris.pl/billing/webhook`)
- [ ] `🔴` `METRICS_AUTH_TOKEN` różny od dev'owego, znany tylko Prometheusowi
- [ ] `🟡` `.env.prod` zsynchronizowany z menedżerem haseł (1Password / Vault)
      i osoba zastępcza ma do niego dostęp

### 1.2. Stripe Dashboard 🔴

- [ ] `🔴` API version w "Developers → API keys" = `2026-04-22.dahlia`
- [ ] `🔴` Webhook endpoint dodany: `https://api.verris.pl/billing/webhook`
- [ ] `🔴` Subskrypcje wybranych eventów w webhooku:
      - `checkout.session.completed`
      - `checkout.session.async_payment_succeeded`
      - `customer.subscription.created`
      - `customer.subscription.updated`
      - `customer.subscription.deleted`
      - `invoice.created`
      - `invoice.finalized`
      - `invoice.payment_succeeded`
      - `invoice.paid`
      - `invoice.payment_failed`
      - `payment_intent.succeeded`
      - `payment_intent.payment_failed`
- [ ] `🔴` Test webhooka: `Send test webhook` z dashboardu → 200 OK
- [ ] `🟡` Tax & VAT skonfigurowane (PL → 23 %, kraje UE → reverse charge B2B)
- [ ] `🟡` Payment methods włączone: Card, BLIK, Przelewy24, Apple/Google Pay
- [ ] `🟡` Adresy zwrotne (refund policy) zgodne z regulaminem na verris.pl
- [ ] `🟢` Tryb "Statement Descriptor" ustawiony na `VERRIS HOSTING`

---

## 2. Baza danych i migracje 🔴

- [ ] `🔴` PostgreSQL ≥ 15 zainstalowany, użytkownik + baza `verris` utworzone
- [ ] `🔴` `pnpm --filter @verris/database prisma migrate deploy` — migracje
      uruchomione bez błędu
- [ ] `🔴` Po migracji uruchomić **seed legalnych dokumentów** (regulamin,
      polityka, cookies, DPA) z draftów w `docs/legal/v1/`:
      - skrypt admin-side: `pnpm --filter @verris/api start:cli legal:publish`
        (lub przez admin panel `Compliance → Legal documents → Publish`)
- [ ] `🔴` Po publikacji dokumentów: pierwsze konto adminowe musi zaakceptować
      regulamin + politykę przed wpuszczeniem klientów
- [ ] `🟡` Backup PostgreSQL — **codzienny** dump do osobnego storage:

      ```cron
      0 2 * * * pg_dump -Fc verris | gzip > /var/backups/verris/db-$(date +\%Y\%m\%d).sql.gz
      ```

- [ ] `🟡` Retencja backupów = 30 dni; co najmniej 1 backup off-site (S3/B2)
- [ ] `🟡` Test restoru z backupu na staging co kwartał
- [ ] `🟢` `pg_stat_statements` włączony do tracking slow query

---

## 3. Storage obiektowy — MinIO (S3-compatible) 🔴

Wszystkie uploady (załączniki ticketów, eksporty RODO, PDF-y DPA, w
przyszłości faktury) trafiają do bucketów MinIO uruchomionego jako serwis
`minio` w `docker-compose.prod.yml`. Lokalny FS nie jest już używany do
długoterminowego przechowywania (poza tymczasowym katalogiem
`DATA_EXPORT_TEMP_DIR` używanym tylko podczas budowania ZIP-a).

### 3.1. Uruchomienie i bootstrap 🔴

- [ ] `🔴` `MINIO_ROOT_USER` i `MINIO_ROOT_PASSWORD` ustawione w `.env.prod`
      (silne hasło, ≥ 32 znaki; trzymane w 1Password / Bitwarden)
- [ ] `🔴` Wolumen `minio_data` mapowany na dysk z **dużym zapasem miejsca**
      (≥ 100 GB na start; eksporty RODO + załączniki ticketów rosną szybko)
- [ ] `🔴` Po pierwszym `docker compose up -d` sprawdzić:
      `docker compose logs minio-bootstrap` → `MinIO buckets ready.`
      i istnienie 4 bucketów: `verris-ticket-attachments`,
      `verris-data-exports`, `verris-dpa-pdfs`, `verris-invoices`
- [ ] `🔴` Utworzyć osobnego usera dla API (zamiast root):
      ```bash
      docker compose exec minio mc alias set local http://127.0.0.1:9000 \
        "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
      docker compose exec minio mc admin user add local verris-panel <accessKey> <secretKey>
      docker compose exec minio mc admin policy attach local readwrite --user verris-panel
      ```
      Wpisać `<accessKey>`/`<secretKey>` jako `S3_ACCESS_KEY`/`S3_SECRET_KEY`
      w `.env.prod` (nigdy nie używać `MINIO_ROOT_USER` w api).
- [ ] `🟡` Wystawienie konsoli MinIO przez Caddy z `forward_auth` do
      `/auth/grafana-validate` (jak Grafana) — opcjonalne, tylko dla
      adminów. Jeśli nie wystawiamy publicznie, dostęp przez SSH tunnel:
      `ssh -L 9001:127.0.0.1:9001 root@panel.verris.pl`.

### 3.2. Backup MinIO 🔴

- [ ] `🔴` Codzienny backup `minio_data` volume → off-site (S3/B2/inny serwer)
      przez `mc mirror local/<bucket> backup/<bucket>` lub `restic` na cały
      `/var/lib/docker/volumes/<stack>_minio_data/_data`
- [ ] `🟡` Retencja: 30 dni codzienne + 12 mc miesięczne (faktury VAT 5 lat
      zostają w bucketcie `verris-invoices` per default — tylko backup off-site
      dla disaster recovery)
- [ ] `🟡` Test restoru raz na kwartał na staging

### 3.3. Lifecycle policies 🟡

Bootstrap container automatycznie aplikuje 7-dniową regułę expiry na
`verris-data-exports`. Sprawdzić że działa (po 7 dniach pliki znikają):

- [ ] `🟡` `mc ilm rule ls verris/verris-data-exports` zawiera regułę 7d
- [ ] `🟢` Dorzucić quota policy per-user (gdy będą bardzo aktywni
      użytkownicy generujący wiele eksportów)

### 3.4. Migracja istniejących plików (jeśli były) 🔴

Jeżeli przed wgraniem tej wersji istniały już załączniki/eksporty na FS
(np. ze stagingu):

- [ ] `🔴` Smartphone-tryb dry-run:
      `pnpm --filter api cli:storage-migrate-from-fs`
- [ ] `🔴` Apply z usunięciem lokalnych po sukcesie:
      `pnpm --filter api cli:storage-migrate-from-fs -- --apply --unlink-local`
- [ ] `🔴` Po migracji: `find /var/lib/verris/uploads -type f` powinno być
      puste; `du -sh /var/lib/verris/storage/data-exports` ~0 B

---

## 4. Mailing — Postfix + DKIM/SPF/DMARC 🔴

> Pełny runbook: `DEPLOY.md` § "Mailing (SMTP) — Postfix na serwerze panelu".
> Skrót zadań do wykonania:

### 4.1. Instalacja 🔴

- [ ] `🔴` `apt install postfix opendkim opendkim-tools mailutils`
- [ ] `🔴` Postfix zbindowany na `127.0.0.1:25` (nie publicznie)
- [ ] `🔴` `mynetworks = 127.0.0.0/8 [::1]/128` — żadnych otwartych relay'ów
- [ ] `🔴` `myhostname = panel.verris.pl`, `myorigin = $myhostname`
- [ ] `🔴` `smtp_tls_security_level = may` (TLS przy wychodzeniu)

### 4.2. DKIM (OpenDKIM) 🔴

- [ ] `🔴` Klucz DKIM 2048-bit wygenerowany w `/etc/opendkim/keys/verris.pl/panel.private`
- [ ] `🔴` Selektor `panel`, plik klucza public `panel.txt`
- [ ] `🔴` Rekord DNS `panel._domainkey.verris.pl` TXT z zawartości `panel.txt`
- [ ] `🔴` `KeyTable` + `SigningTable` skonfigurowane
- [ ] `🔴` `opendkim-testkey -d verris.pl -s panel -vvv` → `key OK`

### 4.3. DNS (zone `verris.pl`) 🔴

- [ ] `🔴` `A` `panel.verris.pl` → IP serwera panelu
- [ ] `🔴` `MX` (jeśli nie używamy Workspace) lub MX delegacja do Workspace
- [ ] `🔴` `SPF`: `v=spf1 ip4:<IP serwera> include:_spf.google.com -all`
      (jeśli mamy Google Workspace dla `kontakt@`/`rodo@`)
- [ ] `🔴` `DKIM`: `panel._domainkey.verris.pl` TXT z `opendkim-tools`
- [ ] `🔴` `DMARC`: `_dmarc.verris.pl` TXT
      `v=DMARC1; p=quarantine; rua=mailto:dmarc@verris.pl; ruf=mailto:dmarc@verris.pl; fo=1; adkim=s; aspf=s`
- [ ] `🔴` `PTR` (rDNS) IP serwera panelu → `panel.verris.pl`
      (jeśli VPS — request u providera, np. Hetzner Console → reverse DNS)

### 4.4. Smoke testy 🔴

- [ ] `🔴` `swaks --to test@mail-tester.com --from panel@verris.pl --server 127.0.0.1:25 --header 'Subject: Verris test'`
- [ ] `🔴` mail-tester.com → score **≥ 9/10**, SPF/DKIM/DMARC OK
- [ ] `🔴` Po starcie API — wyzwolić mailem: rejestracja konta testowego →
      mail "potwierdzenie rejestracji" musi dotrzeć (sprawdzić w Gmailu folder
      Główny, nie Spam)
- [ ] `🟡` Dodać alert Prometheus na `mail_send_failed_total > 0` (po dodaniu
      metryk mailingu w Sprincie 3)

### 4.5. Procedura w razie blokady 🟡

- [ ] `🟡` Plan B: jeśli IP wpadnie na blacklistę (Spamhaus, Barracuda),
      przełączamy `SMTP_HOST` na zewnętrzny relay (Resend, Postmark, AWS SES)
      bez zmian w kodzie — `SmtpMailerProvider` obsługuje TLS+AUTH out of the box.
      Dokument awaryjny: `docs/runbooks/smtp-fallback.md` (do napisania kiedy
      pojawi się taka potrzeba).

### 4.6. Postfix throttling — kampanie marketingowe 🔴

> Worker `MarketingCampaignDispatcher` puszcza paczki po **100 maili na minutę**
> (jedna kampania na raz). Postfix musi mieć dopasowane limity, żeby:
> 1) nie wpaść w "burst" rate-limit u Gmaila (max ~250 wiadomości/min/IP),
> 2) nie wysłać 10k maili w 10s i nie zostać sklasyfikowanym jako spammer.

W `/etc/postfix/main.cf`:

```conf
# Smooth-out wysyłki: max 30 połączeń SMTP równocześnie do tego samego MX,
# pauza 1s między równoległymi sesjami, 200 wiadomości na połączenie.
smtp_destination_concurrency_limit = 5
smtp_destination_rate_delay = 1s
smtp_destination_recipient_limit = 1
default_destination_concurrency_limit = 10

# Anty-burst — zwalnia kolejkę gdy rośnie szybciej niż MX akceptuje.
# Wartości startowe; tunować po obserwacji `mailq` w produkcji.
qmgr_message_active_limit = 5000
qmgr_message_recipient_limit = 5000
in_flow_delay = 1s
```

- [ ] `🔴` Limity wpisane do `main.cf`, `systemctl reload postfix`
- [ ] `🔴` Test: `swaks` 50 wiadomości → `mailq` powinno mieć krótką kolejkę,
      nie wszystko od razu wyleci.
- [ ] `🟡` Po pierwszej kampanii (>1k odbiorców) zweryfikować postfix logs
      (`/var/log/mail.log` lub `journalctl -u postfix`) — szukać `deferred`,
      `bounce` rate. Jeśli >5% bounce — przerwać i sprawdzić MX target.
- [ ] `🟡` Po 1 miesiącu produkcji rozważyć `postscreen` z greylistingiem
      przychodzącym (jeśli włączymy `kontakt@verris.pl` z Postfixa, nie z
      Workspace).

### 4.7. EmailLog + List-Unsubscribe — operacja 🔴

- [ ] `🔴` Endpoint `GET /unsubscribe?token=...` musi być publicznie dostępny
      przez Caddy/nginx (BEZ `Authorization` headera). Sprawdzić że
      `https://api.verris.pl/unsubscribe?token=test` zwraca JSON 404 (nie 401).
- [ ] `🔴` Header `List-Unsubscribe` w mailu marketingowym widoczny:
      `swaks` z testowym mailem → `cat | grep List-Unsubscribe`.
- [ ] `🔴` `EmailLog` w bazie ma wpisy ze statusem `SENT` po pierwszych
      mailach — jeśli wszystko `QUEUED` → MailerService nie kończy
      finalize'u, sprawdzić logi API.
- [ ] `🟡` Cron `MarketingCampaignDispatcher` działa co minutę — sprawdzić
      logi API: `journalctl -u verris-api | grep MarketingCampaignDispatcher`.
- [ ] `🟡` Admin viewer `GET /admin/email-log` zwraca paginowane wyniki —
      przed pierwszą kampanią zweryfikować w admin-panelu UI.

---

## 5. DirectAdmin — compute node 🔴

- [ ] `🔴` Pierwsza maszyna compute-node skonfigurowana, DirectAdmin
      uruchomiony i zaktualizowany do **najnowszej** wersji 1.66+
- [ ] `🔴` Login admin DA stworzony, hasło w `.env.prod` (`DA_*` w `Server`
      table — wpisywane przez admin panel `Servers → Add server`)
- [ ] `🔴` Test połączenia z panelu: `Admin → Servers → Test connection` → OK
- [ ] `🔴` "Bootstrap token" (jednorazowy) wygenerowany na panelu i zapisany
      w `compute-node:/etc/verris/bootstrap.json`
- [ ] `🔴` `verris-agent` (jeśli istnieje) lub cron-skrypt do raportowania
      `serverHealth`/probes do panelu — działa
- [ ] `🟡` SSL DA podpisany ważnym certyfikatem (Let's Encrypt) — nie
      self-signed, panel respektuje `daUseTls`
- [ ] `🟡` IP whitelisting: panel → DA (port DA, np. 2222) tylko z IP
      control-plane
- [ ] `🟢` Monitoring zewnętrzny (UptimeRobot / Pingdom) → DA HTTPS endpoint

---

## 6. RODO — kroki prawne i operacyjne 🔴

### 6.1. Akceptacja drafty → publikacja 🔴

- [ ] `🔴` **Prawnik zewnętrzny przejrzał** drafts w `docs/legal/v1/`:
      - `terms.md` (regulamin)
      - `privacy.md` (polityka prywatności)
      - `cookies.md`
      - `dpa.md` (Data Processing Agreement)
- [ ] `🔴` Po akceptacji prawnika: publikacja przez admin panel
      (`Compliance → Legal docs → Publish`) — od tego momentu rejestracja
      pyta o akceptację, panel wymusza re-consent po zmianie wersji
- [ ] `🔴` Wersjonowanie: pierwsza publikacja = `1.0.0`, kolejne `1.1.0`,
      `2.0.0` przy major change

### 6.2. UODO / kontakt RODO 🔴

- [ ] `🔴` Adres `rodo@verris.pl` istnieje, monitorowany min. 1× dziennie
      przez wyznaczoną osobę (Inspektor Ochrony Danych lub Owner)
- [ ] `🔴` `security@verris.pl` istnieje (alerty z `SECURITY_ALERT_EMAIL`)
- [ ] `🔴` `dmarc@verris.pl` skrzynka dla raportów DMARC RUA/RUF
- [ ] `🟡` Plan komunikacji w razie naruszenia (Art. 33 RODO — 72h):
      dokumentacja w `docs/runbooks/data-breach.md`
- [ ] `🟡` Aktualne dane spółki Verris (NIP, adres, KRS) wstawione
      w `apps/api/src/compliance/dpa-pdf.service.ts` (linie z `[uzupełnij dane spółki Verris]`)
      — to placeholder do uzupełnienia w kodzie!
- [ ] `🟢` Rejestr czynności przetwarzania (RCPD) — szablon w
      `docs/legal/internal/rcpd.md` (do wypełnienia poza panelem)

### 6.3. Subprocessorzy DPA 🔴

Lista podwykonawców do uzupełnienia w `docs/legal/v1/dpa.md` po akceptacji:

- [ ] `🔴` Stripe Payments Europe (procesor płatności)
- [ ] `🔴` Hetzner / OVH / inny dostawca infrastruktury — wpisać konkretnego
- [ ] `🔴` (opcjonalnie) Google Workspace — jeśli używamy do `kontakt@verris.pl`
- [ ] `🟡` Procedura informowania klientów B2B o nowych subprocessorach
      (30-dniowy okres sprzeciwu) — opisana w DPA

---

## 7. Bezpieczeństwo 🔴

### 7.1. HTTPS / Reverse proxy 🔴

- [ ] `🔴` Nginx / Caddy przed API — terminacja TLS, HTTP→HTTPS redirect
- [ ] `🔴` Certyfikaty Let's Encrypt — auto-renew (`certbot renew --quiet`
      w cron)
- [ ] `🔴` HSTS włączony: `max-age=63072000; includeSubDomains; preload`
- [ ] `🔴` Cipher suites tylko TLS 1.2+ AEAD; sprawdzić na `ssllabs.com` (A+)
- [ ] `🟡` `Content-Security-Policy` zaostrzony (w `next.config.js` panelu
      i nginx dla statycznych assetów)

### 7.2. Firewall 🔴

- [ ] `🔴` UFW lub `nftables`: 22 (SSH), 80, 443 publiczne; reszta zablokowana
- [ ] `🔴` SSH tylko przez klucz, brak logowania root, fail2ban włączony
- [ ] `🟡` Port 25 (SMTP wychodzący) odblokowany w firewall i u dostawcy
      (Hetzner blokuje 25 dla nowych kont — request unblock przez ticket)

### 7.3. Sekrety i 2FA 🔴

- [ ] `🔴` Pierwszy admin → 2FA TOTP włączone (panel admin → Account → 2FA)
- [ ] `🔴` `JWT_SECRET` rotowany jeśli wcześniej był używany w dev
- [ ] `🔴` Hasła do bazy / Stripe / SMTP w menedżerze haseł, nie w kodzie
- [ ] `🟡` Plan rotacji `JWT_SECRET` (1× rocznie, w okienku konserwacyjnym)

### 7.4. Suspicious activity 🟡

- [ ] `🟡` `SECURITY_ALERT_EMAIL` skonfigurowany — pierwsze logowanie z nowego
      kraju / wiele nieudanych logowań → mail
- [ ] `🟡` Reguły IP blacklist: jeśli IP > 10 nieudanych logowań / 5 min
      → block na 1h (sprawdzić czy `SuspiciousActivityService` jest aktywny)
- [ ] `🔴` Outbound abuse guard: monitoruj i alarmuj nieautoryzowany ruch egress
      (scan/C2). Incydent referencyjny: Hetzner + Spamhaus XBL 2026-06-01
      (`204.168.174.138`, IOC: `216.218.185.162:80`) - runbook
      `docs/ops/HETZNER_ABUSE_2026-06-01.md`
- [ ] `🔴` Firewall egress allow-list wdrozony dla hostow panel/node
      (domyslnie deny, wyjątki tylko dla wymaganych uslug: DNS, apt repo,
      Stripe/API, monitoring, backup). Udokumentuj aktualna polityke.

---

## 8. Schedulery i cron joby — sprawdzić że działają

Po starcie API w prod, sprawdź w logach że uruchomiły się następujące joby
(każdy ma swoją ścieżkę cron — nie wymagają konfiguracji ręcznej, tylko
weryfikacja że są zarejestrowane):

- [ ] `🔴` `AccountDeletionScheduler.runAnonymization` (03:30 daily) —
      anonimizuje konta po 14d karencji
- [ ] `🔴` `AccountDeletionScheduler.runDaPurge` (04:15 daily) —
      hard-purge kont DA 30d po anonimizacji
- [ ] `🔴` `RetentionScheduler` (04:00 daily) — czyszczenie LoginAttempt,
      anonimizacja IP w AuditLog, expirowanie data-exportów
- [ ] `🔴` `WalletLowBalanceScheduler` (co godzinę, akcja 09:00) — alert
      mailowy o niskim stanie portfela (S2.1)
- [ ] `🔴` `RenewalReminderScheduler` (co godzinę) — przypomnienie T-7/3/1
      przed odnowieniem subskrypcji (S2.1)
- [ ] `🔴` `StatusWebhookService.deliverPending` (co minutę) — dostarcza
      status webhooks, retry i finalne `FAILED` po limicie prób
- [ ] `🔴` Compute-node migration worker odpytuje
      `/node/migration-worker/lease` i raportuje `complete/fail` dla
      `FILES_SFTP_RSYNC`, `MYSQL_IMPORT`, `IMAP_SYNC`, `HTTP_POST_CHECK`
- [ ] `🔴` `MarketingCampaignDispatcher` (co minutę) — promote SCHEDULED do
      SENDING + flush 100 maili/min (S2.6). **Wymaga skonfigurowanego
      Postfix throttling 4.6**.
- [ ] `🟡` `WalletAutoTopupScheduler` (każdą godzinę) — re-charge kart
      przy niskim saldzie portfela
- [ ] `🟡` `BillingService` subscription-cancel sweeper (jeśli osobny cron) —
      cancel Stripe subs po anonimizacji konta
- [ ] `🟢` `MigrationWorkerScheduler` (subskrypcji) — działa w tle

Komenda do sprawdzenia w logach:

```bash
journalctl -u verris-api --since today | grep -E 'Scheduler|Cron'
```

---

## 9. Observability 🟡

- [ ] `🟡` Prometheus scrapuje `https://api.verris.pl/metrics` z headerem
      `Authorization: Bearer $METRICS_AUTH_TOKEN`
- [ ] `🟡` Grafana dashboard: HTTP 5xx rate, latency p99, DB pool,
      BullMQ queue length, mail send success
- [ ] `🟡` Loki / journald — agregacja logów `verris-api`, retencja 30 dni
- [ ] `🟡` Alerty (Slack #ops):
      - 5xx rate > 1% przez 5 min
      - DB pool exhausted
      - Stripe webhook failure (429 lub 5xx) > 3 w 5 min
      - SMTP send failure > 0 w 5 min
- [ ] `🟢` Status page (`status.verris.pl`) — public uptime + ostatnie
      incydenty

---

## 10. Smoke test E2E przed LIVE 🔴

Po przejściu wszystkich punktów powyżej, **zanim** dasz panel klientom,
przejdź ręcznie 7 scenariuszy w prod (na koncie testowym):

1. [ ] `🔴` **Rejestracja** — nowe konto, akceptacja regulaminu, mail
      potwierdzający otrzymany.
2. [ ] `🔴` **Doładowanie portfela** — checkout Stripe (BLIK lub karta test),
      ledger się aktualizuje, mail "doładowanie zaksięgowane" przychodzi.
3. [ ] `🔴` **Promo code (FIXED_CREDIT)** — wpisanie kodu w portfelu, kredyt
      pojawia się natychmiast.
4. [ ] `🔴` **Promo code (PERCENT_BONUS)** — wpisanie kodu w koszyku
      doładowania, podgląd bonusu, po zaksięgowaniu Stripe wallet zawiera
      kwotę + bonus.
5. [ ] `🔴` **Subskrypcja** — kupno najtańszego planu, provisioning DA
      kończy się sukcesem (`status=ACTIVE`), strona DA dostępna.
6. [ ] `🔴` **Ticket** — utworzenie zgłoszenia z załącznikiem, mail do staff
      przychodzi, odpowiedź staff → mail do klienta przychodzi.
7. [ ] `🔴` **Eksport danych RODO** — request → mail z linkiem przychodzi,
      ZIP otwiera się, zawiera profile.json + attachments/.
8. [ ] `🔴` **Usunięcie konta RODO** — request → mail "potwierdzenie", po
      14d cron anonimizuje, mail "konto zanonimizowane" przychodzi, DA
      konto faktycznie SUSPENDED, po 30d kasowanie DA.
9. [ ] `🔴` **DPA (B2B)** — zaakceptowanie DPA z poziomu konta z NIP-em,
      mail z linkiem do PDF, PDF zawiera dane firmy klienta i datę akceptacji.

Każdy scenariusz spisać w `docs/qa/smoke-test-prod.md` z datą i imieniem
osoby testującej.

---

## 11. Procedury awaryjne — runbooks do napisania 🟡

Po pierwszym tygodniu działania spisać w `docs/runbooks/`:

- [ ] `🟡` `incident-response.md` — co robi on-call, jak komunikować
- [ ] `🟡` `data-breach.md` — RODO 72h, co i komu zgłosić
- [ ] `🟡` `smtp-fallback.md` — przełączenie na zewnętrzny relay
- [ ] `🟡` `stripe-webhook-replay.md` — odzyskiwanie z dropniętych webhooków
- [ ] `🟡` `db-failover.md` — restore z backupu, promote replica
- [ ] `🟢` `compute-node-add.md` — onboarding nowego serwera DA
- [ ] `🔴` `security-hardening-baseline.md` - rollout host hardening + egress lockdown
      na control-plane i wszystkich node'ach (patrz `docs/ops/SECURITY_HARDENING_BASELINE.md`)

---

## 12. Monitoring kosztów i biznesowy 🟢

- [ ] `🟢` Stripe → Reports → Daily revenue, monthly churn, ARPU
- [ ] `🟢` Wewnętrzny dashboard z `WalletTransaction` → MRR, top-up trends
- [ ] `🟢` Alerty kosztów infra (Hetzner billing alerts, DB storage growth)

---

## 13. To-fix po stronie kodu (znane kompromisy) 🟡

Lista pozycji, które **świadomie** pozostawiliśmy w obecnym kształcie i
mogą być rozszerzone w późniejszych sprintach. Każda pozycja jest
udokumentowana w docstringach odpowiednich plików:

- [ ] `🟡` **Faktury VAT** — obecnie używamy Stripe Hosted Invoice URL
      i polegamy na Stripe Tax. Jeśli polskie biuro księgowe wymaga
      naszego własnego PDF-a faktury (z polskim WZÓR-em), trzeba dorobić
      generator analogiczny do `DpaPdfService`. Decyzja księgowo/prawna.
- [ ] `🟡` **Background queue dla data-export** — obecnie in-process
      (fire-and-forget Promise + boot recovery). Działa dla małej skali.
      Przy >100 eksportów / dzień warto przepiąć na BullMQ (Redis już
      jest w stacku).
- [ ] `🟡` **DA hard-purge** — konta DA są kasowane 30d po anonimizacji.
      Dla niektórych klientów może być potrzebny krótszy SLA (np. 7d) —
      konfigurowalne w przyszłości jako per-tenant ustawienie.
- [ ] `🟢` **Plaintext fallback maili** generowany prostym stripperem
      Markdown — wystarcza, ale dla bardziej skomplikowanych template'ów
      można rozważyć `html-to-text`.

---

## Podsumowanie — co MUSI być zielone przed LIVE

Sekcje 🔴 z punktów 1, 2, 3, 4 (cały Postfix + DNS), 5, 6.1–6.3, 7.1–7.3,
8 (cron joby), 10 (smoke test).

🟡 i 🟢 można domykać iteracyjnie w pierwszym miesiącu po LIVE — ale 🟡
nie powinno być starsze niż 14 dni od LIVE.

---

**Kontakty awaryjne** (do uzupełnienia po wgraniu):

- On-call: <imię> · <telefon> · <email>
- Inspektor RODO: <imię> · `rodo@verris.pl`
- Operator infry: <imię> · <telefon>
- Stripe support: dashboard.stripe.com → Help → Contact
- Provider VPS: <link do panelu providera>
