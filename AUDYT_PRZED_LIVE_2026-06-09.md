# Audyt przed LIVE — Verris (2026-06-09)

Audyt całościowy: bezpieczeństwo, flow płatności, autoskalowanie, API, integracje (DirectAdmin/CloudLinux/LiteSpeed, Stripe, OVH, mail), proces dodawania węzła.
Zakres przejrzany w kodzie: `apps/api` (auth, billing, autoscaling, servers, subscriptions, telemetry), `libs/directadmin-sdk`, `apps/admin-panel` (wizard węzłów), `ops/` (skrypty, docker-compose.prod, deploy), dokumentacja `.md`.

**Werdykt: warunkowe GO.** Architektura jest solidna i spójna z dokumentacją — ale znalazłem **2 błędy finansowe (F-01, F-02), które trzeba naprawić przed przyjęciem płacących klientów**, oraz kilka luk bezpieczeństwa na styku control-plane ↔ węzeł.

---

## Co działa dobrze (potwierdzone w kodzie)

- **Bootstrap węzła:** tokeny jednorazowe, hashowane SHA-256, TTL 48h, konsumowane atomowo; identity token zwracany dokładnie raz; idempotentny re-handshake; skrypt z weryfikacją (shebang, bash -n, timery, lease API).
- **Wizard węzła** prowadzi admina krok po kroku (wymagania → CloudLinux → DA → LiteSpeed → bootstrap → approve+DA → profil hostingowy → DoD), zapisuje postęp, wymusza FQDN przed approve, linkuje audyt węzła z walidatorami i przyciskami napraw.
- **Portfel:** append-only ledger, atomiczny zapis tx + salda, idempotency keys, no-negative; blokowe rozliczanie autoskalowania co 15 min z deterministycznym kluczem `autoscale-block:<sub>:<blockStart>` — silnik i cron nie dublują obciążeń.
- **Stripe:** weryfikacja HMAC podpisu webhooka z tolerancją 300 s i `timingSafeEqual`, idempotentne kredyty (`stripe:checkout:<session>`, `stripe:pi:<pi>`), obsługa Basil+ (periods w items, parent.subscription_details), aktywacja DA dopiero po `invoice.paid`.
- **Auth:** bcrypt, lockout per e-mail bez enumeracji, 2FA TOTP z challenge tokenem o osobnym `purpose`, hashowane tokeny resetu/weryfikacji z TTL i unieważnianiem, JwtStrategy czyta rolę z DB (nie z tokenu).
- **Sekrety:** AES-256-GCM (`v1.iv.tag.ct`), klucz z `APP_KMS_KEY` (wymusza ≥32 znaki), CLI rotacji; konfiguracja fail-fast w prod; `.env.prod` poza repo; compose: tylko Caddy wystawiony publicznie, DB/Redis w sieci wewnętrznej.
- **Telemetria:** `ServerIdentityGuard`, próbki filtrowane po `serverId` węzła (węzeł nie może raportować cudzych kont), idempotencja per bucket.
- **Autoskalowanie:** histereza (3/5 bucketów, progi 80%/30%), krok 25% planu, sufit per zasób z planu (max 10×), guard portfela (min 1 PLN), wymuszony powrót do baseline + auto-disable przy braku środków, e-mail na start/koniec epizodu (bez spamu per tick).

---

## Znaleziska

Severity: **KRYTYCZNE** (przed LIVE) / **WYSOKIE** (pierwszy tydzień) / **ŚREDNIE** / **NISKIE**.

### F-01 · KRYTYCZNE · Cap kosztów autoskalowania nigdy nie zadziała (błąd znaku)
`apps/api/src/autoscaling/autoscaling-engine.service.ts:560-571` (`thirtyDaySpend`)
Debity w ledgerze zapisywane są jako **kwoty ujemne** (`WalletLedgerService.applyEntry` → `amount.negated()`). `thirtyDaySpend` sumuje `amount` bez wartości bezwzględnej, więc zwraca liczbę ujemną. Warunek `spent + projectedHourly > cap` przy `cap > 0` jest praktycznie nigdy spełniony → **limit `autoscalingMaxCost` ustawiony przez klienta nie jest egzekwowany**; klient może zostać obciążony ponad swój cap. Dowód niespójności: `episodeSpendPln` w `autoscaling-billing.service.ts:223-233` poprawnie używa `Math.abs`.
**Fix:** `Math.abs(Number(sum._sum.amount ?? 0))` + test jednostkowy guardu cap.

