# Wdrożenie 2026-06-10 — commit, deploy, VPN, batch funkcji

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

### Do dokończenia — wymaga decyzji / zależności / osobnej iteracji
| Task | Co brakuje |
|---|---|
| **A1** | utworzyć **registrant/owner handle** + uzupełnić `OPENPROVIDER_*` (konto + depozyt OpenProvider) — dot. C4 |
| **A4** WordPress 1-click | nowy rodzaj NodeTask `WP_INSTALL` + wp-cli na węźle + UI w panelu klienta (większy task, zaplanuję następny) |
| **B2** Malware/WAF | wymaga licencji **Imunify360/ImunifyAV+** per węzeł (decyzja kosztowa) lub ModSecurity+OWASP CRS (darmowe) |
| **B3** Monitoring stron | rozszerzenie istniejącego probera o probe per domena klienta (opt-in) + notyfikacje |
| **B5** Staging 1-click | NodeTask `STAGING_CLONE` (kopia plików+bazy do subdomeny, push-to-live) |
| **C1** Marketing capa | cap działa (F-01) — zostało copy/UI w panelu klienta „nigdy nie zapłacisz > X" |
| **C2** Passkeys | wymaga zależności `@simplewebauthn/server` + `@simplewebauthn/browser` (instalacja `pnpm add` lokalnie — sandbox nie ma dostępu do registry) |
| **C5** EKO raport | model CO₂/kWh per konto + badge (Etap G w PROJECT_STATUS) |

> **Ważne po stronie buildu:** uruchom lokalnie `pnpm --filter @verris/database db:generate`
> (nowe pola Plan.sshAccess, User.tokenVersion, VpnPeer, Server.*), potem
> `pnpm typecheck && pnpm build && pnpm --filter api test`.

### Sugerowana kolejność dalej
1. Po deployu: konfiguracja OpenProvider (C4 live) + wygenerowanie owner handle.
2. C2 passkeys (po `pnpm add` — silny sygnał security, niski koszt).
3. A4 WordPress installer (najczęściej oczekiwana funkcja przez klientów).
4. B3 monitoring stron + B5 staging.
5. B2 (decyzja: Imunify płatny vs ModSecurity darmowy), C1 copy, C5 eko.
