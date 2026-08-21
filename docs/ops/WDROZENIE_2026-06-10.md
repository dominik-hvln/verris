# Wdrożenie 2026-06-10 — commit, deploy, VPN, batch funkcji

## 0a. Passkey enforcement admin/staff + break-glass (#30) — aktywacja

Nowy mechanizm: konta **ADMIN/STAFF** po pierwszym logowaniu hasłem są zmuszane
do skonfigurowania passkey; po pierwszym **udanym logowaniu passkey** ścieżka
hasłowa jest dla nich blokowana. Awaryjne wejście (utrata urządzenia) to
**break-glass**: hasło + kod 2FA + jednorazowy kod awaryjny — każde użycie
powiadamia wszystkich adminów i trafia do audytu.

Kolejność włączania (żeby się nie zablokować):
1. Deploy kodu + migracja `20260616100000_staff_passkey_enforcement` (`prisma migrate deploy`) + `db:generate`.
2. Każdy admin/staff loguje się hasłem → **dodaje passkey** w `Ustawienia → Bezpieczeństwo` (admin) / `Ustawienia → Passkeys i kody awaryjne` (staff).
3. Tam samym ekranie **wygeneruj kody break-glass** (wymaga hasła + TOTP; 2FA musi być włączone). Zapisz je offline.
4. Dopiero gdy **wszystkie** konta uprzywilejowane mają passkey + kody → ustaw `REQUIRE_PASSKEY_FOR_STAFF=1` w env API i zrestartuj API.
5. Od teraz: logowanie hasłem dla admin/staff bez passkey wymusza enrollment; z passkey — blokuje hasło (tylko passkey lub break-glass).

> ⚠️ Bez kroku 2–3 **nie** ustawiaj `REQUIRE_PASSKEY_FOR_STAFF=1` — zablokujesz sobie wejście.
> Endpointy: `POST /auth/login/break-glass`, `GET/POST /auth/break-glass/{status,regenerate}`.

## 0b. Free trial (O-1) — aktywacja

Darmowy okres próbny. Plan z `trialDays > 0` można uruchomić bez płatności
(jeden okres próbny na konto, wymaga zweryfikowanego e-maila). Po okresie:
scheduler wysyła przypomnienie (≤3 dni przed), a po terminie zawiesza konto DA i
ustawia status `EXPIRED` (dane trzymane 30 dni). Klient może w panelu w każdej
chwili **przekształcić próbę na płatną** (pobranie z portfela).

Uruchomienie:
1. Deploy + migracja `20260616120000_free_trial` (`prisma migrate deploy`) + `db:generate`.
2. W panelu admina (`Plany → edycja`) ustaw **Okres próbny (dni)** dla wybranych planów (np. 14).
3. Gotowe — w panelu klienta na ekranie „Zamów nową usługę" pojawia się sekcja „Wypróbuj za darmo", a próbne usługi mają przycisk „Przekształć na płatną".

> Endpointy: `GET /subscriptions/trial/eligibility`, `POST /subscriptions/trial`, `POST /subscriptions/:id/convert`.
> Scheduler `TrialExpiryScheduler` chodzi co godzinę (przypomnienia + wygaszanie).
> Anty-nadużycie: jeden trial na konto (`User.trialStartedAt`, atomowe `updateMany`), wymóg weryfikacji e-mail, rate-limit 3/h na start.

## 0c. Migracja od konkurencji (O-2) — worker na węźle

Stos migracji (pliki/DB/poczta) był już gotowy po stronie API i panelu klienta
(self-service formularz FTP/SFTP/MySQL/IMAP → zaszyfrowany pakiet → orchestrator
→ kolejka jobów; staff może podejrzeć sekrety i zarządzać statusem). Brakującym
elementem był **agent-worker na węźle**, który faktycznie wykonuje transfer —
dodany jako `ops/scripts/node-migration-worker.sh`.

Worker dzierżawi joby (`GET /node/migration-worker/lease`), wykonuje je na węźle
docelowym (rsync/lftp dla plików, `mysqldump|mysql` dla baz, `imapsync` dla
poczty, curl dla health-checku) i raportuje `complete`/`fail` z metrykami. Ruch
transferowy nie przechodzi przez API.

Instalacja:
1. Nowe węzły: instaluje się automatycznie w `node-onboard-live.sh` (timer 2 min). 
2. Istniejące węzły: skopiuj skrypt i `bash node-migration-worker.sh --install` (zainstaluje też `jq/lftp/mariadb/imapsync`).
3. Dla migracji IMAP ustaw w `/etc/verris.conf`: `VERRIS_DOVECOT_MASTER_USER` + `VERRIS_DOVECOT_MASTER_PASS` (master-user dovecot z bootstrapu) — bez tego joby IMAP zgłoszą retryable-fail, a pliki/DB działają niezależnie.

> Bezpieczeństwo: worker uwierzytelnia się tożsamością węzła (`X-Server-Id`/`X-Server-Token`), a sekrety źródła są deszyfrowane dopiero w odpowiedzi `lease` (AES-256-GCM at-rest). Logi workera trymowane do 200 KB i widoczne dla staff.

## 0d. Poczta / webmail Roundcube (P-1)

Zarządzanie skrzynkami klienta (twórz/usuwaj, limit MB) jest teraz interaktywne
w panelu (`Poczta e-mail`) — przez DirectAdmin (CMD_API_POP). Dochodzi własny,
brandowany **webmail Roundcube** zamiast domyślnego.