### F-02 · KRYTYCZNE · Brak blokady wiersza przy operacjach na portfelu (lost update)
`apps/api/src/billing/wallet-ledger.service.ts:102-139`
`applyEntry` robi read-modify-write salda (`findUnique` → `update`) w transakcji Prisma na domyślnym poziomie **READ COMMITTED** — dwie równoległe operacje (np. cron renewal + blok autoskalowania + webhook top-up + zakup w panelu) mogą odczytać to samo saldo i nadpisać się nawzajem: zgubiony kredyt/debet lub zejście poniżej zera mimo checku. Dodatkowo check idempotency jest **przed** transakcją — równoległy duplikat kończy się błędem P2002 zamiast zwrotem istniejącej tx.
**Fix:** `SELECT … FOR UPDATE` (`$queryRaw`) na userze wewnątrz transakcji **albo** atomowy `UPDATE "User" SET "walletBalance" = "walletBalance" + $delta WHERE id = $id AND ("walletBalance" + $delta) >= 0` z weryfikacją `count`; łapać P2002 na `idempotencyKey` i zwracać istniejący wpis.

### F-03 · WYSOKIE · Identity token węzła w DB plaintext
`libs/database` (`Server.identityToken`), `apps/api/src/servers/guards/server-identity.guard.ts:38-45`
Bootstrap tokeny są wzorowo hashowane, ale **token tożsamości węzła leży w DB otwartym tekstem**. Wyciek DB/backupu = możliwość podszycia się pod każdy węzeł: fałszywa telemetria (→ sztuczne scale-upy i obciążenia portfeli klientów), lease zadań, pobranie deploy SSH pubkey, zatruwanie probe'ów.
**Fix:** przechowywać `sha256(identityToken)`, porównywać hash; migracja z jednorazową rotacją tokenów (wymusi re-handshake lub skrypt rotacji na węzłach).

### F-04 · WYSOKIE · TLS do DirectAdmin bez weryfikacji certyfikatu (MITM)
`libs/directadmin-sdk/src/client.ts:212-214` (`rejectUnauthorized ?? false`), runbook wprost: „TLS ON (`rejectUnauthorized: false`)”
API łączy się z DA `:2222` po **publicznym internecie** z wyłączoną weryfikacją cert. MITM = przejęcie admin login key węzła = pełna kontrola nad kontami klientów.
**Fix:** wystawić LE cert na `:2222` (jest gotowy skrypt `ops/scripts/node-directadmin-tls-http01.sh` / wildcard), domyślnie `rejectUnauthorized: true` + per-node flaga wyjątku tylko na czas onboardingu.

### F-05 · WYSOKIE · Nieidempotentny klucz przy ręcznym odnowieniu (podwójne obciążenie)
`apps/api/src/subscriptions/subscriptions.service.ts:622` i `:648`
`idempotencyKey: \`sub-…-manual-renew-${Date.now()}\`` — `Date.now()` niweczy idempotencję: retry/double-click przy unsuspend z `chargeRenewal` może obciążyć klienta dwa razy (refund path też ma `Date.now()`).
**Fix:** klucz deterministyczny, np. `sub-<id>-manual-renew-<currentPeriodEnd ISO>`.

### F-06 · ŚREDNIE · Wymuszony scale-down dysku poniżej faktycznego zużycia
`autoscaling-engine.service.ts:195-211` (guard block → reset do baseline) i logika DOWN
Przy `wallet_empty`/`cap_reached` konto wraca do limitów bazowych **bez sprawdzenia bieżącego zużycia dysku**. Jeśli klient zdążył zapisać dane w przeskalowanej przestrzeni, quota w DA spada poniżej zużycia → konto over-quota (strony, maile, cron przestają zapisywać). CPU/RAM są ulotne — dysk nie.
**Fix:** przy DOWN dysku nie schodzić poniżej `diskUsageMb * 1.05` z ostatniego bucketa; jeśli baseline < usage → zostawić podwyższony limit, oznaczyć subskrypcję do działań BOK + e-mail do klienta.

