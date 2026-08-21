> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** plan 19 sprintów w `plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md` wraz z backlogiem XLSX oraz dokumenty w `docs/legal/`
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Sprint 02 — Legal, RODO i zgody (LIVE blocker)

> Ten sprint odpowiada Sprintowi 1 z `SPRINT_PLAN.md`. Drafty regulaminu/polityki/cookies/DPA muszą być przygotowane już w Sprincie 0 (sekcja `4c. Audyt RODO i compliance` w `SPRINT_01_STABILIZACJA.md`), bo lawyer review trwa 1-2 tygodnie i to jest ścieżka krytyczna.

## Cel sprintu

Verris po tym sprincie ma kompletny, prawnie zgodny fundament do przyjmowania klientów w PL/UE: regulamin i polityka prywatności w UI, jasne zgody przy rejestracji, sposób realizacji praw klienta (dostęp, sprostowanie, eksport, usunięcie, sprzeciw), audyt operacji RODO, automatyczna retencja danych i procedura na wypadek naruszenia.

**Twardy LIVE blocker:** bez tego sprintu pierwszy realny klient = naruszenie RODO i ryzyko kary UODO.

## Zakres

- Schema legal w bazie (`LegalDocument`, `UserConsent`, `MarketingPreferences`, `DataExportRequest`, `AccountDeletionRequest`).
- Strony prawne dostępne publicznie pod każdą domeną panelu i status page.
- Rejestracja klienta wymaga akceptacji regulaminu i polityki prywatności.
- Re-consent flow przy publikacji nowej wersji dokumentów.
- Klient może z poziomu UI: pobrać kopię danych, zażądać usunięcia konta, wycofać zgodę marketingową, zobaczyć aktualne zgody.
- Admin panel ma sekcję „Compliance" do realizacji żądań i przeglądu zgód.
- Cron retencji anonimizuje stare dane zgodnie z polityką.
- DPA (Data Processing Agreement) dla klientów B2B.
- Procedura naruszenia ochrony danych w `DEPLOY.md`.
- AuditLog logujący wszystkie operacje RODO.

## Poza zakresem

