# Audyt mailingu Verris (Sprint 0 → Sprint 2)

> **Uwaga (2026-05-24):** sekcja „Co NIE działa” poniżej była **nieaktualna** — większość billing/subscription/legal/2FA/login-alert jest już w kodzie. Status bez węzła: [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md) → MAIL-TX.

> Sprint 0 sekcja 4d z `SPRINT_01_STABILIZACJA.md`. Dokument służy jako wejście dla Sprintu 2 (Maile transakcyjne, `SPRINT_03_MAILE.md`). Spina trzy rzeczy: **(1)** stan obecny mailingu w kodzie, **(2)** docelową listę template'ów z triggerami, **(3)** wybór i konfigurację dostawcy SMTP transakcyjnego.

## 1. Stan obecny

### Co działa już dzisiaj

- `MailerService` (`apps/api/src/mail/mailer.service.ts`) — fasada nad providerami. Wybiera providera na podstawie env (`buildMailerProvider`):
  - **`SmtpMailerProvider`** (`apps/api/src/mail/smtp-mailer.provider.ts`) — własny minimalny klient SMTP (nie `nodemailer`). Obsługuje trzy tryby `SMTP_SECURE`: `tls` (port 465, encrypted od początku), `starttls` (port 587, upgrade), `none` (plain — TYLKO localhost). AUTH LOGIN włączane warunkowo na podstawie `SMTP_USER`/`SMTP_PASS`. Auto-detect: gdy `SMTP_HOST` to `localhost`/`127.0.0.1` → defaultem `secure=none`, brak AUTH (panel-local Postfix relay).
  - **`LogMailerProvider`** — fallback gdy brak konfiguracji. Wpisuje treść do logów; nic nie wychodzi.
- `email-shell.ts` (`apps/api/src/mail/templates/_layouts/email-shell.ts`) — uniwersalny shell HTML+text z brandingiem Verris, compliance footer, opcjonalnym CTA, przygotowany pod `List-Unsubscribe`.
- Aktywne template'y branded (HTML+plaintext przez `email-shell`):
  - `ticket-notifications.ts` → `newTicketCreatedTemplate`, `ticketStatusChangedTemplate`,
  - `admin-credit-notification.ts` → `adminCreditNotificationTemplate`.
- Inline plaintext (bez brandingu) — ale realnie wysyłane:
  - powiadomienie staffa o nowym tickecie (`tickets.service.ts:86`),
  - powiadomienie staffa o nowej odpowiedzi klienta (`tickets.service.ts:213, 544`),
  - powiadomienie klienta o odpowiedzi staffa (`tickets.service.ts:365, 601`),
  - alert security do `SECURITY_ALERT_EMAIL` (`suspicious-activity.service.ts:168`).

### Maile, które aktualnie się WYSYŁAJĄ (status: prod-ready)

| # | Trigger | Adresat | Template |
| - | --- | --- | --- |
| 1 | Klient utworzył ticket | klient | `newTicketCreatedTemplate` (branded) |
| 2 | Klient utworzył ticket z assigneem | przypisany staff | inline plaintext |
| 3 | Klient odpowiedział w tickecie | przypisany staff | inline plaintext |
| 4 | Staff odpowiedział w tickecie | klient | inline plaintext |
| 5 | Zmiana statusu ticketu | klient | `ticketStatusChangedTemplate` (branded) |
| 6 | Admin ręcznie kredytuje portfel | klient | `adminCreditNotificationTemplate` (branded) |
| 7 | 5+ nieudanych logowań na email/IP | `SECURITY_ALERT_EMAIL` | inline plaintext |

> Obowiązuje warunek: `SMTP_HOST` + `SMTP_PORT` + `SMTP_FROM_ADDRESS` muszą być w env. Bez nich provider spada na `LogMailerProvider` (maile do logów, nic nie wychodzi).

### Co NIE działa (luki blokujące LIVE)