### F-07 · ŚREDNIE · Wizard węzła nie obejmuje Fazy 3 runbooka (hardening + DA IP)
`apps/admin-panel/.../nodes/wizard/*` vs `ops/docs/NODE_ONBOARD_RUNBOOK.md` (Faza 3)
Kroki wizarda kończą się na profilu hostingowym. **Poza wizardem zostają:** `security-hardening-baseline.sh`, `security-egress-lockdown.sh`, rejestracja publicznego IP w DA (`ips/`), pełny `node-onboard-live.sh`. Admin prowadzony tylko wizardem wystawi węzeł **bez hardeningu** i może trafić na `A valid IP was not provided` przy pierwszym provisioningu (ensureUserPackage łata pakiety, ale IP w DA nikt nie rejestruje automatycznie).
**Fix:** dodać krok wizarda „Onboard LIVE (SSH)” z gotowym blokiem scp+run i checkboxami; w audycie węzła dodać walidatory: „publiczne IP zarejestrowane w DA”, „hardening wykonany” (marker file na węźle raportowany przez agenta).

### F-08 · ŚREDNIE · Zablokowany użytkownik zachowuje dostęp do wygaśnięcia JWT
`apps/api/src/auth/strategies/jwt.strategy.ts` — `validate` sprawdza istnienie usera i subkonto, ale **nie sprawdza `loginBlocked`**; JWT żyje domyślnie 1 dzień (`JWT_EXPIRES_IN=1d`), brak revocation.
**Fix (tanie):** dodać `loginBlocked: true` do selecta i odrzucać; rozważyć skrócenie TTL do 1–4 h dla USER.

### F-09 · ŚREDNIE · Brak rate limitingu na API
Brak `@nestjs/throttler`/helmet w `main.ts`. Lockout jest tylko na logowaniu (per e-mail). `register`, `password-reset`, `request-email-verification` można wołać masowo → spam mailowy z Twojej domeny (reputacja IP/DKIM), koszty.
**Fix:** ThrottlerModule globalnie + ostrzejsze limity na `/auth/*`; opcjonalnie captcha na rejestracji.

### F-10 · ŚREDNIE · `trust proxy` nieustawione + spoofowalny X-Forwarded-For
`apps/api/src/main.ts` (brak `app.set('trust proxy', …)`) mimo komentarza w `request-context.ts`, który twierdzi, że jest. `extractRequestContext` bierze **leftmost** XFF — wartość kontrolowaną przez klienta. Audyt RODO, login events i `usedFromIp` bootstrap tokenów mogą zapisywać sfałszowane IP.
**Fix:** `app.set('trust proxy', 1)` (Caddy jako jedyny proxy) i używać `req.ip`; XFF tylko jako fallback z prawego końca.

### F-11 · ŚREDNIE · Provisioning: osierocone konto DA przy błędzie limitów
`apps/api/src/subscriptions/provisioning.service.ts:180-198`
Jeśli `setAccountLimits` rzuci po udanym `createAccount`, flow przerywa się (refund portfela zadziała), ale **konto DA z domeną zostaje na węźle** — ponowna próba zakupu tej domeny wysypie się na DA („domain exists”), a sprzątanie jest ręczne.
**Fix:** w catch — best-effort `deleteAccount(daUsername)` + audyt `PROVISIONING_ROLLBACK`.

### F-12 · NISKIE · Niespójny sentinel `pending:` vs `pending-`
`servers.service.ts:119` rezerwuje `pending:<token>`, a `provisioning.service.ts:47` filtruje `startsWith('pending-')`. Dziś nieosiągalne (NodeSelector odrzuca węzły bez capacity), ale to mina.
**Fix:** ujednolicić prefix + test.

### F-13 · NISKIE · Re-handshake na ACTIVE pali świeży bootstrap token
`servers.controller.ts` — guard **konsumuje** token zanim serwis stwierdzi idempotentny no-op dla węzła ACTIVE/MAINTENANCE. Ponowny bieg skryptu „zużywa” token mimo braku efektu; kolejny bieg wymaga nowego skryptu. UX/operacyjne.

### F-14 · NISKIE · Crony bez leader-election
~20 `@Cron` (engine co 1 min, billing co 5 min, renewal co 1 h…) bez locków. Przy 1 replice API (obecny compose) OK — **udokumentować twardo: API skalujemy tylko wertykalnie**, albo dodać redlock przed skalowaniem horyzontalnym.

### F-15 · NISKIE · Hasło DA wysyłane e-mailem plaintext
`provisioning.service.ts:305-331`. Jest Magic Login w panelu — e-mail mógłby zawierać tylko login + link, bez hasła.