Wdrożenie webmaila:
1. Na węźle pocztowym: `sudo WEBMAIL_HOST=webmail.verris.pl RC_DB_PASS=... ops/scripts/prod-roundcube-install.sh` (instaluje Roundcube, skórkę „verris", vhost nginx, wskazuje na lokalny Dovecot 993 / Postfix 587).
2. TLS: `certbot --nginx -d webmail.verris.pl` albo wepnij istniejący wildcard.
3. W panelu/ENV API ustaw `WEBMAIL_URL=https://webmail.verris.pl` (klucz `mail.webmailUrl` lub env). Panel klienta pokaże wtedy przyciski „Otwórz webmail" przy skrzynkach (deep-link `?_user=`).

Branding: skórka `skins/verris` rozszerza Elastic — kolory emerald, nazwa
produktu (`BRAND_NAME`, domyślnie „Verris Poczta"), opcjonalne logo
(`BRAND_LOGO_URL`) i podpis na ekranie logowania.

> Pełny **osobny, samodzielnie rozliczany produkt e-mail** (własny plan + checkout + provisioning konta mail-only) to kolejny krok — reużywa wzorca z hostingowego checkoutu (Plan/Subscription) i tych samych metod DA POP. Obecnie poczta jest częścią usługi hostingowej + brandowany webmail.

## 0e. Backupy off-node / offsite (B-1, krytyczne do LIVE)

Dotychczas backupy były tylko lokalne na węźle (DA SITE_BACKUP) — utrata węzła =
utrata backupów. Dodany **offsite backup**: `ops/scripts/node-offsite-backup.sh`
wyzwala backupy DA per-konto, a następnie `rclone sync` wysyła je do magazynu
S3-compatible (zalecany remote typu **crypt** — szyfrowanie po stronie węzła),
z retencją wersji. Każdy przebieg raportuje do control-plane
(`POST /agent/backup/offsite-report` → `Server.lastOffsiteBackup*`), więc panel
może oznaczać nieaktualne/niedziałające backupy.

Wdrożenie:
1. Deploy + migracja `20260616140000_offsite_backup` (`prisma migrate deploy`) + `db:generate`.
2. Na węźle: `rclone config` → utwórz remote (np. Backblaze B2/Wasabi) i opakuj go w `crypt` (klucze tylko na węźle).
3. Utwórz `/etc/verris-backup.conf`: `RCLONE_REMOTE="verris-crypt:"`, `BACKUP_PREFIX="nodes/<host>"`, `RETENTION_DAYS=30`, `DA_BACKUP=1`.
4. Timer instaluje się automatycznie w onboardingu (codziennie 03:30); ręcznie: `node-offsite-backup.sh --install`, test: `node-offsite-backup.sh run`.

> Razem z istniejącym self-restore w panelu (HostingRestoreJob) daje to pełny cykl: offsite kopia → przywracanie. Spełnia wymóg S-1 (trwałość danych / RODO).

## 0f. Osobny produkt e-mail (P-1b) — plan + checkout + provisioning

Pełny, **samodzielnie rozliczany produkt poczty**. Zamiast budować równoległy
silnik provisioningu, plan dostał pole `productKind` (`HOSTING` | `EMAIL`).
Plany `EMAIL` przechodzą przez **ten sam, sprawdzony checkout/provisioning/
billing/lifecycle** co hosting (konto DA już zapewnia pocztę), a panel
prezentuje je jako produkt pocztowy (zakładka „Poczta e-mail" w zamawianiu,
plakietka „Poczta" na usłudze, zarządzanie skrzynkami + webmail Roundcube).

Wdrożenie:
1. Deploy + migracja `20260616160000_plan_product_kind` (`prisma migrate deploy`) + `db:generate`.
2. W panelu admina utwórz plan(y) z **Rodzaj produktu = Poczta e-mail** (np. mały dysk web, większy limit poczty, cena za skrzynki/pakiet).
3. Klient w „Zamów nową usługę" przełącza zakładkę **Poczta e-mail**, wybiera plan + domenę (własną lub rejestruje w checkoucie — O-3), płaci z portfela; konto stawiane jest automatycznie.
4. Skrzynki + webmail: zakładka „Poczta e-mail" w panelu (twórz/usuwaj skrzynki, „Otwórz webmail" — wymaga `WEBMAIL_URL`, sekcja 0d).

> Reużyte: Plan/Subscription/Account, ProvisioningService, wallet billing, renewal/cancel, faktury/KSeF. Zero równoległego kodu rozliczeń — produkt e-mail jest pełnoprawny od pierwszego dnia.

## 0g. Gotowość LIVE + ops watchdog

- **Check gotowości** (panel admina → Ustawienia → „Gotowość do startu LIVE", `GET /admin/live-readiness`): agreguje GO/NO-GO po sekretach, Stripe, SMTP, danych firmy, węzłach, dokumentach prawnych, NS + ostrzeżenia (KSeF, webmail, OpenProvider, backup). Pełny runbook: `CHECKLISTA_STARTU_LIVE.md`.
- **Ops watchdog** (`OpsWatchdogScheduler`): co 5 min wykrywa węzły bez heartbeatu (>10 min) i alarmuje mailowo wszystkich adminów (cooldown 6h, + powiadomienie o przywróceniu); codziennie 08:00 wysyła raport floty (GO/NO-GO, węzły offline/backup nieaktualny, usługi ACTIVE/PAST_DUE/SUSPENDED, trials kończące się, domeny wygasające). Dedup przez audyt (bez zmian schematu). Wymaga skonfigurowanego SMTP.

## 0h. VPS / Cloud (odsprzedaż Hetzner) — fundament

Backend odsprzedaży VPS oparty o **Hetzner Cloud API**:
- Modele `VpsPlan` (mapowanie na `server_type`/image/lokalizację Hetznera) i `VpsInstance` (instancja klienta) + migracja `20260616180000_vps_cloud`.
- Realny klient `HetznerClient` (create/get/delete server, power on/off/reboot, katalog server_types) — auth `HETZNER_API_TOKEN`.
- `VpsService.order`: pobranie z portfela → utworzenie serwera w Hetznerze → zapis IP/ID + zaszyfrowane hasło root (pokazane raz); przy błędzie provisioning **automatyczny zwrot** + status ERROR.
- Cykl życia: start/stop/reboot/usuń. Kontrolery: klient (`/vps`, `/vps/plans`, `/vps/:id/power`) + admin (`/admin/vps/plans`, `/admin/vps/server-types`).

Wdrożenie:
1. Migracja + `db:generate` + deploy.
2. Ustaw `HETZNER_API_TOKEN` (projekt Hetzner Cloud) w env API.
3. W panelu admina utwórz plany VPS (mapowane na np. `cx22`, image `ubuntu-24.04`, lokalizacja `nbg1`), ustaw ceny.

**UI klienta (gotowe):** zakładka **VPS / Cloud** w panelu — wybór planu, zamówienie (opłata z portfela), jednorazowe pokazanie hasła root, akcje start/stop/restart/usuń, statusy na żywo; toasty + skeleton podczas ładowania.

**Rozliczanie (gotowe):** `VpsRenewalScheduler` (codziennie 04:00) — pobiera miesięczną opłatę z portfela; przy braku środków **wyłącza** VPS i wysyła mail (karencja 7 dni), po karencji **usuwa** serwer w Hetznerze i powiadamia; po doładowaniu kolejne rozliczenie automatycznie wznawia serwer.

**Klucze SSH (gotowe):** klienci dodają klucze publiczne w panelu (zakładka VPS → „Klucze SSH"); przy zamawianiu można wybrać klucz(e) — wtedy serwer powstaje **bez hasła root** (logowanie kluczem). Klucze są leniwie wgrywane do projektu Hetzner przy pierwszym użyciu (`SshKey.hetznerKeyId` cache), usuwane też z Hetznera. Migracja `20260616200000_ssh_keys`.

**Admin (gotowe):** panel admina → „VPS / Cloud" — zarządzanie planami (lista/dodaj/edytuj/wyłącz) z auto-uzupełnianiem specyfikacji z katalogu Hetznera.

> Pętla VPS kompletna: admin tworzy plany → klient zamawia (hasło root lub klucz SSH) → provisioning Hetzner → rozliczanie miesięczne z suspend/karencją/usunięciem. Opcjonalne rozszerzenia: rozliczanie godzinowe, rescue mode / snapshoty / rebuild obrazu.

## 0i. Deliverability dashboard (P-2)

Diagnostyka „dlaczego mail nie dochodzi" per domena, w panelu klienta (zakładka
Poczta). `DeliverabilityService` robi **realne zapytania DNS**: SPF (TXT domeny),
DMARC (`_dmarc.`), DKIM (sondaż typowych selektorów: x/default/mail/…), oraz
sprawdza IP serwera na blacklistach RBL (Spamhaus ZEN, SpamCop, Barracuda,
SORBS). Zwraca wynik %, status każdego checku i **gotowe rekordy do skopiowania**
(SPF/DMARC). Endpoint `GET /services/:id/deliverability`; klient ma przycisk
„Sprawdź ponownie". Brak zależności zewnętrznych — używa wbudowanego resolvera DNS.

> Uwaga: trafność RBL/DKIM zależy od poprawnej konfiguracji DNS węzła (PTR, selektor DKIM ustawiony przez `prod-mail-dkim-outbound-fix.sh`). Dashboard tylko diagnozuje — nie zmienia rekordów.

## 0j. Wsparcie i retencja (SUP-3 / SUP-4 / SUP-5)

Migracja `20260616220000_sup_csat_sla` (Plan.supportSlaHours, Ticket.csat*).

- **SUP-4 · CSAT** — po zamknięciu zgłoszenia klient ocenia wsparcie (1-5 gwiazdek + komentarz). Endpoint `POST /tickets/:id/csat` (jednorazowo, tylko własne zamknięte zgłoszenie). Ocena zapisywana na tickecie (do raportów BOK).
- **SUP-5 · SLA wsparcia** — `Plan.supportSlaHours` ustawiany w panelu admina (formularze planów). Klient widzi gwarancję „odpowiemy do X h" na zgłoszeniu (status: oczekuje / po terminie / odpowiedziano) oraz na karcie planu w checkout. Wartość = max SLA z aktywnych subskrypcji.
- **SUP-3 · Proaktywne podpowiedzi** — na pulpicie klienta widget „Rzeczy do zrobienia" agreguje rekomendacje usług (DNS/SSL/backup/autoskalowanie/provisioning/health), które API już liczy — mniej ticketów, lepsza retencja.

> Bez nowych zależności; SUP-3 reużywa istniejące `recommendations` z `/services`. Deploy: migracja + `db:generate` + build.

## 0k. Wersja PHP per konto (P-6)

Klient wybiera wersję PHP konta w panelu (zakładka „Wersja PHP"). Mechanizm jak
przy WAF: `PhpService` kolejkuje **NodeTask `PHP_APPLY`**, agent na węźle pobiera
skrypt `node-php-apply.sh` i ustawia wersję przez **CloudLinux PHP Selector**
(`selectorctl`), z fallbackiem do DA. Po sukcesie API stempluje `Account.phpAppliedAt`.

- Dostępne wersje: ustawienie platformy `php.availableVersions` (domyślnie `8.3,8.2,8.1,8.0,7.4`).
- Endpointy: `GET/POST /services/:id/hosting-php`; serwowanie skryptu: `GET /agent/tasks/php-apply/script`.
- Migracja `20260616240000_php_per_account` (Account.phpVersion/phpAppliedAt + NodeTaskKind PHP_APPLY).

Wdrożenie: migracja + `db:generate` + build + deploy. Na węźle wymagane alt-php
(CloudLinux) z włączonymi wersjami w `php.availableVersions`.

## 0l. Wsparcie: temat + KB + szablony (SUP-1/2)

Migracja `20260616260000_ticket_topic_canned`. Roczne plany i AI-suggestion dla
staff (`/ai/tickets/:id/suggestion`) już istniały — tu dochodzą:

- **Temat zgłoszenia** (`Ticket.topic`: HOSTING/DOMAIN/EMAIL/DNS/SSL/BILLING/OTHER) — klient wybiera w formularzu; staff widzi temat i dopasowane szablony.
- **Podpowiedzi z bazy wiedzy dla klienta** — formularz zgłoszenia pyta `POST /ai/kb-suggest` (RAG po KB audience CLIENT) i pokazuje „Zanim wyślesz — może to pomoże" (deflekcja ticketów). Bez wywołania LLM (samo retrieval).
- **Szablony odpowiedzi (canned)** — `CannedResponse` (topic/isActive) + CRUD w panelu admina (Ustawienia → Szablony odpowiedzi) + lista dla staff (`GET /tickets/canned?topic=`) z wstawianiem w pole odpowiedzi (posortowane: temat ticketu → globalne).

> Działa od razu po dodaniu szablonów w panelu admina i (dla KB) opublikowaniu artykułów audience CLIENT/ALL. AI-suggestion „co odpisać / co zweryfikować" jest już dostępny przyciskiem w panelu staff.

## 0m. Marketplace 1-click — Nextcloud / PrestaShop (P-3)

Po WordPressie (A4) — generyczny instalator aplikacji w tej samej architekturze
NodeTask. `AppInstallService` tworzy bazę DA + dane administratora i kolejkuje
`APP_INSTALL`; agent pobiera `node-app-install.sh` i instaluje **realnymi
instalatorami CLI**:
- **Nextcloud** — `occ maintenance:install` (+ trusted_domains),
- **PrestaShop** — `install/index_cli.php` (+ usunięcie katalogu install).

Bezpieczeństwo: instalacja tylko na **pustym** katalogu domeny (chroni istniejące
strony), hasło admina pokazywane raz. Endpointy `GET/POST /services/:id/apps*`;
skrypt: `GET /agent/tasks/app-install/script`; UI: zakładka „Aplikacje 1-click".

> Wymagania węzła: `php-cli` (Nextcloud occ), `unzip` (PrestaShop). Migracja `20260616280000_app_install` (NodeTaskKind APP_INSTALL). Łatwo dołożyć kolejne aplikacje (Joomla via web-wizard, Matomo, Ghost-na-VPS) jako kolejne wpisy katalogu + gałęzie skryptu.

## 0n. Onboarding wizard (O-4)

Kreator „Pierwsze kroki" na pulpicie klienta prowadzi za rękę po pierwszym
zakupie: brak usługi → CTA „Zamów hosting/pocztę"; po zakupie → kroki postaw
stronę (migracja O-2 / WordPress A4 / aplikacje P-3), skieruj domenę (DNS),
włącz SSL, skonfiguruj pocztę. Stan kroków DNS/SSL wykrywany z health-score
(`dnsOk`/`tlsOk`); dla produktu e-mail osobny zestaw kroków. Zamykalny
(localStorage). Czysto kliencki — reużywa `/services`, bez zmian API/schematu.

## 0s. Reorganizacja nawigacji — hub usługi (model cPanel)

Uporządkowanie IA: **menu boczne zawiera tylko elementy globalne** (Pulpit, Usługi,
Domeny, Płatności, Migracje, Dodatki, VPS/Cloud, Kalkulator, Pomoc, Ustawienia +
warunkowo EKO/Partnerski/IAM). **Wszystkie narzędzia per-usługa** wchodzą przez:
Usługi → wybierz usługę → zakładki huba.

- Hub `services/[id]` to jedyny punkt zarządzania usługą. Dodane brakujące zakładki: **Wersja PHP, Konta FTP, Cron, Kopie zapasowe** (klienckie wrappery reużywające istniejących komponentów/akcji).
- Zakładka **Pliki** w hubie używa teraz **realnego menedżera plików** (P-4, in-panel) zamiast linku do zewnętrznego DA — koniec „dwóch różnych widoków".
- Usunięto z menu bocznego pozycje per-usługa (pliki, bazy, poczta, SSL, PHP, aplikacje, FTP, cron), które wcześniej działały na auto-wybranej pierwszej usłudze (źródło pomyłek „pokazuje tylko jedną usługę").
- Stare trasy (`/dashboard/file-manager`, `/dashboard/databases` …) pozostają jako deep-linki (z `?serviceId`), ale nie są już w menu.

## 0r. Menedżer plików w panelu (P-4)

Interaktywny menedżer plików hostingu w panelu klienta (`/dashboard/file-manager`),
bez FTP. Architektura: agent węzła jest asynchroniczny (poll ~1 min), więc operacje
idą **synchronicznie przez DirectAdmin File Manager API** z impersonacją usera.

- **SDK** (`directadmin-sdk`): `asUser(targetUser)` — klient działający jako konkretny user przez login key admina w konwencji `admin|user`; metody `listDir`, `readFile`, `downloadFile`, `writeFile`, `makeDir`, `renameEntry`, `deleteEntries`, `uploadFile`.
- **API** (`FilesModule`, `services/:id/files/*`): account-scoped (weryfikacja właściciela + status ACTIVE), **sandbox ścieżek** (normalizacja, blok `..`/absolutnych/null — przetestowany, 12/12), limity (edycja 1 MB, upload/zapis 25 MB), rate-limit per operacja.
- **UI**: breadcrumb, tabela (nazwa/rozmiar/data), wejście do folderów, nowy folder, upload, zmiana nazwy, usuwanie (z potwierdzeniem), pobieranie, edytor plików tekstowych. Wpięte w istniejące zakładki hostingu (`HostingPageWrapper`), selekcja usługi jak w pozostałych narzędziach.
- Przy okazji: naprawiony istniejący bug w `passkey-conditional-autofill` (import nieistniejących funkcji → autofill passkey był martwy).

> ⚠️ **Do weryfikacji na żywym węźle:** dokładne nazwy komend/parametrów DA File
> Manager API różnią się między wersjami DirectAdmin (celowane w 1.6x). Po deployu
> przetestować listowanie/odczyt/zapis/upload/rename/delete na realnym koncie i
> dostroić w `directadmin-sdk` jeśli któraś komenda zwróci nieoczekiwany payload.

## 0p. Plany roczne + dodatki (P-7 / P-8)

- **P-7** — plany roczne (`interval=YEAR`, `priceYearly`) i kody promocyjne już działały; dołożono **wyróżnienie oszczędności** przy wyborze rocznego okresu w checkoucie (% i kwota vs 12× miesięcznie). Pakiet „domena+hosting+mail" realizowany przez O-3 (domena w checkoucie) + pocztę wliczoną w hosting.
- **P-8** — **sklep z dodatkami** (`/dashboard/addons`) opłacany z portfela. Migracja `20260616300000_addons` (`PurchasedAddon` + `User.prioritySupport*`). Dwa tryby realizacji: **flaga** (priorytetowe wsparcie 30 dni → podbija priorytet i SLA kolejnych zgłoszeń) oraz **zlecenie** (konfiguracja przez specjalistę / dedykowane IP → automatyczne zgłoszenie do BOK). Endpointy `GET /addons`, `POST /addons/purchase`.

## 0o. Trust signals (O-5)

Publiczny endpoint `GET /public/stats` (bez auth, cache 60 s) zwraca **realne
liczby**: aktywne konta hostingowe, domeny, węzły. Komponent `TrustStats`
pokazuje je na stronie logowania i rejestracji jako social proof („X stron
hostowanych"). Bezpieczne dla świeżej instalacji — nie pokazuje nic, dopóki
liczby nie są sensowne (>0). Bez zmian schematu.

## 0. Konfiguracja OpenProvider (rejestrator domen, C4)

Kod integracji jest gotowy (`apps/api/src/domains/registrar.provider.ts`). Żeby
uruchomić sprzedaż/odnowienia domen w panelu, wykonaj poniższe kroki.

### 0.1 Konto i dostęp API
1. Załóż konto reselera na <https://www.openprovider.com> (lub zaloguj się do
   istniejącego) i podpisz umowę reselera. Zasilenie salda (depozyt) jest
   wymagane — OpenProvider pobiera opłaty za rejestracje z Twojego salda, a my
   obciążamy portfel klienta osobno (marża = Twoja cena − cena reseller).
2. **Control Panel → Dashboard → Account → API** — włącz dostęp API i (zalecane)
   dodaj **whitelistę IP** kontrolera (publiczny IP `204.168.174.138`).
   Uwaga: OpenProvider loguje hasłem konta API (to samo co panel) — nie ma
   osobnego tokena; my cache'ujemy bearer ~50 min.
3. Zanotuj **username** (login konta) i **password**.

### 0.2 Owner handle (kontakt registranta) — WYMAGANY
Domeny rejestrujemy white-label pod **jednym kontaktem reselera**, żeby klient
nigdy nie stykał się z OpenProviderem.
1. **Control Panel → Customers → Create customer** (lub zakładka „Contacts”).
   Uzupełnij dane firmy/osoby reselera (Twojej firmy), zweryfikuj e-mail.
2. Po utworzeniu skopiuj **handle** kontaktu — format `XX000000-XX`
   (np. `AB123456-PL`). To jest `OPENPROVIDER_OWNER_HANDLE`.
   > Dla niektórych TLD (np. `.pl`) rejestr wymaga dodatkowych danych kontaktu
   > lub osobnego handla zgodnego z polityką NASK — utwórz wtedy dedykowany
   > kontakt i użyj go jako owner handle dla `.pl`. Na start wystarczy jeden
   > handle dla `.com/.eu/.net`; `.pl` dołóż po weryfikacji w OpenProviderze.

### 0.3 Zmienne środowiskowe (.env.prod)
```bash
REGISTRAR_PROVIDER=openprovider
OPENPROVIDER_API_BASE_URL=https://api.openprovider.eu      # produkcja
# (CTE/sandbox OpenProvider: https://api.cte.openprovider.eu — do testów)
OPENPROVIDER_USERNAME=twoj_login_api
OPENPROVIDER_PASSWORD=twoje_haslo_api
OPENPROVIDER_OWNER_HANDLE=AB123456-PL
```
Zmienne są już przekazywane do kontenera `api` (docker-compose.prod.yml).
Po edycji: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api`.

### 0.4 Marża / cennik
`DomainRegistrarService` obciąża portfel klienta i nalicza marżę. Sprawdź/ustaw
mnożnik lub narzut w konfiguracji rejestratora (`apps/api/src/domains/domain-registrar.service.ts`
+ ewentualnie `PlatformSetting`). Reguła: cena klienta = cena reseller × narzut
(lub + kwota), waluta przeliczana na PLN portfela.

### 0.5 Test (po deployu)
```bash
# Status integracji (czy provider skonfigurowany):
curl -s https://api.verris.pl/domains/registrar/status -H "Authorization: Bearer <JWT>"
# Sprawdzenie dostępności + ceny:
curl -s -X POST https://api.verris.pl/domains/registrar/availability \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"domain":"twoja-testowa-domena.pl"}'
```
Na sandbox (CTE) wykonaj pełny smoke: availability → register → renew → sprawdź
obciążenie portfela (`CHARGE_DOMAIN` w historii). Dopiero potem przełącz na
produkcyjny `api.openprovider.eu` i wykonaj 1 realną rejestrację taniego TLD.

> **Bezpieczeństwo:** hasło API OpenProvider trzymaj wyłącznie w `.env.prod`
> (poza repo). Whitelist IP w panelu OpenProvider ogranicza użycie nawet przy
> wycieku. Rozważ osobne konto API od konta głównego.

---

## 1. Commit + push + deploy (wykonaj u siebie)

> Środowisko, w którym pracowałem, nie ma dostępu sieciowego (push do GitHub = 403,
> SSH do serwera = unreachable) ani prawa zapisu w zamontowanym `.git`. Wszystkie
> zmiany to realne pliki w Twoim repo — wystarczy je zacommitować i wdrożyć.

Na Twojej maszynie (w katalogu repo):

```bash
# Jeśli został stały lock po mojej sesji:
rm -f .git/index.lock

git add -A
git commit -m "hardening LIVE + VPN paneli + batch funkcji (SSL/DKIM/PHP/Redis, sesje, OpenProvider)"
git push origin live-release-readiness
```

Deploy na prod (control-plane `204.168.174.138`) — wg istniejącego runbooka:

```bash
ssh -i ~/.ssh/verris_cursor_deploy root@204.168.174.138
cd /opt/verris
./ops/scripts/prod-deploy-release.sh        # pull + build + migrate deploy + healthz
```

Po deployu KONIECZNIE (nowe pola/migracje Prisma z tej i poprzedniej sesji):

```bash
# wewnątrz repo na serwerze — prod-deploy-release.sh robi to automatycznie,
# ale jeśli uruchamiasz ręcznie:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
```

Nowe migracje w tym wydaniu: `daAllowInvalidCert`, `hardening status`,
`stripe webhook dedupe`, `vpn_peers`, `plan_ssh_access`, `user_token_version`.

Smoke po deployu: `docs/SMOKE_E2E_PRZED_LIVE.md` (sekcje D-cap i G obowiązkowo).

---

## 2. VPN — generowanie klucza i instalacja

**Dlaczego nie wygenerowałem klucza teraz:** poprawny klucz wymaga klucza
publicznego serwera WireGuard i endpointu, które powstają dopiero przy
`vpn-wireguard-setup.sh` na serwerze. Generowanie peera w panelu dodatkowo
rejestruje go po stronie serwera (sync), więc generowanie poza panelem dałoby
„martwy" klucz. Właściwa kolejność:

### Krok A — postaw VPN na serwerze (raz)
```bash
ssh root@204.168.174.138
cd /opt/verris
bash ops/scripts/vpn-wireguard-setup.sh          # wypisze 3 wartości do .env.prod
# wpisz VPN_WG_SERVER_PUBLIC_KEY, VPN_WG_ENDPOINT, VPN_SYNC_TOKEN do .env.prod
# zalecane: VPN_WG_CLIENT_ALLOWED_IPS=10.88.0.0/24,204.168.174.138/32
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
bash ops/scripts/vpn-sync-peers.sh --install     # timer synchronizacji peerów
# uzupełnij token w /etc/default/verris-vpn-sync
```

### Krok B — wygeneruj SWÓJ klucz w panelu
Panel admina → **VPN (dostęp paneli)** → wpisz nazwę („Dominik — laptop") →
**Wygeneruj konfigurację** → **Pobierz .conf** (klucz prywatny widoczny tylko raz).

### Krok C — zainstaluj na urządzeniu
- **Windows/macOS:** zainstaluj aplikację **WireGuard** (wireguard.com/install) →
  „Add Tunnel" / „Import tunnel(s) from file" → wskaż pobrany `.conf` → **Activate**.
- **iOS/Android:** aplikacja **WireGuard** → „+" → **Import from file/QR** → wskaż `.conf`.
- **Linux:** `sudo cp verris-vpn-*.conf /etc/wireguard/wg0.conf && sudo wg-quick up wg0`
  (autostart: `sudo systemctl enable wg-quick@wg0`).

Po połączeniu otwórz `https://admin.verris.pl` — powinno działać tylko z aktywnym
tunelem.

### Krok D — zamknij panele na świat (dopiero gdy VPN działa!)
W `.env.prod`: `CADDY_INTERNAL_ALLOW_CIDR=10.88.0.0/24` →
`docker compose ... up -d caddy`. Od tej chwili admin./staff. zwracają 403 spoza VPN.
Rollback awaryjny: usuń tę zmienną i zrestartuj caddy.

---

## 3. Status batcha funkcji (A/B/C)

### Zrobione w kodzie (ten commit)
| Task | Co | Pliki |
|---|---|---|
| **A1** Auto-SSL | DA `letsencrypt=1` w profilu + `requestLetsEncrypt` w SDK + auto-issue po provisioningu (best-effort) + metoda panelu | `node-hosting-profile.sh`, `directadmin-sdk/client.ts`, `directadmin.service.ts`, `provisioning.service.ts` |
| **A2** PHP Selector | lvemanager/alt-php w profilu (CloudLinux) | `node-hosting-profile.sh` |
| **A3** LSCache/HTTP3 | katalog cache LS + QUIC + Redis serwerowo | `node-hosting-profile.sh` |
| **A5** Auto-DKIM | DA `dkim=1` w profilu (podpisywanie poczty) | `node-hosting-profile.sh` |
| **A6** Redis per konto | feature `redis` w pakietach planów | `da-package-spec.ts` |
| **B6** (część) | `ssh` per plan (`Plan.sshAccess`) + `git` w pakietach | `schema.prisma`, `da-package-spec.ts` |
| **C3** Sesje urządzeń | `tokenVersion` w JWT → „wyloguj wszędzie" + bump przy resecie hasła + `POST /auth/logout-all` | `schema.prisma`, `jwt.strategy.ts`, `auth.service.ts`, `auth.controller.ts` |
| **C4** Domeny | OpenProvider — kod providera już istniał, podpięto env (compose + example) | `registrar.provider.ts` (istniał), `docker-compose.prod.yml` |

Audyt węzła pokazuje status nowych możliwości (`[VERRIS_PROFILE] ssl=… dkim=… redis=… php_selector=…`).

### Zrobione w drugiej iteracji (2026-06-10b) ✅
| Task | Co | Kluczowe pliki |
|---|---|---|
| **C2** Passkeys (WebAuthn) | logowanie bez hasła (discoverable credentials), zarządzanie kluczami w panelu klienta (Ustawienia → Passkeys), przycisk „Zaloguj się passkey" na ekranie logowania, challenge w DB z TTL, eco-punkty za pierwszy passkey | `apps/api/src/auth/webauthn/*`, `auth.controller.ts` (`/auth/webauthn/*`), `passkeys-section.tsx`, `passkey-login-button.tsx`, migracje `20260610100000` + `20260610140000` |
| **A4** WordPress 1-click | task `WP_INSTALL` per konto: DA tworzy bazę+usera (tracked), agent węzła pobiera skrypt i instaluje wp-cli jako użytkownik konta (CageFS-safe, tar zamiast unzip w PHP), LiteSpeed Cache + permalinki out-of-the-box, zakładka **Aplikacje** w usłudze (formularz, polling statusu, hasło admina pokazane raz) | `node-wp-install.sh`, `wordpress.service.ts`, `WordpressTab.tsx`, SDK `createMysqlDatabase`, migracja `20260610110000` |
| **B2** WAF ModSecurity | OWASP CRS serwerowo (CustomBuild `modsecurity` + `modsecurity_ruleset owasp` w profilu hostingowym), tryb per konto OFF/DETECTION/ON przez task `WAF_APPLY` (zarządzany blok `SecRuleEngine` w .htaccess), **zakładka WAF w panelu klienta** (3 tryby z opisami), **panel WAF na stronie węzła w adminie** (tabela kont + przełączniki), domyślnie DETECTION dla nowych kont (auto przy provisioningu), `wafAppliedAt` potwierdzane przez agenta | `node-waf-apply.sh`, `waf.service.ts`, `waf.admin.controller.ts`, `WafTab.tsx`, `waf-panel.tsx`, migracja `20260610120000` |

> Po deployu: profil hostingowy trzeba uruchomić ponownie na węźle (panel → węzeł →
> „Profil hostingowy"), żeby CustomBuild dograł ModSecurity + OWASP CRS.
> Wymagane env dla passkeys: `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS` (przykład w `.env.prod.example`).
> Zależności: `pnpm install` doinstaluje `@simplewebauthn/server` (api) i `@simplewebauthn/browser` (client-panel).

### Zrobione w trzeciej iteracji (2026-06-10c) ✅
| Task | Co | Kluczowe pliki |
|---|---|---|
| **B3** Monitoring stron | Opt-in per usługa: **jeden przełącznik, zero konfiguracji** (URL = domena główna). Control-plane sprawdza co minutę (timeout 10 s, UP = odpowiedź < 500), anti-flap (2 nieudane checki przed alarmem), **e-mail przy awarii + e-mail przy powrocie z czasem przerwy**, zakładka **Monitoring** w usłudze: status na żywo (auto-odświeżanie 30 s) + historia zdarzeń | `site-monitor.service.ts` (serwis+cron), `site-monitoring-notifications.ts` (szablony), `MonitoringTab.tsx`, migracja `20260610150000` |
| **B5** Staging 1-click | Jedna kopia robocza per usługa (`staging.<domena>`), 3 akcje: **Utwórz/Odśwież z produkcji** (rsync plików + dla WordPressa kopia bazy z `wp search-replace` adresów i `blog_public 0`), **Opublikuj na produkcję** (z potwierdzeniem; najpierw tar-backup plików + dump bazy LIVE do `~/.verris/backups`, retencja 3), **Usuń**. Operacje na węźle jako użytkownik konta (CageFS), task `STAGING_SYNC`, polling statusu w UI, przepisana zakładka **Staging** | `node-staging-sync.sh`, `staging.service.ts`, `StagingTab.tsx` (nowy 1-click flow), runner/poller agenta |

> B3: monitor sprawdza tylko usługi ACTIVE; wyłączenie subskrypcji wyłącza
> sprawdzanie automatycznie. B5: dla stron nie-WordPress kopiowane są pliki
> (baza pomijana — komunikowane w logu zadania `wp=no`).

### Zrobione w czwartej iteracji (2026-06-10d) ✅
| Task | Co | Kluczowe pliki |
|---|---|---|
| **C1** Bezpiecznik kosztów | Wyraźny komunikat-gwarancja w panelu autoskalowania: „nie zapłacisz więcej niż X / 30 dni", pasek wykorzystania bezpiecznika, podpowiedź ustawienia limitu gdy brak. Cap egzekwowany przez silnik (F-01) | `autoscaling/page.tsx` (SpendCard) |
| **C5** Raport EKO | Energia (kWh) + ślad CO₂e + oszczędność vs „VPS 24/7" + ekwiwalent pracy drzewa — liczone z **REALNYCH** metryk LVE (cpuUsageAvg, memUsageAvgMb), jawna metodologia w UI (szacunki). Sekcja na stronie autoskalowania | `eco-report.service.ts`, `eco-report-card.tsx` |
| **SEC** FTPS | Wymuszenie FTP-over-TLS w profilu hostingowym (`ftpd_tls=yes` + pure-ftpd `TLS 2`) | `node-hosting-profile.sh` |

### Ocena prawno-bezpieczeństwowa
Pełny raport: **`OCENA_PRAWNA_I_BEZPIECZENSTWO_2026-06-10.md`** (część techniczna + RODO,
z priorytetami i werdyktem).

### Zrobione w czwartej iteracji (2026-06-11) ✅
| Task | Co | Kluczowe pliki |
|---|---|---|
| **B-1 KSeF** | Pełny moduł e-Faktur: generator **FA(2) XML** z realnych danych faktury (snapshoty, rozbicie VAT, pozycje; walidacja NIP/kwot, escape XML, BrakID dla konsumentów), **klient KSeF** (challenge → sesja tokenowa z szyfrowaniem RSA kluczem MF → Invoice/Send → polling statusu → terminate), **scheduler co 10 min** z trybem offline (awaria KSeF = retry, nic nie ginie), statusy na fakturze (PENDING/SUBMITTED/ACCEPTED/REJECTED + numer KSeF), hook przy finalizacji faktury, admin `/admin/ksef/overview` + retry odrzuconych, testy jednostkowe buildera, smoke `ops/scripts/ksef-smoke.ts` | `apps/api/src/ksef/*`, migracja `20260611100000_ksef`, env `KSEF_*` |
| **Passkeys admin+staff** | Przyciski „Zaloguj się passkey" na loginach obu paneli (discoverable credentials), **weryfikacja roli przed zapisem cookie** (ADMIN / STAFF-ADMIN), passkey przechodzi wymóg `REQUIRE_2FA_FOR_STAFF` (phishing-resistant MFA — silniejsze niż TOTP) | `apps/{admin,staff}-panel/src/app/login/passkey-*` |

**Aktywacja KSeF (po deployu):**
1. Konto na **ksef-test.mf.gov.pl** → wygeneruj token (uprawnienie: wystawianie) + pobierz klucz publiczny MF dla środowiska testowego.
2. `KSEF_NIP/KSEF_TOKEN/KSEF_PUBLIC_KEY_PEM_B64` (test) → `npx tsx ops/scripts/ksef-smoke.ts` → musi wypisać numer KSeF. ⚠️ Smoke weryfikuje też kontrakt API (implementacja wg dokumentowanego API v1 online; KSeF 2.0 może wymagać korekt endpointów — smoke to wykryje).
3. Po sukcesie: env produkcyjne (`KSEF_ENV=prod`, prod-token, prod-klucz) + `KSEF_ENABLED=1`.
4. 🧑‍⚖️ Decyzja prawnika: czy faktury Stripe-hosted też raportować (dziś: tylko własne VERRIS — przełącznik w `KsefService.qualifies`).

### Do dokończenia — wymaga decyzji / zależności / osobnej iteracji
| Task | Co brakuje |
|---|---|
| **C4** OpenProvider LIVE | utworzyć **registrant/owner handle** + uzupełnić `OPENPROVIDER_*` (konto + depozyt) — instrukcja w sekcji 0 |
| **B1** Backupy kont klientów | off-node + self-restore w panelu (najwyższy priorytet wg oceny S-1) |
| **L-1** Review prawnika | dokumenty DRAFT → LIVE + dane rejestrowe + DPA z subprocesorami (blocker organizacyjny) |

> **Ważne po stronie buildu:** uruchom lokalnie `pnpm --filter @verris/database db:generate`
> (nowe pola Plan.sshAccess, User.tokenVersion, VpnPeer, Server.*), potem
> `pnpm typecheck && pnpm build && pnpm --filter api test`.

### Sugerowana kolejność dalej
1. Po deployu: konfiguracja OpenProvider (C4 live) + wygenerowanie owner handle.
2. C2 passkeys (po `pnpm add` — silny sygnał security, niski koszt).
3. A4 WordPress installer (najczęściej oczekiwana funkcja przez klientów).
4. B3 monitoring stron + B5 staging.
5. B2 (decyzja: Imunify płatny vs ModSecurity darmowy), C1 copy, C5 eko.
