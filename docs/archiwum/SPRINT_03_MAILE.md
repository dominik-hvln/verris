> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** plan 19 sprintów w `plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md` wraz z backlogiem XLSX oraz dokumentacja poczty w `docs/ops/`
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Sprint 03 — Maile transakcyjne i powiadomienia (LIVE blocker)

> Ten sprint odpowiada Sprintowi 2 z `SPRINT_PLAN.md`. Wymaga ukończonego Sprintu 2 (Legal/RODO) — `MarketingPreferences` i stopka maili z linkiem do polityki prywatności są częścią compliance. Kluczowe przygotowanie (wybór dostawcy SMTP, SPF/DKIM/DMARC, copy templates) zostało wykonane w Sprincie 0 (sekcja `4d. Audyt mailingu` w `SPRINT_01_STABILIZACJA.md`).

## Cel sprintu

Klient po każdym ważnym zdarzeniu w panelu dostaje e-mail. Operatorzy mają audytowalną historię wysyłek z możliwością retry. Klient może zarządzać preferencjami marketingowymi/produktowymi, a transakcyjne i security alerty są zawsze wysyłane. Mail nie ląduje w spamie u głównych dostawców (Gmail, Outlook, WP, Onet, Interia, Gazeta, O2, ProtonMail).

**Twardy LIVE blocker:** bez maili klient nie wie, że subskrypcja została utworzona, że płatność padła, że okres rozliczeniowy się kończy ani że jego usługa została zawieszona. To podstawa zaufania do hosting providera.

## Zakres

- Schema mailingowa (`EmailTemplate`, `EmailLog`, `UserEmailPreferences`).
- Fasada `TransactionalMailerService` na `MailerService` (E-3) z renderem template, walidacją preferences, retry, dead-letter, automatycznym `EmailLog`.
- Renderer template z Markdown + zmiennymi (`{{firstName}}`, `{{amount}}`, `{{url}}`), HTML + plaintext, locale `pl`/`en` (PL produkcyjne, EN fallback).
- Templates dla 4 obszarów: Auth, Subscription/Hosting, Billing, Operational.
- Scheduler okresowych powiadomień (period ending, monthly autoscaling summary).
- Settings → „Powiadomienia" w panelu klienta.
- Admin → „Maile" do podglądu i retry wysyłek.
- SPF/DKIM/DMARC + warm-up domeny nadawczej.
- Stopka maili z linkiem do polityki prywatności i unsubscribe (gdzie wymagane).

## Poza zakresem

- AI generowanie copy maili — używamy ręcznie napisanych templates w PL.
- A/B testing subject lines — może być w roadmapie po skali (~1000 klientów).
- Push notifications / SMS — później.
- In-app notification center — częściowo zachodzi z `IncidentBanner`, ale pełny notification feed to osobny task na Sprint 8.
- Newsletter marketingowy — Sprint dotyczy WYŁĄCZNIE transakcyjnych. Kampanie marketingowe (jeśli planujemy) wymagają osobnego narzędzia (Mailchimp/Brevo) z double opt-in.

## Stan obecny (audyt z chwili rozpoczęcia)