### F-16 · NISKIE · Drobiazgi webhooka Stripe
(a) `handlePaymentIntentSucceeded` inkrementuje liczniki `walletAutoTopup` nawet przy idempotentnym hicie ledgera → retry webhooka zawyża statystyki (nie pieniądze). (b) Parser podpisu bierze ostatnie `v1` — przy rotacji sekretu Stripe wysyła dwa podpisy `v1`; warto weryfikować przeciwko wszystkim. (c) Brak deduplikacji po `event.id` (ledger to łata dla operacji pieniężnych, ale handlery stanowe wykonują się ponownie).

### F-17 · NISKIE · ServerIdentityGuard ignoruje status węzła
Węzeł `OFFLINE`/`DEPROVISIONING` nadal może lease'ować zadania i pushować telemetrię. Odrzucać poza `ACTIVE`/`MAINTENANCE`.

### F-18 · NISKIE · PATCH /admin/servers/:id pozwala ustawić dowolny status
`UpdateServerDto.status` omija `approveServer` (wymóg FQDN, hooki TLS/NS/profil). NodeSelector broni się brakiem capacity, ale lepiej walidować dozwolone przejścia stanów (lub wyciąć `status` z PATCH).

### F-19 · INFO · Zaokrąglenia 4 dp vs kolumny Decimal(12,2)
Kwoty bloków liczone do 4 miejsc, kolumny portfela mają 2 — różnice są spójnie zaokrąglane przez DB, ale suma raportowa (`amountChargedPln` w wyniku przebiegu) może różnić się o grosze od ledgera. Kosmetyka — ujednolicić `roundToCurrency` do 2 dp.

---

## Ocena obszarów end-to-end

| Obszar | Ocena | Uwagi |
|---|---|---|
| Flow płatności (top-up, zakup, renewal, grace, suspend) | ✅ dobry | po naprawie F-02/F-05 |
| Autoskalowanie (telemetria → engine → DA/LVE → billing 15 min) | ⚠️ | F-01 (cap) i F-06 (dysk) do naprawy; reszta pętli spójna, idempotentna |
| Dodawanie węzła | ✅/⚠️ | flow panelowy bardzo dobry; luka = Faza 3 poza wizardem (F-07) + F-03/F-04 na styku |
| API / auth / RBAC | ✅ | F-08, F-09, F-10 to hardening, nie dziury krytyczne |
| Integracje (Stripe, OVH NS, mail, Grafana) | ✅ | drobiazgi F-16 |
| Ops (compose, backup, runbooki, audyt węzła) | ✅ | F-14 dokumentacyjnie |

---

# PLAN NAPRAWCZY — ETAPY

> **STATUS 2026-06-09: ETAPY 1–6 ZAIMPLEMENTOWANE W KODZIE.** ✅
>
> Co zostało zrobione (skrót):
> - **ETAP 1:** F-01 (`Math.abs` + test `autoscaling-engine.cap.spec.ts`), F-02 (`SELECT … FOR UPDATE` + P2002 race-resolve + test `wallet-ledger.service.spec.ts` + stress-skrypt `ops/scripts/test-wallet-concurrency.ts`), F-05 (deterministyczny anchor `currentPeriodEnd`).
> - **ETAP 2:** F-03 (hash SHA-256 identity tokenu + **lazy-migracja** legacy wpisów — węzły bez akcji), F-04 (`rejectUnauthorized: true` domyślnie w SDK, per-node `daAllowInvalidCert` + migracja + formularz admina + check FAIL w audycie węzła), F-17 (guard odrzuca statusy poza ACTIVE/MAINTENANCE/PENDING_APPROVAL), F-18 (walidacja przejść statusów w PATCH).
> - **ETAP 3:** F-06 (floor dysku 105% zużycia przy DOWN i wymuszonym reset + audyt `AUTOSCALING_DISK_FLOOR_HELD`), F-19 (zaokrąglenia 2 dp), testy `autoscaling-billing.service.spec.ts`.
> - **ETAP 4:** F-07 (nowy krok wizarda „Onboard LIVE (SSH)” + walidatory audytu: **IP w DA** (`CMD_API_IP_CONFIG` w SDK) i **hardening** (marker `/etc/verris-hardened` → agent → `Server.hardenedEnabled`)), F-11 (rollback `deleteAccount` + audyt), F-12 (walidacja kształtu IP + spójny sentinel), F-13 (peek/markUsed — no-op nie pali tokenu).
> - **ETAP 5:** F-09 (własny `RateLimitGuard` global + ostre limity `/auth/*`, klucz IP+email), F-08 (`loginBlocked`/`anonymizedAt` w JwtStrategy — blokada działa natychmiast), F-10 (`trust proxy` + nagłówki bezpieczeństwa + `req.ip` jako źródło prawdy), F-16 (dedupe webhooków po `event.id` — tabela `StripeWebhookEvent` + retencja 90 dni, multi-`v1` przy rotacji sekretu, liczniki auto-topup tylko przy świeżej tx).
> - **ETAP 6:** F-14 (sekcja w `DEPLOY.md` — API tylko 1 replika), F-15 (e-mail provisioningu bez hasła — Magic Login), checklista `docs/SMOKE_E2E_PRZED_LIVE.md` (w tym restore drill i RODO).
>
> **Wymagane po Twojej stronie (lokalnie, sandbox nie ma dostępu do registry/binarek):**
> 1. `pnpm --filter @verris/database db:generate` (nowe pola/model w Prisma Client),
> 2. `pnpm typecheck && pnpm build`,
> 3. `pnpm --filter api test` (nowe spec-i: cap guard, wallet ledger, block billing),
> 4. deploy: `prisma migrate deploy` (3 nowe migracje — patrz `DEPLOY.md → Migracje audytu 2026-06-09`),
> 5. smoke wg `docs/SMOKE_E2E_PRZED_LIVE.md` (sekcja D pkt „cap” i sekcja G — kluczowe regresje).

