# Migrator v2 — self-service migracja A→Z

Narzędzie do przenoszenia klientów z konkurencji (pliki + bazy + poczta) w
pełni automatycznie, z ręcznym przejęciem przez zespół tylko przy problemach.

> Współistnieje ze starym flow (`MIGRATION_EXTERNAL/INTERNAL_REQUESTED` na
> `SubscriptionEvent`). Nowe zlecenia zawsze idą przez model `MigrationRequest`.
> Stary flow jest utrzymywany, nieрozwijany.

## Przepływ (happy path)

1. **Klient** w panelu (`/dashboard/migrations`) uruchamia kreator:
   - *auto* — podaje login do panelu starego hostingu (cPanel/DirectAdmin/Plesk),
     wykrywamy domeny, bazy i skrzynki (`POST /services/:id/migrations/discover`),
   - *ręcznie* — wpisuje FTP/SFTP + bazy + skrzynki.
2. **Preflight** (`POST .../migrations/preflight`) testuje logowanie do każdego
   źródła (FTP/FTPS pełny login, IMAP pełny login, MySQL handshake, SSH baner).
3. **Start** (`POST .../migrations/bundle`) tworzy `MigrationRequest` (QUEUED) i
   sekwencyjne `MigrationWorkerJob`.
4. **Scheduler** (`migration-worker.scheduler.ts`, co minutę):
   - QUEUED → DA pre-backup konta docelowego (bezpiecznik), utworzenie baz
     docelowych w DA (`prepareMysqlTargets`), status RUNNING.
5. **Worker na węźle** (`ops/scripts/node-migration-worker.sh`, timer 2 min)
   leasuje joby swojego węzła i wykonuje po kolei (`sequence`):
   `FILES_SFTP_RSYNC` → `MYSQL_IMPORT` → `WP_FIXUP` → `IMAP_SYNC` → `HTTP_POST_CHECK`.
6. **Zakończenie** → e-mail do klienta z instrukcją cutoveru DNS.
7. **Cutover** — klient dograwa różnice (`delta-sync`) i przełącza DNS
   (`.../cutover`, `.../cutover/verify`); auto-potwierdzenie gdy domena na naszych NS.

## Statusy `MigrationRequest`