| Ścieżka biznesowa | Trigger w kodzie | Stan | LIVE blocker? |
| --- | --- | --- | --- |
| Welcome / weryfikacja konta | `auth.service.register` | brak maila | TAK |
| Password reset | brak endpointu nawet | brak | TAK |
| Email verification (klik w link) | brak endpointu | brak | TAK |
| Top-up portfela ✓ | `BillingService.handleCheckoutCompleted` | brak maila | TAK |
| Auto-topup wykonany | `BillingService.handlePaymentIntentSucceeded` | brak | TAK |
| Auto-topup nieudany | `BillingService.handlePaymentIntentFailed` | brak | TAK |
| Faktura wystawiona / opłacona | `BillingService.handleInvoicePaid` | brak | TAK |
| Płatność za fakturę nieudana | `BillingService.handleInvoicePaymentFailed` | brak | TAK |
| Subskrypcja zbliża się do końca okresu | `RenewalScheduler` (TBD trigger) | brak schedulera dla mail-only | TAK |
| Subskrypcja anulowana | `SubscriptionsService.cancelStripeSubscription` | brak | TAK |
| Subskrypcja zawieszona (suspend) | `SubscriptionsService.suspend` | brak maila do klienta | TAK |
| Subskrypcja przywrócona (unsuspend) | `SubscriptionsService.unsuspend` | brak | nice-to-have |
| Promocyjny kod uznany | `BillingService.redeemPromoCode` | brak | nice-to-have |
| Manualne uznanie portfela ✓ | `BillingService.adminCreditWallet` | **DZIAŁA** | — |
| Re-consent po publikacji nowej wersji legal docs | `LegalDocument` publish (Sprint 1) | brak schemy | TAK (Sprint 1 dorobi) |
| Marketing newsletter | brak endpointu | brak | nie (po opt-in w Sprincie 2) |
| Powiadomienie o nowym subprocessorze | brak | brak | nice-to-have (DPA wymaga 30 dni notice) |
| Zaplanowane prace konserwacyjne | brak | brak | nie (operacyjnie ręcznie) |
| 2FA włączony / wyłączony | `auth.service.enable2FA` (TBD) | brak | TAK (security best practice) |
| Nowe logowanie z nieznanego IP | `auth.service.login` | brak | nice-to-have |

## 2. Docelowa lista template'ów (M-04..M-08 z `SPRINT_03_MAILE.md`)

Wszystkie template'y używają `renderEmailShell(...)` z `email-shell.ts`. Każdy template eksportuje funkcję zwracającą `MailMessage` (do, temat, html, text, kategoria).

### 2.1 Onboarding i auth (kategoria: `TRANSACTIONAL` / `SECURITY`)