Wskazuj numer etapu do realizacji. Kolejność = priorytet.

## ETAP 1 — Blokery finansowe (PRZED LIVE, ~1 dzień)
**Cel: żaden klient nie może zostać błędnie obciążony.**
- [ ] 1.1 **F-01**: `Math.abs` w `thirtyDaySpend` + unit test: cap 10 PLN, spend 9.99, projected 0.02 → `cap_reached`.
- [ ] 1.2 **F-02**: blokada wiersza/atomowy UPDATE w `WalletLedgerService.applyEntry`; idempotency wewnątrz transakcji; obsługa P2002 → zwrot istniejącej tx.
- [ ] 1.3 **F-05**: deterministyczne klucze idempotency w manual renew + refund.
- [ ] 1.4 Test współbieżności: 20 równoległych debit/credit na jednym userze (skrypt lub jest test) — saldo końcowe = suma ledgera; suma `balanceAfter` spójna.

**DoD:** testy zielone; ręczny smoke: cap egzekwowany na stagingu; brak rozjazdu salda przy równoległym renewal+autoscaling.

## ETAP 2 — Bezpieczeństwo styku control-plane ↔ węzeł (~2-3 dni)
- [ ] 2.1 **F-03**: hash identityToken w DB (kolumna `identityTokenHash`), migracja + rotacja na Node-PL-01.
- [ ] 2.2 **F-04**: LE/wildcard cert na DA `:2222`, `rejectUnauthorized: true` domyślnie, per-node opt-out tylko dla onboardingu; test połączenia w panelu pokazuje status weryfikacji cert.
- [ ] 2.3 **F-17**: guard odrzuca węzły poza ACTIVE/MAINTENANCE.
- [ ] 2.4 **F-18**: walidacja przejść statusów w `updateServer` (INIT→… tylko przez handshake/approve; ACTIVE↔MAINTENANCE przez maintenance toggle; OFFLINE/DEPROVISIONING jawnie).

**DoD:** audyt węzła pokazuje „DA TLS: zweryfikowany”; podszycie się starym tokenem niemożliwe.

## ETAP 3 — Autoskalowanie: ochrona klienta (~1-2 dni)
- [ ] 3.1 **F-06**: floor scale-down dysku = ostatnie `diskUsageMb` + 5%; gdy baseline < usage → utrzymaj limit, flaga dla BOK, e-mail do klienta.
- [ ] 3.2 **F-19**: ujednolicić zaokrąglenia do 2 dp (`roundToCurrency`).
- [ ] 3.3 Test integracyjny epizodu: spike → UP → 2 bloki → wallet empty → pauza billingu (bez przesuwania `scaledBilledUntil`) → top-up → dobicie zaległego bloku → DOWN.

**DoD:** symulacja na stagingu z mock DA przechodzi; brak kont over-quota po wymuszonym DOWN.

