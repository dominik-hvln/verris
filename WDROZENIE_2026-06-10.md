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