| Status | Znaczenie |
|--------|-----------|
| `QUEUED` | czeka na pre-backup + provisioning baz |
| `RUNNING` | worker wykonuje kroki |
| `ATTENTION` | **automat stanął** — czeka na zespół (kolejka „Pilne") |
| `COMPLETED` | wszystkie kroki OK |
| `FAILED` | zakończone błędem |
| `CANCELED` | anulowane (klient lub staff) |

## Kroki (`MigrationWorkerJobKind`)

`FILES_SFTP_RSYNC`, `FILES_DELTA`, `MYSQL_IMPORT`, `WP_FIXUP`, `IMAP_SYNC`,
`IMAP_DELTA`, `HTTP_POST_CHECK`. Lease wydaje kolejny krok dopiero po ukończeniu
wcześniejszego (pole `sequence`).

## Eskalacja do zespołu

Automat eskaluje (status `ATTENTION`, ticket `URGENT`, powiadomienie in-app), gdy:
- pre-backup lub provisioning baz DA się nie powiódł,
- krok wyczerpał próby (`attempts >= maxAttempts`),
- **watchdog** (`requeueOrEscalateStalledJobs`, co 5 min) wykryje job bez
  heartbeatu > `MIGRATION_STALL_MINUTES` (20 min) — najpierw requeue, po próbach eskalacja.

Zespół w `/migrations` (admin-panel): kolejka z „Pilne" na górze, strona
szczegółów `/migrations/:id` z danymi klienta z formularza (bez haseł), krokami,
logami, paskiem postępu, raportem spójności. Akcje: **wznów automat**, **ponów
krok**, **oznacz ukończone/nieudane**, **odsłoń dane dostępowe** (audytowane,
wymaga powodu min. 10 znaków).

## Protokół węzeł ↔ control plane

`ServerIdentityGuard` (ta sama tożsamość co telemetria):
- `GET  /node/migration-worker/lease` → job JSON | null
- `POST /node/migration-worker/:jobId/complete` `{bytesTransferred,filesTransferred,databasesMigrated,mailboxesMigrated,log,integrity}`
- `POST /node/migration-worker/:jobId/fail` `{error,log,retryable}`
- `POST /node/migration-worker/:jobId/progress` `{bytesTransferred,filesTransferred,note}` (heartbeat)

## Bezpieczeństwo

- **Sekrety** źródła szyfrowane (`sourceBundleEnc`, AES-256-GCM). Staff widzi je
  tylko przez `revealSecretsForStaff` (audyt). Podgląd formularza bez haseł.
- **Retencja**: scheduler co godzinę kasuje bundle po `7 dniach` (COMPLETED) /
  `3 dniach` (FAILED/CANCELED) od zakończenia (`secretsPurgedAt`).
- **Rate-limit**: `discover` 20/h, `preflight` 30/h (per IP) — anty-skaner.
- **Anty-SSRF / DNS-rebinding**: `resolvePublicHost` rozwiązuje host raz, odrzuca
  IP prywatne, łączy się z przypiętym IP (SNI/Host = oryginalna nazwa).
- **Współbieżność**: max `MIGRATION_MAX_ACTIVE_PER_SUBSCRIPTION` (1) aktywnych
  migracji na usługę.
- **Zgoda / RODO (powierzenie przetwarzania)**: start migracji wymaga
  `consentAccepted=true` (checkbox w kroku „Start" z linkami do DPA/Polityki/
  Regulaminu). Egzekwowane serwerowo w `createBundle`; ślad zgody (kto/kiedy/
  podstawa) zapisany w audycie `MIGRATION_BUNDLE_QUEUED.details.consent`.

## Węzeł — zależności i tuning

Instalowane automatycznie przy onboardzie (`node-onboard-live.sh` →
`node-migration-worker.sh --install`): `rsync, sshpass, lftp, imapsync, wp-cli,
klient mysql, jq, curl`.

Konfiguracja w `/etc/verris.conf`:
- `VERRIS_MIGRATION_BWLIMIT` — limit pasma transferu plików (domyślnie `20M`;
  `0` = bez limitu). Fair-use na węźle współdzielonym.
- `VERRIS_DOVECOT_MASTER_USER` / `VERRIS_DOVECOT_MASTER_PASS` — master-login do
  lokalnego dovecota (wymagane dla `IMAP_SYNC`).

## MySQL — import

Import zawsze przez lokalny root-socket do bazy utworzonej w DA (pewny, bez
problemu `localhost` vs `127.0.0.1` w grantach). Gdy zdalny MySQL jest
zablokowany (typowe na shared) — `mysqldump` przez SSH konta plikowego. Creds
bazy DA trafiają do `wp-config.php` (WordPress łączy się jako `user@localhost`).

## WordPress auto-fix (`WP_FIXUP`)

Po imporcie plików+bazy: aktualizacja `wp-config.php` (DB_NAME/USER/PASSWORD/HOST),
weryfikacja połączenia (`wp core is-installed`), `wp search-replace` starej domeny
na nową (gdy różne), `wp rewrite/cache flush`, ownership. Brak WP w docroot =
krok kończy się od razu (nie błąd).

## Raport spójności

Worker liczy źródło vs cel i zwraca w `complete.integrity`:
- pliki: `sourceFiles` (rsync `--stats`) vs `targetFiles`,
- MySQL: `targetTables`, `targetRows` (dokładne COUNT(*)), `sourceRows` (gdy
  zdalny MySQL osiągalny), `match`,
- IMAP: `sourceMessages`/`targetMessages` z podsumowania imapsync.

Pokazywane per krok w panelu klienta i w szczegółach admina.

## Troubleshooting

| Objaw | Diagnoza |
|-------|----------|
| Zlecenie w `ATTENTION` zaraz po starcie | pre-backup/provisioning DA — sprawdź `daPasswordEnc` konta i log DA |
| `MYSQL_IMPORT` retryable-fail | zdalny MySQL zablokowany i brak SSH fallback (źródło nie-sftp) — odsłoń sekrety, sprawdź ręcznie |
| `WP_FIXUP` fail | `wp core is-installed` nie łączy z bazą — sprawdź mapowanie `targetDb`/wp-config w logu kroku |
| Job „wisi" | brak heartbeatu > 20 min → watchdog requeue/eskaluje automatycznie |
| Brak narzędzi na węźle | `node-migration-worker.sh --install` (EPEL wymagany dla imapsync/sshpass) |

## Migracje bazy

- `20260703100000_migration_selfservice_v2` — statusy/kroki, sequence, heartbeat, eskalacja, cutover.
- `20260703160000_migration_secret_retention` — `secretsPurgedAt`.