## ETAP 4 — Onboarding węzła: domknięcie automatyzacji (~2 dni)
- [ ] 4.1 **F-07**: nowy krok wizarda „Onboard LIVE (SSH)” — copy-block z `scp` + `node-onboard-live.sh` (z `DA_USER`/`DA_KEY`), checkboxy hardening/egress/DA-IP.
- [ ] 4.2 **F-07**: walidatory w audycie węzła: publiczne IP w DA (`CMD_API_IP_CONFIG` lub plik `ips/`), marker hardeningu raportowany przez agenta (np. `/etc/verris-hardened`), pakiety planów zsynchronizowane (jest) — wszystko widoczne przed pierwszym provisioningiem.
- [ ] 4.3 **F-11**: rollback `deleteAccount` przy fail `setAccountLimits` + audyt.
- [ ] 4.4 **F-12**: ujednolicenie sentinela `pending:`/`pending-` + guard w `resolveDaAccountIp` na nie-IP (regex IPv4/IPv6).
- [ ] 4.5 **F-13**: w handshake — sprawdzenie statusu serwera **przed** konsumpcją tokenu (przenieść lookup do guard/serwisu) albo nie palić tokenu przy no-op.

**DoD:** świeży węzeł od zera wyłącznie wg wizarda → smoke provisioning przechodzi bez SSH-owych niespodzianek; audyt węzła „zielony” = naprawdę gotowy.

## ETAP 5 — Hardening API (~1-2 dni)
- [ ] 5.1 **F-09**: `@nestjs/throttler` globalnie (np. 100 req/min/IP) + ostre limity `/auth/*` (5/min) i mailowych endpointów (3/h/email).
- [ ] 5.2 **F-08**: `loginBlocked` w `JwtStrategy.validate`; rozważ TTL 4 h dla USER.
- [ ] 5.3 **F-10**: `app.set('trust proxy', 1)`; `req.ip` jako źródło prawdy; helmet.
- [ ] 5.4 **F-16**: dedupe webhooków po `event.id` (tabela `StripeWebhookEvent` z unique), liczniki auto-topup tylko gdy tx świeża (porównać `tx.createdAt`), weryfikacja wszystkich podpisów `v1`.

**DoD:** testy auth przechodzą; powtórzony webhook nie zmienia stanu; XFF spoof nie wpływa na audyt.

## ETAP 6 — Ops i procesy (przed/tuż po LIVE)
- [ ] 6.1 **F-14**: adnotacja w `DEPLOY.md` + asercja startowa (np. odmowa startu cronów gdy `API_REPLICAS>1` bez locka); opcjonalnie redlock na Redis.
- [ ] 6.2 **F-15**: e-mail provisioningu bez hasła (login + Magic Login link).
- [ ] 6.3 Smoke E2E przed LIVE (checklista): rejestracja+2FA → top-up Stripe (webhook) → zakup z portfela → provisioning DA → Magic Login → wymuszony spike → autoscaling UP + obciążenie bloku → top-down → renewal z portfela → grace → suspend/unsuspend → faktura PDF.
- [ ] 6.4 Restore drill backupu DB wg `ops/docs/RESTORE_TEST.md` (potwierdzić datę ostatniego drilla przed LIVE).

---

## Sugerowana kolejność przed przyjęciem pierwszego płatnego klienta
**Minimum:** ETAP 1 w całości + 2.2 (TLS do DA) + 6.3 (smoke E2E).
Reszta etapów może iść równolegle w pierwszym tygodniu po starcie.

---

## ETAP 7 — Domknięcie przed faktycznym startem LIVE (dodane 2026-06-09, druga runda)

### Zrobione w kodzie (ta runda) ✅
- [x] 7.1 **Caddy: nagłówki bezpieczeństwa** — HSTS (31536000 + includeSubDomains), nosniff, Referrer-Policy, X-Frame-Options DENY + Permissions-Policy dla paneli, usunięty banner serwera (`ops/Caddyfile`, snippety `security_headers`/`panel_headers`).
- [x] 7.2 **Wymuszenie 2FA dla ADMIN/STAFF** — `REQUIRE_2FA_FOR_STAFF=1` w env (po enrollmencie TOTP na kontach seedowych!); blokada logowania + audyt `LOGIN_BLOCKED_2FA_REQUIRED`. Dodane do `.env.prod.example`.
- [x] 7.3 **Przekazywanie realnego IP klienta z paneli do API** — `apiFetch` (client), `adminApi`, `staffApi` + login staff forwardują `x-forwarded-for` z requestu przychodzącego. Bez tego CAŁY ruch panelowy uderzał w API z IP kontenera: per-IP rate limit dławiłby prawdziwych użytkowników, a lockout/audyt widziały zły adres. (Krytyczne w połączeniu z ETAP 5.)

