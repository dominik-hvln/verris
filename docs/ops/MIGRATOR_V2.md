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

Import na poświadczeniach bazy utworzonej w DA (`targetDb` z lease), z `--sandbox`; zrzut
czyszczony z `DEFINER` i kolacji `utf8mb4_0900_*`. Drogi pobrania, po kolei (28.09):

1. zdalny `mysqldump` z węzła (gdy źródło wystawia MySQL),
2. `mysqldump` przez SSH konta plikowego — przy SFTP na jego porcie, przy FTP/FTPS na 22
   (na cPanelu/DA konto FTP główne = konto SSH),
3. jednorazowy eksport PHP wgrany po FTP do katalogu strony: losowa nazwa, token `hash_equals`,
   samousunięcie po użyciu (najpóźniej po 2 h), pobranie tylko po HTTPS z weryfikacją i bez
   przekierowań, znacznik końca zrzutu. Tabele, dane, widoki — bez procedur i wyzwalaczy.

Login i hasło bazy są opcjonalne, gdy przenosimy pliki: worker czyta je z `wp-config.php`
skopiowanej strony (jako klient — dowiązanie do pliku roota nie wycieknie), razem z `DB_HOST`
dla dróg 2 i 3. Creds bazy DA trafiają potem do `wp-config.php` (`WP_FIXUP`).

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
| `MYSQL_IMPORT` retryable-fail | log kroku mówi, która droga padła (zdalny / SSH / eksport PHP); dalej ręcznie — sekcja „Migracja ręczna” |
| `WP_FIXUP` fail | `wp core is-installed` nie łączy z bazą — sprawdź mapowanie `targetDb`/wp-config w logu kroku |
| Job „wisi" | brak heartbeatu > 20 min → watchdog requeue/eskaluje automatycznie |
| Brak narzędzi na węźle | `node-migration-worker.sh --install` (EPEL wymagany dla imapsync/sshpass) |

## Migracja ręczna — instrukcja dla obsługi

Gdy automat utknie (ATTENTION), klient ma nietypowy hosting albo prosi „zróbcie to za mnie”.
Zasada: **wszystko, co łączy się z serwerem klienta, robi `verris-mig`, nie root**, a pliki do
konta kopiuje **sam klient** (`runuser -u KONTO`). Root na węźle i tak nie wyjdzie do obcego
serwera poza portem 22 (egress) — to celowe.

### 1. Wejście na węzeł

Każdy ma **własny** klucz SSH (ed25519, z hasłem); właściciel dopisuje klucz publiczny do
`/root/.ssh/authorized_keys` z komentarzem `imie.nazwisko@verris`. Nigdy klucz wspólny, nigdy hasło
(sshd przyjmuje tylko klucze). Odejście z zespołu = usunięcie tej jednej linii na każdym węźle.

```
# ~/.ssh/config na komputerze obsługi
Host verris-wezel1
    HostName wezel1.verris.pl          # FQDN węzła (rDNS), albo IP
    User root
    IdentityFile ~/.ssh/verris_ed25519
    IdentitiesOnly yes
```

`ssh verris-wezel1`. Po zalogowaniu: `last -n 5` i `journalctl -u sshd --since today | tail` —
czy ktoś inny nie pracuje właśnie na tym koncie.

### 2. Przed pierwszą zmianą

- Szczegóły zlecenia w panelu admina: status, log kroków, `preBackupAt` (kopia konta docelowego).
  Bez tej daty najpierw kopia: DA → Admin Backup/Transfer → konto → Backup.
- Login DA konta i domena: panel admina → usługa → konto (`KONTO`, `DOMENA` niżej).
- Katalog strony u nas: `/home/KONTO/domains/DOMENA/public_html` — kopia plików robi `--delete`.

### 3. Narzędzie ręczne (zalecane)

Ten sam kod co automat (walidacja wejścia, verris-mig, kopia jako klient, import na użytkowniku
bazy), log na ekran. Hasła wpisuje się na zapytanie — nie trafiają do historii powłoki ani `ps`.

```
# pliki (sam znajdzie katalog strony w katalogu domowym starego konta i odmówi skopiowania poczty/kluczy)
verris-migration-worker reczna pliki  --konto KONTO --domena DOMENA --host ftp.stary.pl --protokol ftps --login LOGIN --sciezka /public_html

# baza — login/hasło puste = z wp-config.php; --host/--login = zapasowe drogi (SSH, eksport PHP)
verris-migration-worker reczna baza   --konto KONTO --domena DOMENA --baza STARA_BAZA --host ftp.stary.pl --protokol ftps --login LOGIN \
                                      --cel-baza KONTO_wp --cel-login KONTO_wp      # baza założona w DA; bez tego: KONTO_STARABAZA

# poczta — skrzynka musi już istnieć u nas (Panel → Poczta), domena musi należeć do konta
verris-migration-worker reczna poczta --konto KONTO --domena DOMENA --email biuro@DOMENA --host imap.stary.pl
```