| Kind | Trigger | Treść (skrót) |
| --- | --- | --- |
| `WELCOME` | `auth.service.register` (po stworzeniu User'a, przed wymuszeniem weryfikacji) | Powitanie, link do panelu, lista co można zrobić jako pierwsze (zakup planu / top-up portfela / zaproś dewelopera). |
| `EMAIL_VERIFY` | `auth.service.register` + `auth.service.requestEmailVerification` | Link z tokenem (1h life) potwierdzający e-mail. Po klik: konto aktywne. |
| `EMAIL_VERIFIED_OK` | `auth.service.verifyEmail` (po pomyślnej weryfikacji) | „E-mail potwierdzony, witaj w Verris." Tylko transakcyjne. |
| `PASSWORD_RESET_REQUEST` | `auth.service.requestPasswordReset` | Link z tokenem (15 min life). Plus disclaimer „jeśli to nie ty, zignoruj". |
| `PASSWORD_RESET_DONE` | `auth.service.resetPassword` (po zmianie hasła) | Powiadomienie security: hasło zmienione w `<data>` z `<IP>`, jeśli to nie ty, kliknij `<link unblock>`. |
| `PASSWORD_CHANGED` | `auth.service.changePassword` (świadoma zmiana w panelu) | Jak `PASSWORD_RESET_DONE` ale z innym tonem. |
| `LOGIN_FROM_NEW_IP` | `auth.service.login` (nowe IP/User-Agent) | Tylko gdy włączone w preferencjach. |
| `2FA_ENABLED` / `2FA_DISABLED` | `auth.service.enable2FA` / `disable2FA` | Security mail. |

### 2.2 Billing (kategoria: `TRANSACTIONAL`)

| Kind | Trigger | Treść |
| --- | --- | --- |
| `WALLET_TOPUP_OK` | `BillingService.handleCheckoutCompleted` (Stripe sukces) | Doładowano `X K`, nowy saldo `Y K`, link do faktury. |
| `WALLET_TOPUP_FAILED` | `BillingService.handlePaymentIntentFailed` przy `verris_kind=wallet_auto_topup` | Auto-doładowanie nie powiodło się: `<reason>`, sugerujemy zaktualizować kartę albo zasilić ręcznie. |
| `WALLET_AUTOTOPUP_OK` | `BillingService.handlePaymentIntentSucceeded` przy `verris_kind=wallet_auto_topup` | Cicha potwierdzenie sukcesu (krótki mail). |
| `WALLET_LOW_BALANCE` | scheduler co 24h gdy saldo < 7-dniowe zużycie | Ostrzeżenie zanim subskrypcja wygaśnie. |
| `WALLET_ADMIN_CREDIT` ✓ | `BillingService.adminCreditWallet` | **DZIAŁA** — refactor po wprowadzeniu `EmailTemplate` schemy (Sprint 2). |
| `INVOICE_ISSUED` | `BillingService.handleInvoicePaid` (created=true) | Nowa faktura wystawiona, link do hosted invoice + PDF. |
| `INVOICE_PAID` | `BillingService.handleInvoicePaid` (paid=true) | Potwierdzenie opłaty + link do faktury. |
| `INVOICE_PAYMENT_FAILED` | `BillingService.handleInvoicePaymentFailed` | „Nie udało się pobrać kolejnej raty subskrypcji `<plan>`. Subskrypcja jest aktywna jeszcze 7 dni — zasil portfel albo zaktualizuj kartę." |
| `BILLING_PERIOD_ENDING_7D` | `RenewalScheduler` daily cron (7 dni przed `currentPeriodEnd`) | Subskrypcja `<plan>` odnowi się `<data>` na `<okres>`, koszt `<X K>` zostanie pobrany z portfela / karty. |
| `BILLING_PERIOD_ENDING_3D` | jak wyżej, 3 dni | Druga przypominajka, mocniejsza CTA gdyby brakowało środków. |
| `SUBSCRIPTION_RENEWED` | `BillingService.handleInvoicePaid` (renewal) | Subskrypcja odnowiona na kolejny okres, link do faktury. |
| `SUBSCRIPTION_CANCEL_REQUESTED` | `SubscriptionsService.cancelStripeSubscription({ atPeriodEnd: true })` | Anulacja zaplanowana, usługa działa do `<data>`, link „cofnij anulację". |
| `SUBSCRIPTION_CANCELED` | `SubscriptionsService.markCanceledFromStripe` | Usługa wygasła, dane będą przechowane przez 14 dni. |
| `SUBSCRIPTION_SUSPENDED` | `SubscriptionsService.suspend` (PAYMENT_FAILED, GRACE_EXPIRED) | Konto zawieszone z powodu `<reason>`, link „przywróć". |
| `SUBSCRIPTION_UNSUSPENDED` | `SubscriptionsService.unsuspend` | Usługa działa znowu. |
| `PROMO_REDEEMED` | `BillingService.redeemPromoCode` (`PromoKind=FIXED_CREDIT`) | „Dodaliśmy `<X K>` do Twojego portfela — kod `<CODE>`." |

### 2.3 Provisioning / Hosting (kategoria: `TRANSACTIONAL`)

| Kind | Trigger | Treść |
| --- | --- | --- |
| `SERVICE_PROVISIONED` | `ProvisioningService.complete` (DA account created) | Usługa gotowa, dane logowania DA, link do panelu. |
| `SERVICE_PROVISIONING_FAILED` | `ProvisioningService.fail` | Niepowodzenie z czytelnym error message + CTA „skontaktuj się z support". |
| `SERVICE_DOMAIN_ADDED` | `DirectAdminService.addDomain` (Sprint 4+) | nice-to-have. |

### 2.4 Tickety (kategoria: `TRANSACTIONAL`)

| Kind | Trigger | Treść | Stan |
| --- | --- | --- | --- |
| `TICKET_NEW` ✓ | `TicketsService.create` | DZIAŁA, refactor pod `EmailTemplate` (Sprint 2) | done |
| `TICKET_STATUS_CHANGED` ✓ | `TicketsService.changeStatus` | DZIAŁA | done |
| `TICKET_REPLY_FROM_STAFF` | `TicketsService.replyAsStaff` (TBD) | brak | nice-to-have |
| `TICKET_ASSIGNED` | `TicketsService.assign` | brak | wewnętrzne, do staff inbox |

### 2.5 Compliance / Legal (kategoria: `TRANSACTIONAL`)

| Kind | Trigger | Treść |
| --- | --- | --- |
| `LEGAL_DOC_UPDATED` | `LegalService.publish` (Sprint 1) | „Zaktualizowaliśmy `<Regulamin/Polityka prywatności>`. Wymagamy ponownej akceptacji przy najbliższym logowaniu." |
| `DATA_EXPORT_READY` | `RodoService.completeExport` (Sprint 1) | Link do paczki ZIP, ważny 7 dni. |
| `ACCOUNT_DELETION_REQUESTED` | `RodoService.requestDeletion` (Sprint 1) | Confirmacja, że konto zostanie usunięte za 14 dni, link „anuluj usunięcie". |
| `ACCOUNT_DELETED` | `RodoService.completeDeletion` (Sprint 1) | Pożegnanie, info że dane zostały zanonimizowane. |
| `SUBPROCESSOR_ADDED` | manual przez admin (Sprint 1+) | „Dodaliśmy `<dostawcę>` jako subprocessora od `<data>`. Możesz zgłosić sprzeciw przez 30 dni." |

### 2.6 Marketing (kategoria: `MARKETING`, opt-in only)

| Kind | Trigger | Treść |
| --- | --- | --- |
| `NEWSLETTER_MONTHLY` | `MarketingScheduler` (Sprint 2+) | Miesięczna recenzja, oferty. Tylko po opt-in. List-Unsubscribe header. |
| `PRODUCT_UPDATE` | manual przez admin | Nowa funkcjonalność, changelog. Wymaga osobnego opt-in. |
| `PROMO_CAMPAIGN` | `MarketingService.broadcast` | Tylko po opt-in. List-Unsubscribe header obowiązkowy. |

### 2.7 Operacyjne / wewnętrzne (kategoria: `SECURITY`, do `SECURITY_ALERT_EMAIL`)

| Kind | Trigger | Treść | Stan |
| --- | --- | --- | --- |
| `SECURITY_ALERT_*` | `SuspiciousActivityService` | Już DZIAŁA. | done |
| `OPS_PROVISIONING_TIMEOUT` | `ProvisioningService.fail` (timeout >5min) | Alert do staff inbox. | brak |
| `OPS_BACKUP_FAILED` | scheduler | brak | brak (Sprint 0+) |
| `OPS_NODE_HEARTBEAT_LOST` | `MetricsService.markStale` | Alert do staff inbox. | brak |

## 3. Statystyki

- **Maile do wdrożenia w Sprincie 2 (LIVE blocker):** 11 (wszystkie z 2.1 Welcome+verify+password reset, plus 5 najważniejszych billing).
- **Maile do wdrożenia w Sprincie 2 (zalecane):** dodatkowo 8 (rest billing, subscription state changes, provisioning).
- **Maile do Sprintu 1 (Legal):** 4 (`LEGAL_DOC_UPDATED`, `DATA_EXPORT_READY`, `ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_DELETED`).
- **Razem M-04..M-08 zakres:** ~23 template'y.

## 4. Strategia outbound — panel-local Postfix

Decyzja produktowa (maj 2026): Verris **nie** korzysta z zewnętrznych providerów (Resend, Postmark, SendGrid, SES). Wszystkie maile transakcyjne wychodzą przez **Postfix uruchomiony lokalnie na serwerze control-plane**, podpisane DKIM przez `opendkim`. API gada z Postfixem przez `localhost:25` (bez auth, plain TCP).

### 4.1 Powody

1. **Brak zewnętrznych zależności** — żadnego SaaS w łańcuchu, żadnego abonamentu, żadnego SLA poza naszym.
2. **RODO** — dane (treść maili, adresy klientów) nigdy nie opuszczają naszego serwera. Brak DPA z dostawcą poczty.
3. **Pełna kontrola kolejki** — `mailq`, `postqueue -p`, lokalne logi (`/var/log/mail.log`).
4. **Koszty** — 0 zł / mies. za sam outbound; jedyny koszt to zasoby serwera (znikome dla naszego wolumenu).
5. **Architektura już to wspiera** — `SmtpMailerProvider` działa zarówno z localhost (no-auth, plain) jak i ze zdalnym relayem (TLS + AUTH LOGIN). Zmiana providera = 4 linijki w `.env`.

### 4.2 Architektura

```
┌──────────────────────────────────────────────────────────────────┐
│  control-plane.verris.pl (4 vCPU / 8 GB RAM / Ubuntu 24.04)      │
│                                                                  │
│  ┌──────────────┐   localhost:25     ┌──────────────────────┐   │
│  │  api (Nest)  │ ────────────────▶  │  Postfix (outgoing)  │   │
│  │              │   plain, no AUTH   │  + opendkim milter   │   │
│  └──────────────┘                    └──────────┬───────────┘   │
│                                                 │               │
│                                                 │  port 25/tcp   │
└─────────────────────────────────────────────────┼──────────────┘
                                                  ▼
                                      ┌──────────────────────┐
                                      │  Internet (MX targets)│
                                      │  Gmail, Onet, WP, …   │
                                      └──────────────────────┘
```

- **Inbound** poczty Verris **nie obsługujemy w panelu**. Skrzynki firmowe (`support@`, `hello@`, `security@`) leżą na osobnym serwerze pocztowym (DA na node hostingowym albo zewnętrzny imap). Z panelu tylko wychodzimy.
- **Replies do ticketów** przychodzą do `support@verris.pl` i są pobierane przez osobny worker (poza zakresem tego dokumentu — Sprint 2+).

### 4.3 Wymagania operacyjne

- **Otwarty port 25 wyjściowy** u dostawcy serwera. Hetzner i OVH domyślnie blokują — odblokuj ticketem przed deploymentem (Hetzner ~kilka godzin, OVH ~72h).
- **rDNS (PTR)** dla publicznego IP serwera musi rozwijać się do `panel.verris.pl`. To krytyczne dla deliverability — bez PTR Gmail i Onet odrzucają.
- **DNS**: SPF, DKIM, DMARC (patrz sekcja 5).
- **Monitoring**: probe `SMTP localhost:25` w status-page (severity MINOR, internal-only).

### 4.4 Plan onboardingu (jednorazowo, bez Sprintu)

1. ✅ Otworzyć ticket u dostawcy serwera o odblokowanie wyjściowego portu 25.
2. ✅ Ustawić rDNS dla publicznego IP → `panel.verris.pl` (panel hostingowy).
3. ✅ Zainstalować Postfix + opendkim wg runbooka w `DEPLOY.md` (sekcja "Mailing (SMTP) — Postfix na serwerze panelu").
4. ✅ Wygenerować klucz DKIM (`opendkim-genkey -s panel -d verris.pl`).
5. ✅ Wstawić rekordy DNS: A, SPF, DKIM, DMARC (sekcja 5 niżej).
6. ✅ Wpisać minimum w `.env.prod`:
   ```
   SMTP_HOST=localhost
   SMTP_PORT=25
   SMTP_FROM_ADDRESS=noreply@verris.pl
   SMTP_FROM_NAME=Verris
   SECURITY_ALERT_EMAIL=security@verris.pl
   ```
7. ✅ Restart API (`docker compose restart api`).
8. ✅ Smoke: w admin panelu kliknąć „Kredytuj +1 K" dla testowego konta — klient powinien dostać branded mail.
9. ✅ Test deliverability: `mail-tester.com` cel ≥ 8/10 (DKIM pass, SPF pass, DMARC align).
10. ✅ Powtórzyć dla Gmail PL i Onet (najczęstsze polskie inbox-y).

### 4.5 Alternatywy (gdyby Postfix lokalnie się nie sprawdził)

W razie pat-sytuacji (port 25 zablokowany, IP w blacklistach, deliverability poniżej akceptowalnego progu) — `MailerService` jest abstrakcją, więc switch na zewnętrzny relay to zmiana env:

| Dostawca | Region EU | Cena (10k maili) | Plan-B trigger |
| --- | --- | --- | --- |
| Postmark EU | Tak | ~$15 / mies. | Gdy spam-rate Onet/WP > 5% |
| Resend EU | Frankfurt | ~$20 / mies. (50k) | Gdy potrzebujemy webhooków + analytics |
| Amazon SES EU | Tak | ~$1 / 10k | Gdy wolumen > 50k/mies. |

W tym wypadku `.env`:

```
SMTP_HOST=smtp.eu.example.com
SMTP_PORT=587
SMTP_USER=…
SMTP_PASS=…
SMTP_SECURE=starttls
SMTP_FROM_ADDRESS=noreply@verris.pl
```

Provider auto-przełączy się w tryb authenticated TLS — bez zmian kodu.

### 4.5 Adresy nadawcze

| Adres | Cel | Reply-to |
| --- | --- | --- |
| `hello@verris.pl` | Welcome, marketing | `support@verris.pl` |
| `noreply@verris.pl` | Auto-generowane (faktury, alerty) | `support@verris.pl` (gdyby user mimo wszystko odpowiedział) |
| `support@verris.pl` | Tickety, replies | sam siebie (inbound parse) |
| `security@verris.pl` | Security alerts, suspicious login | `security@verris.pl` |
| `rodo@verris.pl` | RODO requests, lawyer review | `rodo@verris.pl` |

## 5. Konfiguracja SPF / DKIM / DMARC (Postfix lokalnie)

### 5.1 SPF — dopuszczamy nasz publiczny IP

```
verris.pl. IN TXT "v=spf1 ip4:<publiczne IP control-plane> -all"
```

`-all` — hard fail dla wszystkich innych źródeł. Jeśli planujesz fallback przez zewnętrzny relay (sekcja 4.5), na czas migracji ustaw na `~all` (soft fail).

### 5.2 DKIM — selector `panel`

`opendkim-genkey -b 2048 -s panel -d verris.pl` wygenerował `panel.txt`. Wstaw wartość:

```
panel._domainkey.verris.pl. IN TXT "v=DKIM1; k=rsa; p=<długi klucz publiczny>"
```

> Weryfikacja: `dig +short TXT panel._domainkey.verris.pl` musi zwrócić identyczny rekord.

### 5.3 DMARC

Start: `p=quarantine` z reportem na adres techniczny:

```
_dmarc.verris.pl. IN TXT "v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@verris.pl; ruf=mailto:dmarc@verris.pl; aspf=s; adkim=s; sp=quarantine"
```

Po 30 dniach (gdy raporty `rua` pokazują 0 spoofingu) → `p=reject`.

### 5.4 PTR (rDNS) — krytyczne

```
<publiczne IP control-plane> → panel.verris.pl
```

Ustaw w panelu hostingowym dostawcy (Hetzner: Networking → Reverse DNS; OVH: IP → Modyfikuj rDNS). Bez PTR-a Gmail i Onet odrzucają poprawnie podpisane DKIM-em maile jako "unauthenticated".

### 5.5 Test

- https://mail-tester.com — cel ≥ 8/10 (przy tylko-SPF/DKIM/DMARC, bez track-domain bonus to realistyczny target).
- https://dmarcian.com/dmarc-inspector — sprawdź czy DMARC parsuje się poprawnie.
- Gmail → Pokaż oryginał → SPF=PASS, DKIM=PASS, DMARC=PASS.
- Onet, WP — wyślij testowy mail, sprawdź czy nie ląduje w spamie.

## 6. Schema bazy do Sprintu 2 (M-01)

```prisma
enum EmailKind {
  WELCOME
  EMAIL_VERIFY
  EMAIL_VERIFIED_OK
  PASSWORD_RESET_REQUEST
  PASSWORD_RESET_DONE
  PASSWORD_CHANGED
  LOGIN_FROM_NEW_IP
  TWOFA_ENABLED
  TWOFA_DISABLED

  WALLET_TOPUP_OK
  WALLET_TOPUP_FAILED
  WALLET_AUTOTOPUP_OK
  WALLET_LOW_BALANCE
  WALLET_ADMIN_CREDIT

  INVOICE_ISSUED
  INVOICE_PAID
  INVOICE_PAYMENT_FAILED

  BILLING_PERIOD_ENDING_7D
  BILLING_PERIOD_ENDING_3D
  SUBSCRIPTION_RENEWED
  SUBSCRIPTION_CANCEL_REQUESTED
  SUBSCRIPTION_CANCELED
  SUBSCRIPTION_SUSPENDED
  SUBSCRIPTION_UNSUSPENDED
  PROMO_REDEEMED

  SERVICE_PROVISIONED
  SERVICE_PROVISIONING_FAILED

  TICKET_NEW
  TICKET_STATUS_CHANGED
  TICKET_REPLY_FROM_STAFF

  LEGAL_DOC_UPDATED
  DATA_EXPORT_READY
  ACCOUNT_DELETION_REQUESTED
  ACCOUNT_DELETED
  SUBPROCESSOR_ADDED

  NEWSLETTER_MONTHLY
  PRODUCT_UPDATE
  PROMO_CAMPAIGN

  SECURITY_ALERT
  OPS_PROVISIONING_TIMEOUT
  OPS_BACKUP_FAILED
  OPS_NODE_HEARTBEAT_LOST
}

enum EmailCategory {
  TRANSACTIONAL
  SECURITY
  MARKETING
  PRODUCT_UPDATE
  OPERATIONAL
}

enum EmailStatus {
  QUEUED
  SENT
  DELIVERED
  OPENED
  CLICKED
  BOUNCED
  COMPLAINED
  FAILED
}

model EmailTemplate {
  id           String   @id @default(cuid())
  kind         EmailKind
  locale       String   // pl, en
  subject      String
  bodyMarkdown String   @db.Text
  ctaLabel     String?
  ctaUrlVar    String?  // np. {{panelUrl}}/billing
  isCurrent    Boolean  @default(true)
  version      String   // semver, np. "1.0.0"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([kind, locale, version])
  @@index([kind, locale, isCurrent])
}

model EmailLog {
  id              String       @id @default(cuid())
  userId          String?
  toAddress       String
  kind            EmailKind
  category        EmailCategory
  status          EmailStatus  @default(QUEUED)
  providerMsgId   String?
  templateVersion String?
  subject         String
  errorMessage    String?
  openedAt        DateTime?
  clickedAt       DateTime?
  bouncedAt       DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([kind, status])
  @@index([providerMsgId])
}

model UserEmailPreferences {
  userId             String   @id
  marketingOptIn     Boolean  @default(false)
  productUpdates     Boolean  @default(false)
  promoCampaigns     Boolean  @default(false)
  loginAlerts        Boolean  @default(true)
  billingReminders   Boolean  @default(true) // user nie może wyłączyć transakcyjnych
  unsubscribeToken   String   @unique
  updatedAt          DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## 7. Status Sprintu 0 dla mailingu

- [x] Audyt — pełna lista template'ów z triggerami.
- [x] Wybór strategii outbound — **panel-local Postfix + opendkim** (decyzja: brak zewnętrznego dostawcy).
- [x] Plan rekordów DNS (SPF, DKIM `panel`, DMARC, PTR).
- [x] Schema bazy do Sprintu 2 (`EmailTemplate`, `EmailLog`, `UserEmailPreferences`).
- [x] `SmtpMailerProvider` wspiera tryb plain + no-AUTH (panel-local relay).
- [x] `buildMailerProvider` auto-detekt localhost.
- [x] Runbook deploymentu Postfix → `DEPLOY.md` sekcja "Mailing (SMTP) — Postfix na serwerze panelu".
- [ ] Otwarcie wyjściowego portu 25 u dostawcy serwera (operacyjne, ticket).
- [ ] Ustawienie rDNS dla publicznego IP (operacyjne, panel hostingowy).
- [ ] Instalacja Postfix + opendkim wg runbooka (operacyjne).
- [ ] Wpisanie rekordów DNS (operacyjne).
- [ ] Test deliverability (mail-tester.com ≥ 8/10, Gmail/Onet smoke) — operacyjne, po setupie.

Last updated: Sprint 0, May 2026 (rev. — switched outbound from Resend to panel-local Postfix).