### Do wykonania operacyjnie (checklist przed GO) ⬜
- [ ] 7.4 **Backupy — pojedynczy punkt awarii.** MinIO z backupami żyje na tym samym hoście co Postgres, a mirror offsite jest domyślnie WYŁĄCZONY (`MIRROR_EXTERNAL_ENABLED=0`). Przed LIVE: skonfiguruj drugi endpoint (inny DC/dostawca: B2/R2/dedyk), `MIRROR_EXTERNAL_ENABLED=1`, rozważ szyfrowanie dumpów (age/GPG) przed uploadem — dump zawiera dane osobowe klientów (RODO). Restore drill z datą w `docs/SMOKE_E2E_PRZED_LIVE.md`.
- [ ] 7.5 **Staff/admin panel za ograniczeniem sieciowym.** Komentarz w Caddyfile („restrict to office IPs in production!") nie jest zrealizowany — dodaj matcher `remote_ip` dla staff/admin domen albo schowaj je za VPN/WireGuard.
- [ ] 7.6 **Stripe live cutover:** klucze live + live webhook secret + webhook URL w dashboardzie, transakcja testowa za ~1 PLN end-to-end (top-up → webhook → saldo → refund), payouty/KYC potwierdzone.
- [ ] 7.7 **Poczta:** przejdź `docs/ops/MAIL_DNS_CHECKLIST.md` — SPF/DKIM/DMARC (docelowo p=quarantine z `rua=`), rDNS IP nadawczego, test na mail-tester.com ≥ 9/10. Maile transakcyjne (faktury, resety) to krwiobieg platformy.
- [ ] 7.8 **Alerty z powiadomieniem na człowieka:** Prometheus ma reguły (m.in. `VerrisPostgresBackupStale`, `VerrisProvisioningQueueFailed`) — podepnij i PRZETESTUJ kanał (Slack/e-mail/SMS) w Grafanie; do tego **zewnętrzny uptime monitor** (UptimeRobot/BetterStack) na panel/api/status — niezależny od własnej infry, bo gdy padnie control-plane, padają też własne alerty.
- [ ] 7.9 **Konta seedowe:** zmienione hasła, TOTP na admin+staff, dopiero potem `REQUIRE_2FA_FOR_STAFF=1`.
- [ ] 7.10 **Legal/RODO LIVE:** publikacja regulaminu+privacy w wersji LIVE (`prod-legal-publish-live.sh`), aktualna lista podprocesorów i DPA, skrzynka abuse@/rodo@ działa, rejestr czynności przetwarzania (art. 30), procedura naruszeń ≤72 h (sekcja w `INCIDENT_RESPONSE.md`).
- [ ] 7.11 **DNS:** obniż TTL rekordów paneli/API przed startem (rollback w minuty), plan rollbacku wg `LIVE_RELEASE_RUNBOOK.md`.
- [x] ~~7.5~~ → **Zrealizowane jako ETAP 8 (2026-06-09):** moduł VPN WireGuard — model `VpnPeer` + migracja, API `/admin/vpn/*` (generowanie kluczy X25519 w node:crypto, klucz prywatny zwracany jednorazowo, PSK szyfrowany KMS), strona panelu admina **/vpn** (generowanie/cofanie dostępów pracowników, pobieranie .conf), pull-sync na hoście (`vpn-sync-peers.sh` + timer, `wg syncconf` — rewokacja do ~1 min), `vpn-wireguard-setup.sh` (setup serwera), restrykcja Caddy `CADDY_INTERNAL_ALLOW_CIDR` (env-gated, fail-open do czasu weryfikacji). Procedura wdrożenia: `DEPLOY.md → VPN WireGuard`.
- [ ] 7.12 **Po deployu tego release:** `db:generate` → `typecheck/build/test` → `migrate deploy` → pełny `docs/SMOKE_E2E_PRZED_LIVE.md` (sekcje D-cap i G obowiązkowo) → krótki test obciążeniowy logowania/panelu, żeby potwierdzić że rate limiting nie tnie legalnego ruchu po 7.3.