Potem WordPress (jako klient):

```
runuser -u KONTO -- wp --path=/home/KONTO/domains/DOMENA/public_html config set DB_NAME KONTO_wp
runuser -u KONTO -- wp --path=... config set DB_USER KONTO_wp
runuser -u KONTO -- wp --path=... config set DB_PASSWORD --prompt=value      # hasło z zapytania
runuser -u KONTO -- wp --path=... search-replace 'https://stara.pl' 'https://DOMENA' --all-tables --precise --skip-columns=guid --dry-run
#   …i to samo bez --dry-run, gdy liczby wyglądają rozsądnie
runuser -u KONTO -- wp --path=... cache flush; runuser -u KONTO -- wp --path=... rewrite flush
```

### 4. Ręcznie krok po kroku (gdy narzędzie nie pasuje)

```
S=/var/lib/verris-mig/stage/KONTO/DOMENA                      # katalog roboczy (0700 verris-mig)
install -d -m 0700 -o verris-mig -g verris-mig /var/lib/verris-mig/stage/KONTO
runuser -u verris-mig -- env -i PATH=/usr/bin:/bin HOME=/var/lib/verris-mig/home bash   # powłoka verris-mig
```

W powłoce verris-mig (hasła wpisujesz na zapytanie narzędzia):

```
rsync -az --partial -e 'ssh -p 22' LOGIN@stary.pl:public_html/ "$S/"        # SSH
lftp -u LOGIN ftps://ftp.stary.pl -e "mirror --parallel=4 /public_html $S; bye"   # FTP/FTPS
ssh LOGIN@stary.pl                                                          # baza przez SSH:
#   na starym serwerze: mysqldump --single-transaction --quick --hex-blob --no-tablespaces -u U -p BAZA > ~/verris.sql
#   potem: rsync LOGIN@stary.pl:verris.sql "$S.sql" && ssh LOGIN@stary.pl 'rm -f verris.sql'
imapsync --host1 imap.stary.pl --user1 biuro@DOMENA --justlogin             # tylko test logowania
exit
```

Z powrotem jako root — kopia do konta JAKO KLIENT i import na użytkowniku bazy DA:

```
runuser -u verris-mig -- setfacl -R -m u:KONTO:rX "$S"; setfacl -m u:KONTO:x /var/lib/verris-mig/stage/KONTO
runuser -u KONTO -- rsync -a --delete "$S/" /home/KONTO/domains/DOMENA/public_html/
runuser -u verris-mig -- cat "$S.sql" | sed -E 's/DEFINER=`[^`]*`@`[^`]*`//g; s/utf8mb4_0900_[a-z_]+/utf8mb4_unicode_ci/g' \
  | mysql --sandbox -u KONTO_wp -p KONTO_wp
```

### 5. Sprawdzenie przed zmianą DNS

```
curl -sI --resolve DOMENA:443:IP_WEZLA https://DOMENA/ | head -5       # strona z naszego węzła
curl -s  --resolve DOMENA:443:IP_WEZLA https://DOMENA/ | grep -o '<title>[^<]*'
```

Klientowi: wpis w pliku hosts (`IP_WEZLA DOMENA www.DOMENA`) do obejrzenia strony u nas.
Rekordy DNS podaje panel (Migracja → Przełączenie DNS); TTL obniżyć dzień wcześniej.

### 6. Sprzątanie

`rm -rf /var/lib/verris-mig/stage/KONTO/DOMENA /var/lib/verris-mig/stage/KONTO/DOMENA.*` oraz
`/tmp/verris-mig-reczna-*.log` (bez haseł, ale z nazwami plików klienta). Zlecenie w panelu admina
zamknąć statusem, notatka w zgłoszeniu: co zrobione ręcznie.

### Nigdy

- **Restore paczki DA/cPanel (`cpmove`, `backup-*.tar.gz`) od obcego hostingu jako root** — archiwum
  może mieć dowiązania i `../` i nadpisać pliki systemu. Rozpakować jako verris-mig w katalogu
  roboczym (`tar --no-same-owner --no-same-permissions -xzf`), wziąć tylko `public_html`
  i zrzuty SQL, dalej jak w pkt 4.
- Łączyć się z serwerem klienta jako root, wpisywać hasła w poleceniu (`-pHASLO`, `sshpass -p`).
- `chown -R` jako root w katalogu klienta, kopiować katalog domowy starego konta do `public_html`.
- Importować zrzut przez root-socket bez `--sandbox`, wyłączać firewall albo egress „na chwilę”.

## Migracje bazy

- `20260703100000_migration_selfservice_v2` — statusy/kroki, sequence, heartbeat, eskalacja, cutover.
- `20260703160000_migration_secret_retention` — `secretsPurgedAt`.
- `20260928120000_migracja_kopia_przed` — `preBackupAt` (bez kopii konta docelowego worker nie dostaje kroku).