- `MailerService` (E-3, DONE) ma SMTP provider (`SmtpMailerProvider`) i log provider (`LogMailerProvider`) z auto-fallback.
- Templates istnieją w `apps/api/src/mail/templates/ticket-notifications.ts` oraz `apps/api/src/mail/templates/admin-credit-notification.ts`. **Wszystkie korzystają z `renderEmailShell`** (W-04 z `SPRINT_PLAN.md`).
- **Mail shell (W-04, DONE):** `apps/api/src/mail/templates/_layouts/email-shell.ts` — funkcja `renderEmailShell({ title, preheader, bodyMarkdown, cta?, footnote?, recipientEmail, panelUrl, category })` zwracająca `{ html, text }`. Layout table-based (Outlook compat), inline CSS, jasny background, sky-600 accent, brand header („Verris — Hosting nowej generacji"), minimalistyczny Markdown parser (paragrafy, H2/H3, **bold**, *italic*, `code`, listy `- item`, linki z whitelist'ą `https:`/`mailto:`), opcjonalny CTA button, footnote, stopka compliance (kontakt, RODO, polityka prywatności, regulamin, preferencje powiadomień), unsubscribe block dla `MARKETING`/`PRODUCT_UPDATE`, preheader trick (Gmail preview), dark-mode hint `meta color-scheme=light only` żeby nie psuło się w klientach z auto-invertem. **Wszystkie nowe template'y w tym sprincie MUSZĄ korzystać z tej fasady — to fundament spójności.**
- Mailer używany w 3 miejscach: `apps/api/src/tickets/tickets.service.ts`, `apps/api/src/security/suspicious-activity.service.ts`, `apps/api/src/billing/billing.service.ts` (admin manual credit).
- Schema nie ma tabel `EmailTemplate`, `EmailLog`, `UserEmailPreferences`.
- Klient nie ma żadnego ustawienia powiadomień e-mail w settings.
- Brak mechanizmu retry, brak dead-letter, brak SPF/DKIM/DMARC dla domeny `verris.pl` (lub odpowiedniej).

## Taski sprintu

### 1. Schema i migracje (M-01)

- Dodać do `libs/database/prisma/schema.prisma`:
  - `enum EmailKind` z pełną listą template'ów (lista w sekcji 4-7 poniżej): `WELCOME`, `EMAIL_VERIFY`, `PASSWORD_RESET`, `PASSWORD_CHANGED`, `TWO_FA_ENABLED`, `TWO_FA_DISABLED`, `ACCOUNT_LOCKED`, `SUSPICIOUS_LOGIN_USER`, `ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_DELETION_CANCELLED`, `DATA_EXPORT_READY`, `DPA_ACCEPTED`, `SUBSCRIPTION_CREATED`, `PROVISIONING_READY`, `PERIOD_ENDING_3D`, `PERIOD_ENDING_7D`, `PERIOD_ENDED_RENEWAL_FAILED`, `SUBSCRIPTION_SUSPENDED`, `SUBSCRIPTION_UNSUSPENDED`, `SUBSCRIPTION_CANCELLED`, `MIGRATION_COMPLETED`, `MIGRATION_FAILED`, `BACKUP_READY`, `BACKUP_FAILED`, `INVOICE_ISSUED`, `INVOICE_PAID`, `PAYMENT_FAILED`, `WALLET_TOPPED_UP`, `WALLET_ADMIN_CREDIT`, `AUTO_TOPUP_CHARGED`, `AUTO_TOPUP_FAILED`, `PROMO_REDEEMED`, `AUTOSCALER_DISABLED`, `MONTHLY_AUTOSCALING_SUMMARY`, `INCIDENT_IMPACTING_SERVICE`, `PLANNED_MAINTENANCE`.
  - `enum EmailCategory { TRANSACTIONAL SECURITY MARKETING PRODUCT_UPDATE }` (mapuje na preferences).
  - `model EmailTemplate { id, kind (unique with locale, version), locale, version, subject, bodyMarkdown, isCurrent, createdAt, createdById }`.
  - `model EmailLog { id, kind, userId?, recipientEmail, subject, templateVersion, status (QUEUED|SENT|FAILED|BOUNCED|DEAD_LETTER), providerId, providerMessageId?, errorMessage?, retryCount, sentAt?, createdAt }` — index na `(userId, createdAt desc)` i `(status, createdAt)` dla retry'u.
  - `model UserEmailPreferences { userId @unique, marketingEmail Boolean @default(false), productUpdatesEmail Boolean @default(true), partnerOffersEmail Boolean @default(false), updatedAt }`. Security i transactional są zawsze on (nie ma toggle'a).
- Migracja Prisma + seed wszystkich template'ów PL `v1.0.0` (copy z Sprintu 0).

### 2. Fasada `TransactionalMailerService` (M-02)

- `apps/api/src/mail/transactional-mailer.service.ts`:
  - `send(args: { kind: EmailKind; userId?: string; to: string; data: Record<string, unknown> })`.
  - Pobiera `EmailTemplate` z `kind, locale, isCurrent=true` (locale z User.locale lub fallback `pl`).
  - Pobiera `UserEmailPreferences` jeśli `userId`, sprawdza czy kategoria jest dozwolona. Jeśli nie — zapisuje `EmailLog.status = 'SKIPPED_PREFERENCES'` i zwraca bez wysyłki.
  - Render: **interpolacja `{{var}}` w `subject` i `bodyMarkdown` (z escape) → przekazanie wyniku do `renderEmailShell` z W-04**. Nie piszemy własnego HTML wrappera — shell już go ma. Dane użytkownika muszą być zescape'owane przed interpolacją (`escapeHtml` z shell'a) bo trafiają do HTML, nie tylko Markdown.
  - Wysyłka przez `MailerService.send`.
  - Idempotencja: opcjonalny `idempotencyKey` w args, sprawdza `EmailLog.kind + idempotencyKey` w ostatnich 24h. Jeśli wysłany — skip + log `SKIPPED_DUPLICATE`.
- Retry: BullMQ kolejka `email-send` z exponential backoff (1min, 5min, 15min, 1h). Po 4 nieudanych próbach → `DEAD_LETTER` + alert do operatora (Slack/Sentry).
- Dead-letter retry endpoint: `POST /admin/email-log/:id/retry` (sekcja 11).

### 3. Renderer template (M-03)

- `apps/api/src/mail/template-renderer.ts`:
  - Input: `{ subject, bodyMarkdown }` + `data: Record<string, unknown>` + `cta?: { label, url }` (opcjonalnie wynegocjowane z templatu).
  - Step 1: Mustache-style placeholder substitution (`{{firstName}}` → `escapeHtml(data.firstName)`). Brakujące zmienne → throw, żeby nie wysyłać `Hello {{firstName}}`. Escape obowiązkowy nawet w Markdown body (zmienna może zawierać HTML reserved chars).
  - Step 2: Wynik podajemy do `renderEmailShell({ title: subject, bodyMarkdown: rendered, cta, recipientEmail, panelUrl, category })`. Shell sam zajmie się HTML i plaintext oraz stopką compliance.
  - Step 3: Z `EmailShellOutput` bierzemy `html` i `text` i wsadzamy w `MailMessage` razem z `subject` (bez interpolacji w runtime — już zinterpolowany).
- Footer compliance (RODO/ePrivacy) jest w `email-shell.ts` — nie dublujemy:
  - Dane administratora (nazwa firmy, NIP, adres, e-mail kontaktu RODO) — uzupełnić w `email-shell.ts` po Sprincie 2 (gdy mamy oficjalne dane firmy w `LegalDocument`).
  - Link do polityki prywatności i regulaminu.
  - Dla maili kategorii `MARKETING/PRODUCT_UPDATE`: link „Wypisz się" prowadzący do `/dashboard/settings#powiadomienia` (już renderuje się warunkowo w shellu).
- Plaintext fallback obowiązkowy — wysyłamy `multipart/alternative` z text + HTML (shell zwraca oba, mailer ustawia odpowiednie nagłówki MIME).

### 4. Auth e-mails (M-04)

Templates do napisania (subject + bodyMarkdown PL):

- **WELCOME** (po rejestracji): „Witamy w Verris! Twoje konto zostało utworzone." + krótki przewodnik.
- **EMAIL_VERIFY** (jeśli włączymy verify): link `verify` z 24h tokenem. Decyzja: jeśli `REGISTRATION_REQUIRES_EMAIL_VERIFY=true` w env, blokujemy logowanie do verify. Default `false` na pierwszą betę, można włączyć później.
- **PASSWORD_RESET**: link reset (token 30 min). Wysyłany przez `POST /auth/password-reset/request`.
- **PASSWORD_CHANGED**: alert „Twoje hasło zostało zmienione DD.MM HH:MM. Jeśli to nie Ty — natychmiast zresetuj hasło i skontaktuj się z supportem."
- **TWO_FA_ENABLED** / **TWO_FA_DISABLED**: alert „Aktywowałeś/dezaktywowałeś 2FA DD.MM HH:MM."
- **ACCOUNT_LOCKED**: po przekroczeniu liczby fail logins (już istnieje suspicious activity tracking, M-04 dodaje notyfikację do klienta, nie tylko operatora). Zawiera reset link.
- **SUSPICIOUS_LOGIN_USER**: alert „Wykryliśmy logowanie z nowego urządzenia / kraju" (template osobny od operatorskiego, język bardziej przystępny).
- **ACCOUNT_DELETION_REQUESTED** (z L-07): „Otrzymaliśmy Twój wniosek o usunięcie konta. Konto zostanie zanonimizowane DD.MM. Możesz cofnąć decyzję w panelu do tego dnia."
- **ACCOUNT_DELETION_CANCELLED**: „Cofnąłeś wniosek o usunięcie konta. Wszystko działa normalnie."
- **DATA_EXPORT_READY** (z L-06): link pobrania ZIP, ważny 7 dni, jednorazowy.
- **DPA_ACCEPTED** (z L-11): potwierdzenie + załącznik PDF.

Implementacja wywołań:

- `apps/api/src/auth/auth.service.ts` → `register` po stworzeniu User'a wywołuje `WELCOME` + (warunkowo) `EMAIL_VERIFY`.
- `apps/api/src/auth/auth.service.ts` → `requestPasswordReset` → `PASSWORD_RESET`.
- `apps/api/src/auth/auth.service.ts` → `changePassword` → `PASSWORD_CHANGED`.
- `apps/api/src/auth/two-factor.service.ts` → `enable/disable` → `TWO_FA_*`.
- `apps/api/src/security/suspicious-activity.service.ts` → przy `SUSPICIOUS_LOGIN_BURST_BY_IP` dla user'a → wysłać też `SUSPICIOUS_LOGIN_USER` do klienta.
- `apps/api/src/compliance/account-deletion.service.ts` (z Sprintu 2) → `ACCOUNT_DELETION_REQUESTED/CANCELLED`.
- `apps/api/src/compliance/data-export.service.ts` (z Sprintu 2) → `DATA_EXPORT_READY` po zakończeniu jobu.

### 5. Subscription / hosting e-mails (M-05)

Templates:

- **SUBSCRIPTION_CREATED**: „Twoja subskrypcja Plan X została utworzona. Provisioning w toku."
- **PROVISIONING_READY**: „Konto hostingowe gotowe! Login do DirectAdmin: `username/password`. UWAGA: hasło jest pokazywane tylko teraz, zmień je przy pierwszym logowaniu."
- **PERIOD_ENDING_7D** i **PERIOD_ENDING_3D**: przypomnienie o końcu okresu, link do `/dashboard/billing` żeby doładować portfel/zmienić kartę.
- **PERIOD_ENDED_RENEWAL_FAILED**: „Nie udało się odnowić Twojej subskrypcji. Konto zostanie zawieszone DD.MM jeśli nie doładujesz portfela / nie zmienisz karty."
- **SUBSCRIPTION_SUSPENDED**: „Twoja usługa została zawieszona z powodu braku środków. Doładuj portfel, żeby ją wznowić."
- **SUBSCRIPTION_UNSUSPENDED**: „Twoja usługa została wznowiona. Wszystko działa normalnie."
- **SUBSCRIPTION_CANCELLED**: „Subskrypcja została anulowana. Konto będzie aktywne do końca opłaconego okresu (DD.MM), potem zostanie usunięte."
- **MIGRATION_COMPLETED**: „Migracja Twojej strony z {{oldHost}} została zakończona pomyślnie." (G-6/G-7).
- **MIGRATION_FAILED**: „Wystąpił problem z migracją: {{error}}. Skontaktujemy się przez ticket."
- **BACKUP_READY**: „Backup Twojego konta został wykonany DD.MM HH:MM."
- **BACKUP_FAILED**: alert dla user'a + ticket otwarty automatycznie.

Implementacja:

- `apps/api/src/subscriptions/subscriptions.service.ts` → `create` → `SUBSCRIPTION_CREATED`.
- `apps/api/src/subscriptions/provisioning-queue.service.ts` → po sukcesie → `PROVISIONING_READY` z DA credentials (hasło z bazy raz, potem usuwamy/szyfrujemy).
- Renewal scheduler (już istnieje `apps/api/src/subscriptions/renewal.scheduler.ts`) → `PERIOD_ENDING_*` na 7 i 3 dni przed `currentPeriodEnd`. Idempotency po `(subscriptionId, kind, currentPeriodEnd)`.
- `subscriptions.service.ts` → `suspend/unsuspend/cancel` → odpowiednie eventy.
- `apps/api/src/migrations/...` → po jobie → `MIGRATION_*`.
- Backup service → `BACKUP_*`.

### 6. Billing e-mails (M-06)

Templates:

- **INVOICE_ISSUED**: „Wystawiliśmy fakturę na DD,DD PLN za okres DD-DD. [Pobierz fakturę]({{hostedInvoiceUrl}})."
- **INVOICE_PAID**: „Faktura {{number}} została opłacona. Dzięki!"
- **PAYMENT_FAILED**: 3-day grace warning. „Nie udało się pobrać płatności. Masz 3 dni na zmianę karty albo doładowanie portfela, zanim usługa zostanie zawieszona."
- **WALLET_TOPPED_UP**: „Doładowanie portfela: +DD,DD K. Aktualne saldo: DD,DD K."
- **WALLET_ADMIN_CREDIT** (już DONE jako helper `adminCreditNotificationTemplate`): „Otrzymałeś DD,DD K od Verris" + powód podany przez admina + nowe saldo + CTA do portfela. W M-06 trzeba przenieść copy do `EmailTemplate` (locale `pl`, version 1.0.0) i zastąpić bezpośrednie wywołanie `adminCreditNotificationTemplate` na `mailer.send({ kind: 'WALLET_ADMIN_CREDIT', userId, data: { ... } })`.
- **AUTO_TOPUP_CHARGED**: „Automatycznie doładowaliśmy portfel kartą •••• XXXX o DD,DD K. Saldo: DD,DD K."
- **AUTO_TOPUP_FAILED**: „Auto-doładowanie portfela nie powiodło się ({{reason}}). Zaloguj się i zaktualizuj kartę żeby uniknąć zawieszenia subskrypcji."
- **PROMO_REDEEMED**: „Kod promocyjny {{code}} został zrealizowany. +DD,DD K na portfelu."

Implementacja:

- `apps/api/src/billing/billing.service.ts` → `handleStripeWebhook` przy `invoice.created/finalized` → `INVOICE_ISSUED`, przy `invoice.paid/payment_succeeded` → `INVOICE_PAID`, przy `invoice.payment_failed`/`payment_intent.payment_failed` → `PAYMENT_FAILED`.
- `apps/api/src/billing/wallet-ledger.service.ts` po `topupConfirmed` → `WALLET_TOPPED_UP`.
- `apps/api/src/billing/wallet-auto-topup.service.ts` → `AUTO_TOPUP_CHARGED` przy success, `AUTO_TOPUP_FAILED` przy fail.
- `apps/api/src/billing/promo.service.ts` → po redeem → `PROMO_REDEEMED`.

Uwaga: w mailach billingowych używamy waluty wirtualnej `K` przy operacjach na portfelu i PLN przy fakturach (zgodnie z W-01).

### 7. Operacyjne e-maile (M-07, M-08)

- **AUTOSCALER_DISABLED**: „Saldo spadło do 0 K, autoscaler zastopowany. Strona nie skaluje się dynamicznie do czasu doładowania."
- **MONTHLY_AUTOSCALING_SUMMARY** (1. dnia miesiąca, jeśli było skalowanie): „W miesiącu DD-DD wydałeś DD,DD K na autoskalowanie. Top 3 dni: ..."
- **INCIDENT_IMPACTING_SERVICE**: dynamicznie z `IncidentBanner` model — wysyłamy do klientów, których konta są na affected węźle (`Server.id` matched z `Account.serverId`).
- **PLANNED_MAINTENANCE**: admin rozpisuje w panelu → enqueue dla affected użytkowników z `scheduledFor`.

Implementacja:

- `apps/api/src/autoscaling/autoscaling-billing.scheduler.ts` → przy `walletBalance <= 0` i autoscaler disabled → `AUTOSCALER_DISABLED`.
- Cron miesięczny → MONTHLY_AUTOSCALING_SUMMARY dla userów z `AutoscalingCharge.amount > 0` w danym miesiącu.
- `apps/api/src/observability/incidents.service.ts` (jeśli istnieje, inaczej dodać) → przy publish incident → fan-out do affected użytkowników.

### 8. Scheduler okresowych powiadomień (M-09)

- BullMQ repeatable job `period-ending-notifier` co godzinę:
  - Find subskrypcje z `currentPeriodEnd between now+6d23h and now+7d1h` → wyśle `PERIOD_ENDING_7D` (idempotency).
  - Find subskrypcje z `currentPeriodEnd between now+2d23h and now+3d1h` → wyśle `PERIOD_ENDING_3D`.
- Idempotency via `EmailLog`: query `kind=PERIOD_ENDING_*, userId, metadata.subscriptionId, metadata.periodEnd` w ostatnich 14 dniach. Jeśli już wysłany — skip.
- Cron miesięczny `monthly-autoscaling-summary` 1. dnia o 9:00.

### 9. Settings → „Powiadomienia" (M-10)

- W `apps/client-panel/src/app/dashboard/settings/page.tsx` dodać tab `Powiadomienia`.
- Toggles:
  - **Bezpieczeństwo i transakcyjne** — info „Zawsze włączone (wymagane prawnie)", `disabled`.
  - **Aktualizacje produktu** (default `true`) — toggle.
  - **Marketing i nowości** (default `false`) — toggle.
  - **Oferty od partnerów** (default `false`) — toggle.
- API: `GET /me/email-preferences`, `PATCH /me/email-preferences`. Zapis w `UserEmailPreferences`.
- Audit log z Sprintu 2: `MARKETING_OPT_IN/OUT`.
- Każda decyzja klienta jest również krótko wytłumaczona inline („Otrzymujesz: faktury, alerty bezpieczeństwa, powiadomienia o końcu okresu — bez tego usługa nie może działać.").

### 10. Admin → „Maile" (M-11)

- `apps/admin-panel/src/app/(dashboard)/email-log/page.tsx`:
  - Tabela `EmailLog` z filtrem: userId, kind, status, dateRange.
  - Każdy wiersz klikalny → modal z subject, body, providerMessageId, retryCount, errorMessage.
  - Akcja „Retry" (tylko dla `FAILED` lub `DEAD_LETTER`) → uruchamia ponownie kolejkę.
  - Akcja „Resend" (dla `SENT`) → tworzy nowy `EmailLog` (nie nadpisuje historii).
  - Statystyki na górze: bounce rate (dany dostawca), avg delivery time, top 5 failed kinds w ostatnich 7 dniach.
- Endpointy: `GET /admin/email-log`, `GET /admin/email-log/:id`, `POST /admin/email-log/:id/retry`, `POST /admin/email-log/:id/resend`.

### 11. SPF/DKIM/DMARC i warm-up (M-12)

- W `DEPLOY.md` runbook „Konfiguracja domeny nadawczej":
  - Wybór dostawcy (z Sprintu 0): Resend / Postmark / Amazon SES.
  - DNS records: SPF (`v=spf1 include:resend.com -all` lub odpowiednik), DKIM (klucz dostawcy), DMARC (`v=DMARC1; p=quarantine; rua=mailto:dmarc@verris.pl; pct=100`).
  - DMARC reports endpoint: aggregator typu `dmarc.postmarkapp.com` lub własny mailbox.
  - Warm-up procedura: pierwsze 7 dni — tylko maile do testowych kont (operatorzy), monitoring bounce rate i complaint rate. Następne 14 dni — stopniowe zwiększanie volume'u.
- Test scoring: `mail-tester.com` ≥ 9/10 jako kryterium DONE.
- Reverse DNS (PTR) dla IP wysyłkowego — dostawca załatwia, ale weryfikujemy.
- Auto-bounce handling: jeśli dostawca SMTP wysyła webhook bounce, parsujemy i markujemy `EmailLog.status = BOUNCED`. Po 2 hard bouncach pod rząd dla danego adresu — flag user `email_bounced = true` (nie wysyłamy więcej, panel pokazuje warning).

### 12. Stopka i compliance footer (M-13)

- **Większość już zrealizowana w W-04 (`email-shell.ts`).** Stopka shell'a zawiera: kontakt, RODO, polityka prywatności, regulamin, preferencje powiadomień, wysłano na, copyright. Dla `MARKETING`/`PRODUCT_UPDATE` dodatkowo blok „Wypisz się jednym kliknięciem".
- Pozostałe do zrobienia w tym tasku:
  - Uzupełnić w shellu pełne dane administratora po zatwierdzeniu w Sprincie 2: `Verris sp. z o.o.`, ulica, NIP, KRS — placeholder tagged `// TODO M-13` w pliku.
  - Dla maili `MARKETING/PRODUCT_UPDATE` zaimplementować one-click unsubscribe: token jednorazowy w URL (`POST /unsubscribe/:token`), endpoint w `apps/api/src/mail/unsubscribe.controller.ts` aktualizuje `UserEmailPreferences`.
  - Każdy mail ma `List-Unsubscribe` header (RFC 8058) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` w `MailerService.send` dla kategorii MARKETING/PRODUCT_UPDATE.
  - `mail-tester.com` wynik ≥ 9/10 (sprawdzić preheader, alt text, CTA contrast).

## Kolejność wykonania

1. Schema + migracje (M-01) i renderer (M-03).
2. `TransactionalMailerService` (M-02) z BullMQ retry.
3. Settings → Powiadomienia (M-10) — szybko, żeby od razu walidować na siebie.
4. Stopka i compliance footer (M-13) — fundament każdego maila.
5. Auth e-mails (M-04) — klient od razu odczuwa, że coś działa po rejestracji.
6. Subscription / hosting e-mails (M-05).
7. Billing e-mails (M-06).
8. Scheduler period-ending (M-09).
9. Operacyjne e-maile (M-07, M-08) — z incidents.
10. Admin → Maile (M-11).
11. SPF/DKIM/DMARC + warm-up (M-12) — można robić równolegle od początku, ale walidacja i włączenie produkcji na końcu.

## Kryteria DONE

- Każdy z 30+ template'ów w `EmailKind` ma seed w `EmailTemplate` w PL `v1.0.0`.
- Klient po rejestracji dostaje `WELCOME` w czasie < 60s.
- Klient przed końcem okresu rozliczeniowego dostaje `PERIOD_ENDING_7D` (na 7 dni) i `PERIOD_ENDING_3D` (na 3 dni) — bez duplikatów.
- Auto-topup failed wysyła mail w czasie < 5 minut po porażce.
- Każda wysyłka jest w `EmailLog` z `status` i `providerMessageId`.
- Klient w settings ma toggle dla marketing/product/partner. Transactional/security wyłączone do toggle'a.
- Admin widzi listę wysyłek z filtrem i może retry'ować dead-letter'y bez SQL'a.
- SPF/DKIM/DMARC: `mail-tester.com` ≥ 9/10 z domeną `noreply@verris.pl` (lub równoważnej).
- Każdy mail ma poprawny footer z linkiem do polityki prywatności i `List-Unsubscribe` header.
- Smoke test: pełny flow zakupu (rejestracja → welcome → zakup → subscription_created → provisioning_ready → period_ending → renewal → invoice_paid) z każdym mail'em odebranym przez testowy mailbox.

## Ryzyka

- **Domain reputation niski na świeżej domenie** — pierwsze maile mogą lądować w spamie u Gmail/Outlook. Mitigacja: warm-up procedure (M-12), monitoring bounce rate, postmaster.google.com / sender.outlook.com auth.
- **Spam triggers w treści** — używanie słów `klikni tutaj`, `hasło`, mnogie wykrzykniki, all-caps, mogą flagować mail. Mitigacja: copy review przez kogoś z doświadczeniem w cold email albo testy `mail-tester.com` per template.
- **Dostawca SMTP rate limit** — Resend 100/dzień darmo, Postmark trial limit, SES sandbox 200/dzień. Mitigacja: w Sprincie 0 wybrać plan adekwatny do przewidywanego volume.
- **PII w `EmailLog.subject` / błędach** — np. logowanie `subject = "Reset hasła dla jan.kowalski@..."`. Mitigacja: logujemy tylko `kind` i `recipientEmail`, nie pełny rendered subject jeśli zawiera PII innych userów. Anonimizacja IP i userAgent w retencji (Sprint 2 / L-10).
- **Idempotency miss** — np. period_ending wysłany 2× z powodu cron'a uruchomionego dwa razy. Mitigacja: `EmailLog` UNIQUE INDEX `(kind, userId, metadata->>'subscriptionId', metadata->>'periodEnd')` dla okresowych.
- **Mail-related GDPR (subprocessor)** — dostawca SMTP przetwarza dane osobowe (e-mail, treść). Musi być wymieniony w polityce prywatności (Sprint 2 / L-02) z linkiem do jego DPA. Resend i Postmark mają standardowe DPA do podpisania z konta admin.
- **Spam complaints i hard bounces** psują reputację — SES może zawiesić konto przy >0.1% complaint rate. Mitigacja: M-12 bounce handling + auto-flag userów + szybka reakcja operatora.

## Output sprintu

- Wdrożone wszystkie taski M-01..M-13.
- 30+ template'ów PL `v1.0.0` w `EmailTemplate`.
- Domain `noreply@verris.pl` (lub odpowiednia) z SPF/DKIM/DMARC, mail-tester.com ≥ 9/10.
- Smoke test pełnego flow z testowym kontem na Gmail + Outlook + ProtonMail (3 dostawcy = realny test).
- `EmailLog` zaczyna gromadzić historię wysyłek od dnia 1 produkcji.
- Klient ma kontrolę nad preferencjami w settings.
- Admin ma narzędzie do retry/resend bez SQL'a.
- Zaktualizowany `PROJECT_STATUS.md` (etap E rozszerzony lub nowy I — Maile transakcyjne).
- Stripe webhooki wysyłają poprawne maile billingowe — zweryfikowane na środowisku z `Stripe CLI listen` i symulowanymi eventami.