- Pełne CMS dla regulaminu/polityki — wystarczy edycja Markdown w bazie z poziomu admina, bez WYSIWYG.
- Cookie analytics (Plausible/GA/Hotjar) — jeśli decydujemy się na tracking, wymaga osobnego task fast-follow `L-09b`. Na pierwszą betę wystarczą cookies sesyjne (bez opt-in banner'a, ale z disclaimerem w polityce cookies).
- Privacy Impact Assessment (PIA/DPIA) dla operacji wysokiego ryzyka — tylko jeśli planujemy AI moderation albo profilowanie (na razie nie).
- Integracja z zewnętrznym DPO (Inspektorem Ochrony Danych) — Verris jako mała firma nie ma obowiązku, wystarczy wskazany kontakt RODO w polityce.

## Stan obecny (audyt z chwili rozpoczęcia)

- `apps/client-panel/src/app/(auth)/register/page.tsx` nie zbiera żadnych zgód i nie linkuje do regulaminu/polityki.
- Schema `User` (`libs/database/prisma/schema.prisma`) ma firstName/lastName/companyName/NIP/address/city/postalCode/country, ale nie ma `termsAcceptedAt`, `privacyAcceptedAt`, `marketingOptIn`, `deletionRequestedAt`, `anonymizedAt`.
- Brak stron `/legal/*` w panelu klienta i status page.
- Brak procedury usunięcia konta i eksportu danych klienta.
- AuditLog nie loguje akcji typu `CONSENT_*`, `DATA_EXPORT_*`, `ACCOUNT_DELETION_*`, `ANONYMIZED`.
- `LoginAttempt` i `AuditLog` rosną bez limitu — brak retencji.

## Taski sprintu

### 1. Schema i migracje (L-01)

- Dodać do `libs/database/prisma/schema.prisma`:
  - `enum LegalDocumentKind { TERMS PRIVACY COOKIES DPA }`
  - `model LegalDocument { id, kind, version, locale, contentMarkdown, publishedAt, publishedById, isCurrent, createdAt }` z unique `(kind, version, locale)`.
  - `model UserConsent { id, userId, documentKind, documentVersion, locale, grantedAt, withdrawnAt?, ipAddress, userAgent, source }` (`source` = `REGISTRATION | RE_CONSENT | SETTINGS | ADMIN_MANUAL`).
  - `model MarketingPreferences { userId @unique, marketingEmail Boolean, productUpdatesEmail Boolean, partnerOffersEmail Boolean, updatedAt }` (security/transactional na sztywno true).
  - `model DataExportRequest { id, userId, requestedAt, status (PENDING|GENERATING|READY|EXPIRED|FAILED), downloadToken, expiresAt?, completedAt?, errorMessage? }`.
  - `model AccountDeletionRequest { id, userId @unique, requestedAt, scheduledFor, cancelledAt?, anonymizedAt?, anonymizedById?, reason? }` (scheduledFor = requestedAt + 14 dni).
  - W `User`: `termsAcceptedAt DateTime?`, `privacyAcceptedAt DateTime?`, `lastConsentVersionTerms String?`, `lastConsentVersionPrivacy String?`, `deletionRequestedAt DateTime?`, `anonymizedAt DateTime?`.
- Migracja Prisma + seed pierwszych wersji dokumentów (po lawyer review): `terms@1.0.0`, `privacy@1.0.0`, `cookies@1.0.0`, `dpa@1.0.0` w locale `pl`.
- Backfill istniejących userów: testowe konta seedowane jako `termsAcceptedAt = createdAt`, `privacyAcceptedAt = createdAt` z `lastConsentVersion* = '0.0.0-legacy'` żeby trafili w re-consent flow.

### 2. Strony prawne (L-02)

- `apps/client-panel/src/app/legal/[kind]/page.tsx` — server component, fetch z `GET /legal/:kind?locale=pl`, render Markdown przez bezpieczny renderer (np. `marked` + DOMPurify, ale w server compu wystarczy `react-markdown`).
- Routing: `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/dpa`. Publiczne, bez auth.
- Stopka panelu klienta i status page (`apps/status-page/...`): linki do tych 4 stron + e-mail kontaktowy RODO.
- Header/version info: na każdej stronie widoczne „Wersja 1.0.0 · obowiązuje od DD.MM.YYYY · poprzednie wersje".
- Endpoint `GET /legal/:kind/versions` zwraca pełną listę poprzednich wersji (transparency).

### 3. Rejestracja z zgodami (L-03)

- W formularzu (`apps/client-panel/src/app/(auth)/register/page.tsx`):
  - Checkbox **wymagany**: „Akceptuję [regulamin](/legal/terms) oraz [politykę prywatności](/legal/privacy) Verris".
  - Checkbox **opcjonalny**: „Chcę otrzymywać informacje marketingowe i o nowych funkcjach".
  - Submit zablokowany do momentu zaznaczenia wymaganego checkboxa.
- API: rozszerzyć `POST /auth/register` DTO o `acceptTerms: true`, `acceptPrivacy: true` (oba wymagane), `acceptMarketing?: boolean`. Walidacja class-validator: oba `acceptTerms/acceptPrivacy` muszą być `true`.
- W `AuthService.register`:
  - Zapisać `User.termsAcceptedAt = now`, `privacyAcceptedAt = now`, `lastConsentVersionTerms = current.terms.version`, `lastConsentVersionPrivacy = current.privacy.version`.
  - `UserConsent` × 2 (terms, privacy) z `source = REGISTRATION`, `ip` z `req.ip`, `userAgent` z headera.
  - `MarketingPreferences { marketingEmail: dto.acceptMarketing ?? false, ... }`.
  - AuditLog: `CONSENT_GRANTED` × 2 + `MARKETING_OPT_IN` jeśli `true`.

### 4. Re-consent flow (L-04)

- Middleware NestJS `RequireCurrentConsentGuard` sprawdza, czy `user.lastConsentVersionTerms == current.terms.version && user.lastConsentVersionPrivacy == current.privacy.version`. Jeśli nie — endpoint zwraca `403 RECONSENT_REQUIRED` z payloadem `{ docs: [{kind, currentVersion, userVersion}] }`.
- W panelu klienta: globalny modal „Zaktualizowaliśmy regulamin / politykę prywatności" pokazuje diff (lub link do nowej wersji) i checkbox akceptacji. Bez akceptacji nie da się przejść do dashboardu.
- API: `POST /me/consent/accept-current` zapisuje aktualne wersje + AuditLog `RE_CONSENT_GRANTED`.
- Po akceptacji modal znika, dashboard normalnie ładuje się.

### 5. Settings → „Prywatność i dane" (L-05, L-06, L-07)

W `apps/client-panel/src/app/dashboard/settings/page.tsx` dodać tab `Prywatność i dane`. Widok ma 4 sekcje:

#### 5a. Twoje zgody

- Lista udzielonych zgód z datami: `terms vX.Y.Z @ data`, `privacy vX.Y.Z @ data`, `marketing on/off @ data`.
- Toggle marketingu + zapis w `MarketingPreferences` (AuditLog `MARKETING_OPT_OUT/IN`).

#### 5b. Eksport danych (GDPR Art. 20)

- Button „Pobierz kopię moich danych".
- Kliknięcie tworzy `DataExportRequest` (status `PENDING`), kolejka BullMQ wykonuje:
  1. Fetch danych user'a: profile, subscriptions, accounts (DA usernames), invoices, walletTransactions, tickets, audit log dotyczący usera.
  2. Generuje ZIP z plikami JSON + README z opisem co zawiera.
  3. Zapisuje na `S3/B2/local volume`, `downloadToken` (hex 32B), `expiresAt = now + 7 dni`.
  4. Status = `READY`, e-mail z linkiem (Sprint 3 / M-06: data export ready).
- Endpoint `GET /me/data-export/download/:token` zwraca ZIP, jednorazowy, `expiresAt` honorowany.
- Limit: max 1 aktywny request per user na 24h (anti-DOS).
- AuditLog: `DATA_EXPORT_REQUESTED`, `DATA_EXPORT_GENERATED`, `DATA_EXPORT_DOWNLOADED`.

#### 5c. Usunięcie konta (GDPR Art. 17)

- Sekcja danger zone z buttonem „Usuń konto".
- Modal wymaga: hasła użytkownika + checkbox „Rozumiem, że proces jest nieodwracalny po 14 dniach".
- Tworzy `AccountDeletionRequest` z `scheduledFor = now + 14 dni`, blokuje konto (read-only) + e-mail (Sprint 3 / M-04).
- W ciągu 14 dni klient może cofnąć w settings („Anuluj usunięcie"), zapisuje `cancelledAt`, konto wraca do normalnego stanu.
- Po 14 dniach cron `account-deletion.scheduler.ts`:
  1. DA: `suspend` wszystkich kont użytkownika.
  2. Stripe: cancel wszystkich aktywnych subskrypcji.
  3. Anonimizacja PII: `email = 'deleted-${user.id}@verris.local'`, `firstName = lastName = address = city = postalCode = nip = null`, `passwordHash = ''`, `twoFactorSecret = null`, `twoFactorRecoveryCodesEnc = null`, `referralCode = null`, `ecoBadgeToken = null`.
  4. Zachowanie do księgowości: `Invoice`, `WalletTransaction`, `Subscription` zostają nienaruszone (5 lat retencji księgowej w PL). Mają już `userId` jako foreign key, ale po anonimizacji user nadal istnieje (rekord), tylko bez PII.
  5. Po 6 mies. (drugi cron) DA accounts deleted (po backupach). To jest L-10 retention.
  6. Set `User.anonymizedAt = now`.
- AuditLog: `ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_DELETION_CANCELLED`, `ACCOUNT_ANONYMIZED`.

#### 5d. Historia operacji RODO

- Lista (read-only): wszystkie zgody udzielone/wycofane, eksporty wygenerowane, prośby usunięcia (z statusem). Klient widzi pełną oś swoich operacji RODO.

### 6. Admin → „Compliance" (L-08)

- `apps/admin-panel/src/app/(dashboard)/compliance/page.tsx` — sidebar ma nowy link „Compliance".
- Tabs:
  - **Dokumenty prawne** — lista wersji `LegalDocument`, podgląd Markdown, CTA „Opublikuj nową wersję" (form upload Markdown + `version` semver + `publishedAt`).
  - **Zgody klientów** — tabela `UserConsent` z filtrem (user, kind, version), eksport CSV.
  - **Eksporty danych** — tabela `DataExportRequest`, manualny retry błędnych, force-expire jeśli klient prosi.
  - **Wnioski o usunięcie** — tabela `AccountDeletionRequest`, możliwość manualnej anonimizacji (z 2FA challenge na admin'a + powodem) np. na żądanie UODO.
- Każda akcja admin'a w „Compliance" loguje `LEGAL_DOC_VERSION_PUBLISHED`, `ADMIN_FORCED_DATA_EXPORT`, `ADMIN_FORCED_ACCOUNT_ANONYMIZED` z `actorId`, `targetUserId`, `reason`.

### 7. Cookie banner (L-09)

- Decyzja: na pierwszą betę używamy tylko cookies sesyjnych (auth JWT, CSRF) — banner nie jest wymagany w UE w sensie ePrivacy.
- W stopce panelu i status page dodać krótkie info: „Verris używa wyłącznie niezbędnych plików cookies. [Polityka cookies](/legal/cookies)".
- Jeśli w trakcie sprintu zapadnie decyzja o Plausible/GA, dodać `L-09b`: opt-in cookie banner z `consent` model'em (banner pokazuje się raz, decyzja zapisana w `localStorage` + per-user w `MarketingPreferences.analyticsOptIn`).

### 8. Polityka retencji w cron (L-10)

- `apps/api/src/compliance/retention.scheduler.ts` (BullMQ daily):
  - `LoginAttempt` starsze niż 180 dni → DELETE.
  - `AuditLog` starsze niż 24 miesiące → anonimizacja `ipAddress`, `userAgent` (treść akcji zostaje, bo to potrzebne do księgowego audytu).
  - `DataExportRequest.status='READY'` z `expiresAt < now` → status `EXPIRED`, plik ZIP usuwany.
  - `AccountDeletionRequest.scheduledFor < now AND cancelledAt IS NULL AND anonymizedAt IS NULL` → uruchom anonimizację (sekcja 5c).
  - Po 6 mies. od `User.anonymizedAt` → DA accounts hard delete (jeśli backupy z tego okresu już ekspirowały).
- AuditLog dla każdej masowej operacji: `RETENTION_PURGE` z `count`, `kind`, `cutoff`.

### 9. DPA dla B2B (L-11)

- W settings klienta sekcja „Umowa powierzenia (DPA)" widoczna tylko gdy `User.companyName` lub `User.nip` jest wypełnione.
- Generator PDF z aktualną treścią DPA + dane klienta (nazwa firmy, NIP, adres) + identyfikator umowy (UUID).
- Klient klika „Zaakceptuj DPA" — zapisuje `UserConsent` z `documentKind = DPA`, generuje PDF, wysyła na e-mail (Sprint 3 / M-04).
- Admin może zobaczyć DPA per klient w „Compliance".

### 10. Procedura naruszenia (L-12, dokument)

- W `DEPLOY.md` (lub osobny `INCIDENT_RESPONSE.md`) sekcja **„Procedura naruszenia ochrony danych"**:
  - Definicja naruszenia (utrata/ujawnienie/dostęp nieautoryzowany do PII).
  - Role: kto klasyfikuje (admin/CTO), kto komunikuje wewnątrz, kto kontaktuje UODO.
  - Timeline 72h (RODO Art. 33): zgłoszenie do UODO przez `https://uodo.gov.pl/`.
  - Komunikacja klientom — szablon e-maila (M-08 incident impacting your service).
  - Lista checkpoints po incydencie: rotacja kluczy `APP_KMS_KEY`/`JWT_SECRET`, audyt logów, post-mortem, update procedur.

### 11. AuditLog dla operacji RODO (L-13)

- Rozszerzyć `AuditLog.action` enum (lub typ string) o:
  - `CONSENT_GRANTED`, `CONSENT_WITHDRAWN`, `RE_CONSENT_GRANTED`
  - `MARKETING_OPT_IN`, `MARKETING_OPT_OUT`
  - `DATA_EXPORT_REQUESTED`, `DATA_EXPORT_GENERATED`, `DATA_EXPORT_DOWNLOADED`, `DATA_EXPORT_EXPIRED`
  - `ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_DELETION_CANCELLED`, `ACCOUNT_ANONYMIZED`
  - `LEGAL_DOC_VERSION_PUBLISHED`
  - `ADMIN_FORCED_DATA_EXPORT`, `ADMIN_FORCED_ACCOUNT_ANONYMIZED`
  - `RETENTION_PURGE`
- Każdy logger dopisany w odpowiednim service (auth.service, account-deletion.scheduler, retention.scheduler, compliance.controller, etc.).
- W `apps/admin-panel/src/app/(dashboard)/audit/page.tsx` dodać filtr `category = 'RODO'` z mapowaniem powyższych akcji.

## Kolejność wykonania

1. Migracja schemy (L-01) i seed dokumentów po lawyer review.
2. Strony `/legal/*` (L-02) — żeby checkbox rejestracji miał gdzie linkować.
3. Rejestracja z zgodami (L-03) i AuditLog dla CONSENT (L-13 częściowo).
4. Re-consent flow (L-04) z modal'em w panelu.
5. Settings → Prywatność: zgody i marketing toggle (L-05).
6. Eksport danych (L-06) z BullMQ jobem.
7. Usunięcie konta (L-07) z 14-dniowym grace + cron anonimizacji.
8. Admin → Compliance (L-08).
9. Cookie banner / disclaimer w stopce (L-09).
10. Retention cron (L-10) — uruchomić na końcu, jak wszystkie inne tabele już są.
11. DPA dla B2B (L-11).
12. Procedura naruszenia w runbook (L-12).
13. Pełny audyt RODO w AuditLog (L-13) — dopiąć brakujące loggery, włączyć filtr „RODO" w admin panelu.

## Kryteria DONE

- Każdy nowy użytkownik musi zaakceptować regulamin i politykę prywatności w rejestracji — zapis w `UserConsent` z IP i user-agent.
- Strony `/legal/{terms,privacy,cookies,dpa}` dostępne pod każdą domeną panelu (klient, staff, admin) i status page.
- Klient z poziomu UI może: pobrać kopię danych w ZIP, zażądać usunięcia konta z 14-dniowym grace, wycofać zgodę marketingową.
- Re-consent modal wymusza akceptację nowej wersji regulaminu/polityki przy najbliższym logowaniu.
- Admin widzi listę zgód, eksportów i wniosków o usunięcie w panelu „Compliance" bez SQL'a.
- Cron retencji uruchamia się raz dziennie i czyści `LoginAttempt > 180d`, anonimizuje IP w `AuditLog > 24m`, ekspiruje stare exporty, anonimizuje konta z `scheduledFor < now`.
- Klienci B2B mogą zaakceptować DPA i otrzymać PDF na e-mail.
- Procedura naruszenia jest opisana w `DEPLOY.md` lub `INCIDENT_RESPONSE.md`.
- Smoke test: pełna rejestracja → akceptacja zgód → użycie panelu → eksport danych → wniosek o usunięcie → cofnięcie wniosku → ponowny wniosek → cron anonimizuje po 14 dniach (na środowisku stagingowym z przyspieszonym `scheduledFor`).
- AuditLog ma kompletne wpisy dla każdej operacji RODO, filtr „RODO" w admin panelu działa.

## Ryzyka

- **Lawyer review trwa dłużej niż 1-2 tyg.** — bez zatwierdzonych dokumentów nie można uruchomić L-02 i L-03. Mitigacja: wystartować Sprint 0 od umowy z prawnikiem, mieć w międzyczasie taski 1, 4, 5, 6, 7, 11 (kod nie zależy od treści dokumentów, tylko ich wersjonowanie).
- **Mass anonimizacja przyzakończeniu okresu rozliczeniowego księgowego** — gdy ktoś zażąda usunięcia w trakcie cyklu Stripe, anonimizacja musi nastąpić po wystawieniu finalnej faktury. Mitigacja: cron sprawdza, czy `Subscription.currentPeriodEnd > now`, jeśli tak, przesuwa `scheduledFor` do końca okresu + 1 dzień.
- **Eksport danych może być duży** (tickety z załącznikami) — limit rozmiaru ZIP, jeśli przekracza 100 MB, splitujemy na części z linkami w mail'u.
- **Backup'y z PII** — backup Postgresa zawiera dane sprzed anonimizacji. Polityka retencji backup'ów (6 mies.) musi być spójna z RODO. Klient żądający usunięcia musi być poinformowany, że backupy są usuwane wraz z rotacją (nie da się usunąć selektywnie).
- **Subprocessors** — Stripe, dostawca SMTP, infrastruktura (OVH/Hetzner) to subprocessor'y. W polityce prywatności muszą być wymienieni z linkami do ich własnych polityk. Aktualizacja listy = nowa wersja polityki = re-consent flow.

## Output sprintu

- Wdrożone wszystkie taski L-01..L-13.
- Lawyer-approved drafty zaimportowane do `LegalDocument` jako `vX.Y.Z@published`.
- Dokumentacja procedury naruszenia w `DEPLOY.md` / `INCIDENT_RESPONSE.md`.
- Uaktualniony `PROJECT_STATUS.md` (nowy etap I — Compliance & RODO).
- Lista subprocessor'ów w polityce prywatności (Stripe, dostawca SMTP, hosting node provider).
- Smoke test compliance flow przeszedł bez błędów na stagingu.
- Zaktualizowany `GO_NO_GO_PROD.md` o sekcję „RODO" z punktami: zgody przy rejestracji, strony legal, eksport danych, deletion flow, retention cron, AuditLog kompletny.

## Postęp realizacji (kod, Sprint 1)

| Task   | Status              | Komentarz / output                                                                                              |
|--------|---------------------|-----------------------------------------------------------------------------------------------------------------|
| L-01   | ✅ ZROBIONE         | Schema rozszerzona (`LegalDocument`, `UserConsent`, `MarketingPreferences`, `DataExportRequest`, `AccountDeletionRequest`) + migracja `20260517220000_legal_rodo_sprint1` + backfill `0.0.0-legacy` + seed draftów `1.0.0-draft` z `docs/legal/drafts/` (`isCurrent=false` — czekamy na lawyer review) |
| L-02   | ✅ ZROBIONE (api+ui) | Endpoint `GET /legal[/:kind[/version/:v|/versions]]` + strona `/legal/[kind]` w client-panel (server component, własny markdown renderer w `lib/markdown.tsx`) |
| L-03   | ✅ ZROBIONE         | `RegisterDto` rozszerzony o `acceptTerms/Privacy/Marketing`, server action waliduje, `AuthService.register` zapisuje `UserConsent` × 2 + `MarketingPreferences`, blokuje rejestrację jeśli brak `isCurrent` |
| L-04   | ✅ ZROBIONE (api+ui) | `GET /me/consent/status` + `POST /me/consent/accept-current`, `<ReConsentModal />` w dashboard layout (overlay z linkami do nowych wersji + checkbox + form logout) |
| L-05   | ✅ ZROBIONE         | Tab "Prywatność i dane" w `dashboard/settings`: zgody (read-only), marketing toggles, eksport danych, usunięcie konta, modal "Usuń konto" z hasłem + reason + 14d info |
| L-06   | ✅ ZROBIONE         | `DataExportService` z fire-and-forget background workerem (in-process, NDJSON.gz), endpoint download token-based 7d TTL, anti-DoS 24h cooldown |
| L-07   | ✅ ZROBIONE         | `AccountDeletionService` (request/cancel/anonymize), `AccountDeletionScheduler` cron 03:30, anonimizacja PII + cancel subscriptions + paymentMethod wipe |
| L-08   | ✅ ZROBIONE         | `/admin/compliance` z 4 tab'ami: dokumenty (publish form), zgody (filterable list), eksporty (retry), wnioski (force-anonymize z modal) |
| L-09   | ✅ ZROBIONE         | Stopka panelu klienta z linkami do `/legal/*` + email RODO; bez banner cookies (sesyjne) |
| L-10   | ✅ ZROBIONE         | `RetentionScheduler` cron 04:00: LoginAttempt 180d, AuditLog IP 24m, exporty wygasłe, audit log dla każdego sweepu |
| L-11   | 🟡 Follow-up        | Endpoint `POST /me/consent/accept-dpa` (B2B-only) + treść w `/legal/dpa`. **PDF generator z merge fields klienta — FOLLOW-UP** (nie blokuje LIVE, można zaakceptować + zachować PDF z print-to-PDF na razie) |
| L-12   | ✅ ZROBIONE         | Plik `INCIDENT_RESPONSE.md`: definicja, klasyfikacja P0..P3, role, timeline 72h, komunikacja klientom, post-mortem, kontakty |
| L-13   | ✅ ZROBIONE         | `apps/api/src/common/audit/audit.actions.ts` — `RodoActions` constant + `RODO_ACTION_SET` + `isRodoAction()` helper; loggery dopięte we wszystkich serwisach RODO |

**Operacyjnie pozostaje (nie kod):** lawyer review draftów, publikacja `1.0.0` przez admina, smoke test E2E na staging'u, uzupełnienie `PROJECT_STATUS.md` i `GO_NO_GO_PROD.md` o sekcję RODO.
