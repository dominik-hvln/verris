# Verris — plan sprintów do testów LIVE

> Plan powstał na bazie `PROJECT_STATUS.md`, `ROADMAP_GAPS.md`, `BACKLOG.md`, `DEPLOY.md`, `GO_NO_GO_PROD.md` i `LOCAL_DEV.md`.
> Cel: domknąć istniejące funkcjonalności, rozbudować panel hostingowy, zwiększyć niezawodność i dojść do kontrolowanych testów przed sprzedażą LIVE.
>
> Aktualny plan domknięcia przed produkcją, z kryterium **100% LIVE bez MVP, mocków i brakujących funkcji**, jest w [`LIVE_READINESS_PLAN.md`](./LIVE_READINESS_PLAN.md). Ten dokument pozostaje roadmapą historyczną i produktową; decyzję GO/NO-GO opieramy o `LIVE_READINESS_PLAN.md`, `PROD_HEALTH_CHECKLIST.md` oraz pełny smoke test.

## Założenia

- Sprint = 2 tygodnie pracy, poza Sprintem 0, który powinien być krótkim sprintem stabilizacyjnym 3-5 dni.
- Obecny control-plane działa na 4 vCPU / 8 GB RAM / Ubuntu 24.04, więc ciężkie operacje, migracje i skany nie powinny wykonywać się w procesie API synchronicznie.
- Priorytet przed LIVE: brak fałszywych obietnic w UI, pewny billing, audytowalne operacje BOK/admina, odtwarzalne backupy, monitoring i smoke testy end-to-end.
- DirectAdmin, CloudLinux LVE, LiteSpeed i Stripe są rdzeniem stacku **100%-LIVE** (produkcyjnym, nie „połówką”). PayU, domeny, Softaculous, AI i pełna automatyzacja migracji są kolejnymi warstwami.

## Autoskalowanie (CPU / RAM / Dysk)

> Szczegółowy breakdown sprintów **AS-1 … AS-3** (silnik dysku, UX, tier pricing): [`AUTOSCALING_SPRINT_PLAN.md`](./AUTOSCALING_SPRINT_PLAN.md).

| Status | Opis |
|--------|------|
| ✅ Wdrożone | Cennik i kalkulator: 3 zasoby (CPU, RAM, Dysk); I/O i transfer wycofane z katalogu |
| ✅ AS-1 | Silnik runtime + billing `scaledDiskMb`, sync quota DA, panel limitów |
| ✅ AS-2 | Toggle CPU/RAM/dysk, prefill kalkulatora, max overscale w planie, e-mail scale-up, runbook shrink |
| 🔜 AS-3 | Tier pricing, symulator w adminie, metryki i raport przychodu |

## Quick-wins zrealizowane i fast-follow wallet

### Zrobione

- **W-01 — Wirtualna waluta wallet (kredyty, skrót `K`, kurs 1 PLN = 1 K):** helper `lib/credits.ts` z `formatCredits()` i polskim plurałem, rebrand topbar, dashboard StatCard, `/dashboard/billing`, `TopupCard`, auto-topup, promo i timeline autoskalowania. Backend, ledger, Stripe i faktury pozostają w PLN — to czysta kosmetyka UI, dlatego nie wymaga migracji. Disclaimer „Faktury wystawiamy w PLN zgodnie z polskim prawem (1 zł = 1 kredyt)" widoczny pod listą transakcji.
- **W-02 — Wallet badge w topbar klienta:** sticky komponent w `apps/client-panel/src/app/dashboard/wallet-badge.tsx`, kolorystyka warunkowa (emerald przy zdrowym saldzie, amber poniżej 20 K, rose gdy 0 K), klikalny → `/dashboard/billing`, fallback `— K` przy braku danych. `SidebarUser` rozszerzone o `walletBalance`, więc badge jedzie tym samym fetchem co reszta sidebara, bez nowych endpointów.
- **W-04 — Mail shell + design spójny z brandem:** `apps/api/src/mail/templates/_layouts/email-shell.ts` z funkcją `renderEmailShell()` zwracającą HTML i plaintext. Layout table-based (compatibility z Outlookiem), inline CSS, jasny background, sky-600 accent, Inter typography, brand header, body z minimalnym Markdown (paragrafy, H2/H3, **bold**, *italic*, listy, linki), opcjonalny CTA button, footnote, stopka compliance (kontakt, RODO, polityka prywatności, regulamin, preferencje powiadomień), unsubscribe block dla kategorii MARKETING/PRODUCT_UPDATE, preheader trick dla preview u Gmail/Inbox. Refaktor `ticket-notifications.ts` korzysta już z shella. To fundament dla całego Sprintu 3 (Maile transakcyjne) — wszystkie kolejne template'y (welcome, invoice, period-ending, …) będą używać tej samej fasady.
- **W-05 — Admin manualne uznanie portfela (z e-mailem):** akcja `adminCreditWalletAction` w `apps/admin-panel/src/app/(dashboard)/customers/actions.ts` woła `POST /admin/billing/wallet/credit`, modal `CreditWalletButton` na liście klientów (preset kwot, preset powodów, podgląd projektowanego salda po doładowaniu, walidacja). Klient widzi w historii transakcji „Uznanie od Verris" + powód podany przez admina (`description` z `WalletTxType.ADJUSTMENT` + `paymentProvider=MANUAL`). Wysyłany jest e-mail (`adminCreditNotificationTemplate`) z imieniem, kwotą, powodem, nowym saldem i CTA do portfela.
- **W-06 — Admin UI dla kodów promocyjnych:** strona `/promo-codes` w admin-panelu (`apps/admin-panel/src/app/(dashboard)/promo-codes/`) z `CreatePromoForm` (kod, wartość kredytów, opis, limit realizacji, data ważności) i tabelą wszystkich kodów (typ, wartość, realizacje, ważność, status: aktywny/nieaktywny/wygasł/wykorzystany). Backend `POST /admin/billing/promo-codes` już istniał (`PromoService.createPromoCode`), tylko nie był wywoływalny z UI. UI explicite blokuje typ `PERCENT_BONUS` (backend rzuca BadRequest przy redempcji). Klient po wpisaniu kodu w `/dashboard/billing` dostaje wartość jako `PROMO_CREDIT` na portfelu (1 zł = 1 kredyt).
- **W-07 — Admin lista klientów: dual-display kredyty + PLN:** w tabeli klientów na `/customers` saldo wyświetlane jako `XX.XX K` z sub-labelem `≈ XX.XX zł`, żeby operator nie pomylił się przy obsłudze klienta dzwoniącego o „złotówki w portfelu".

### Do zrobienia (W-03 — wallet polishing, mały scope)

Dorobić odświeżanie i UX wallet badge oraz mostek dla operatorów. Najlepszy moment: razem ze Sprintem 2 (Maile) lub jako 1-dniowy task w Sprincie 4 (Admin operacyjny).

- **W-03a — Auto-refresh badge po doładowaniu Stripe:** po powrocie z `/dashboard/billing?status=success` topbar pokazuje stare saldo do następnego F5. Dodać `router.refresh()` po sukcesie + `revalidatePath('/dashboard', 'layout')` w `startTopupAction` po webhooku, żeby badge updatował się sam. Alternatywa: lekki polling `setInterval(30s)` `fetchSidebarUser` jeśli klient ma otwarty panel długo.
- **W-03b — Skeleton w badge i sidebar user card:** obecnie pierwszy fetch pokazuje `— K` przez ułamek sekundy, lepiej pokazać krótki shimmer. Dodać `loading: true` do `SidebarUser` state i renderować pulse'owany placeholder dopóki `fetchSidebarUser` nie wróci.
- **W-03c — Dual-display kredytów i PLN w admin panelu:** ~~admin/staff widzą realne kwoty PLN~~ (zrealizowane w W-07 dla listy klientów). Pozostała do zrobienia analogiczna zmiana w panelu staff, ekranach faktur, eksportach CSV (kolumna `amount_credits` obok `amount_pln`) i widoku detali klienta `customers/[id]/page.tsx` (gdy taki powstanie w Sprincie 4).
- **W-03d — Auto-topup attempts w mailach:** kiedy `WalletAutoTopup` failuje, wysłać klientowi maila z linkiem do zmiany karty + wartością prób w kredytach. To zazębia się ze Sprintem 2 (M-06), więc najlepiej zrealizować razem.
- **W-03e — Wallet badge w panelu staff podczas impersonacji:** gdy staff impersonuje klienta, badge powinien pokazywać saldo impersonowanego (już to robi przez session), ale potrzebny jasny wizualny marker (np. obramowanie amber + ikona oka), żeby pomyłka wpłaty była niemożliwa.
- **W-08 — Detale klienta z wallet ledger w admin (`/customers/[id]`):** brakująca strona z pełnym wglądem w jeden profil — historia transakcji, faktury, subskrypcje, otwarte tickety, log doładowań i log impersonacji. Tam też przeniesiemy modal `CreditWalletButton` (na liście pozostawiamy skrót). Wymaga endpointu `GET /admin/users/:id` z dodatkowymi relacjami i ledger pagination. Najlepiej zrealizować w Sprincie 4 (Admin operacyjny).
- **W-09 — Soft-delete / dezaktywacja kodu promocyjnego z UI:** obecnie nie ma sposobu, żeby admin wyłączył kod (kolumna `active: boolean` istnieje, brak akcji w UI). Dodać przełącznik w wierszu tabeli `/promo-codes` + endpoint `PATCH /admin/billing/promo-codes/:id` z polem `active`. Po wyłączeniu redemption zwraca `404 'kod nieaktywny'` (już zaimplementowane w `PromoService.redeemPromo`).



## Sprint 0 — Stabilizacja tego, co już jest w repo

> Szczegółowy task breakdown: [`SPRINT_01_STABILIZACJA.md`](./SPRINT_01_STABILIZACJA.md).

**Cel:** wdrożyć aktualny stan na serwer, potwierdzić realne działanie paneli i usunąć ryzyka operacyjne przed dalszym developmentem.

**Status (kod-side):** ✅ ZROBIONE. Outputs: [`STRIPE_DAHLIA_COMPATIBILITY.md`](./STRIPE_DAHLIA_COMPATIBILITY.md), [`docs/legal/drafts/`](./docs/legal/drafts/), [`docs/mail/AUDIT.md`](./docs/mail/AUDIT.md), [`PROD_HEALTH_CHECKLIST.md`](./PROD_HEALTH_CHECKLIST.md). Pozostały zadania operacyjne wymagające serwera (deploy, DNS, klucze, smoke test).

### Taski

- ⏳ Uruchomić deploy według `DEPLOY.md`: build, `prisma migrate deploy`, seed admin/staff, domeny Caddy, Stripe webhook, status page i Grafana.
- ⏳ Uzupełnić `.env.prod`: `JWT_SECRET`, `APP_KMS_KEY`, `POSTGRES_PASSWORD`, domeny `CADDY_*`, `PUBLIC_*`, SMTP, Stripe live/test zgodnie ze środowiskiem.
- ⏳ Skonfigurować pierwszy węzeł: CloudLinux + LVE + LiteSpeed/LSPHP + DirectAdmin, bootstrap, akceptacja, test DA.
- ⏳ Ustawić trwały volume dla `TICKET_UPLOAD_DIR`.
- ⏳ Uruchomić backup lokalny Postgresa oraz off-site przez `rclone` albo równoważny mechanizm.
- ⏳ Ustawić hasło `grafana_ro`, token `/metrics` i potwierdzić logowanie Grafany przez SSO.
- ✅ **Audyt Stripe `2026-04-22.dahlia`** — naprawione 3 krytyczne bugi (`subscription.current_period_*` → `items.data[0]`, `invoice.subscription` → `parent.subscription_details`, `invoice.payment_intent` → `confirmation_secret`). Helpery cross-version w `stripe.client.ts`, `STRIPE_API_VERSION` env-driven, runbook upgrade w `DEPLOY.md`.
- ✅ **Audyt RODO + drafty 4 dokumentów prawnych** — `docs/legal/drafts/{terms,privacy,cookies,dpa}.md`, gotowe do lawyer review.
- ✅ **Audyt mailingu + wybór SMTP** — Resend EU rekomendowane, lista ~23 template'ów z triggerami w kodzie, plan SPF/DKIM/DMARC, schema bazy (`EmailTemplate`, `EmailLog`, `UserEmailPreferences`).
- ⏳ Wykonać pełny smoke test: login admin/staff/client, zakup, provisioning DA, billing, faktura, ticket z załącznikiem, status probe, suspend/unsuspend.
- ⏳ Zmierzyć bazowe zużycie RAM/CPU na control-plane przy pustym ruchu i po smoke teście.

### Kryteria DONE

- `GO_NO_GO_PROD.md` przechodzi bez punktów krytycznych NO-GO.
- API `/healthz`, `/readyz`, panele, status page i Grafana działają po HTTPS.
- Da się utworzyć realną usługę hostingową na węźle i wykonać co najmniej jedną operację DA z panelu klienta.
- Backup da się odtworzyć na środowisku testowym albo stagingowym.
- Drafty regulaminu, polityki prywatności, polityki cookies, DPA czekają na lawyer review (release blocker dla Sprintu 1).
- Konto SMTP transakcyjnego (Resend lub równoważne) gotowe + rekordy SPF/DKIM/DMARC zweryfikowane (`mail-tester.com` ≥ 9/10).

## Sprint 1 — Legal, RODO i zgody (LIVE blocker, P0)

> Szczegółowy task breakdown: [`SPRINT_02_LEGAL_RODO.md`](./SPRINT_02_LEGAL_RODO.md).

**Cel:** Verris ma w pełni zgodną z RODO bazę prawną do przyjmowania klientów: regulamin, politykę prywatności, jasne zgody przy rejestracji, sposób realizacji praw klienta (dostęp, eksport, usunięcie) oraz audyt operacji na danych osobowych. Bez tego sprintu przyjmowanie pierwszego klienta jest nielegalne w PL/UE.

### Stan obecny

- Formularz rejestracji w panelu klienta nie zbiera żadnych zgód i nie linkuje do regulaminu/polityki prywatności.
- Schema `User` nie ma pól `termsAcceptedAt`, `privacyAcceptedAt`, `marketingOptIn`, `deletionRequestedAt`.
- Brak stron `/legal/terms`, `/legal/privacy`, `/legal/cookies`, brak DPA dla klientów B2B.
- Brak procedury usunięcia konta i eksportu danych klienta.
- Audit log istnieje, ale nie zawiera akcji typu `CONSENT_GRANTED`, `DATA_EXPORT_REQUESTED`, `ACCOUNT_DELETION_REQUESTED`, `ANONYMIZED`.

### Taski

- **L-01**: Schema legal — modele `LegalDocument` (`terms`, `privacy`, `cookies`, `dpa` z wersjami), `UserConsent` (per user, per dokument, per wersja, `grantedAt`, `withdrawnAt`, `ip`, `userAgent`), `MarketingPreferences`, `DataExportRequest`, `AccountDeletionRequest`. Migracja Prisma + seed pierwszych wersji dokumentów.
- **L-02**: Strony prawne w panelu klienta i status page: `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/dpa`. Renderowane z bazy (treść Markdown z wersjonowaniem). Publiczne, bez auth. Linki w stopce paneli i status page.
- **L-03**: Rejestracja klienta — checkbox „Akceptuję regulamin i politykę prywatności" (wymagany), checkbox marketingu (opcjonalny), wymóg potwierdzenia przed `submit`. API zapisuje `UserConsent` z `ip`, `userAgent`, wersją dokumentów.
- **L-04**: Re-consent flow — gdy administrator publikuje nową wersję dokumentu, użytkownicy przy następnym logowaniu dostają modal z aktualną wersją i muszą zaakceptować przed dalszym korzystaniem.
- **L-05**: Settings → „Prywatność i dane" — klient widzi udzielone zgody, może wycofać marketingowe, pobrać kopię danych (eksport JSON ZIP) i zażądać usunięcia konta.
- **L-06**: Eksport danych (GDPR Art. 20) — endpoint `POST /me/data-export` tworzy job, generuje ZIP (profile, subskrypcje, faktury, wallet, tickety, audit log dotyczący usera), wysyła link na e-mail. Link czasowy z tokenem.
- **L-07**: Usunięcie konta (GDPR Art. 17) — endpoint `POST /me/deletion-request` z 14-dniowym okresem grace (klient może cofnąć), po tym czasie cron anonimizuje: PII zastępowane hashami, `email` → `deleted-<uuid>@verris.local`, hasła i 2FA wyzerowane, dane do faktur zachowane przez 5 lat (obowiązek księgowy w PL), DA account suspended/deleted według polityki retencji. Flagi `anonymizedAt`, `deletedAt` w User. Audit log.
- **L-08**: Admin panel → „Compliance" — lista udzielonych zgód, lista DataExportRequest i AccountDeletionRequest, możliwość manualnej anonimizacji (z powodem i 2FA challenge), wgląd w wersje dokumentów.
- **L-09**: Cookie banner na publicznych stronach (status page, strony legal, login/register) — esencjalne tylko, bez tracking analytics, lub jeśli planowane Plausible/GA z opt-in.
- **L-10**: Polityka retencji w kodzie — cron anonimizuje stare `LoginAttempt` (>180 dni), `AuditLog` per polityka (np. >24 mies. anonimizacja IP, treść zostaje), nieaktywne konta po N latach do anonimizacji ze powiadomieniem.
- **L-11**: DPA dla klientów B2B — strona z generatorem PDF/podpisem, akceptacja wersji DPA per klient, widoczne w admin panelu.
- **L-12**: Procedura naruszenia ochrony danych — wewnętrzny runbook w `DEPLOY.md`: kto, kiedy, jak zgłasza do UODO (72h), jak informuje klientów. Bez kodu, ale wymagane.
- **L-13**: Aktualizacja audytu — wszystkie operacje RODO logowane jako oddzielne akcje (`CONSENT_GRANTED`, `CONSENT_WITHDRAWN`, `DATA_EXPORT_GENERATED`, `ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_ANONYMIZED`, `LEGAL_DOC_VERSION_PUBLISHED`).

### Kryteria DONE

- Rejestracja blokuje submit bez akceptacji regulaminu i polityki prywatności.
- Każdy zarejestrowany klient ma `UserConsent` z wersjami dokumentów.
- Klient z poziomu UI może pobrać swoje dane i zażądać usunięcia konta.
- Strony `/legal/*` są publicznie dostępne pod każdym domeną panelu i status page.
- Admin widzi wszystkie zgody i może realizować żądania klientów bez SQL.
- Procedura naruszenia jest opisana w runbooku.

## Sprint 2 — Maile transakcyjne i powiadomienia (LIVE blocker, P0)

> Szczegółowy task breakdown: [`SPRINT_03_MAILE.md`](./SPRINT_03_MAILE.md).

**Cel:** klient po rejestracji, zakupie, doładowaniu, zbliżającym się końcu okresu i każdym ważnym zdarzeniu dostaje e-mail. Operatorzy mają audytowalną historię wysyłek i mogą włączać/wyłączać konkretne kanały. Bez tego klient nie wie, co dzieje się z jego usługą — typowy hosting wysyła kilkadziesiąt rodzajów maili.

### Stan obecny

- Mailer (`MailerService`) ma SMTP i log provider, jest gotowy.
- Templates istnieją tylko dla ticketów (`templates/ticket-notifications.ts`) i alertów `suspicious-activity`.
- Brak: welcome, password reset, subscription created, provisioning ready, invoice issued/paid, payment failed, period ending, wallet topped up, autoscaler disabled, migration completed, backup ready, account locked, incident impacting service.

### Taski

- **M-01**: Schema mailingowa — modele `EmailTemplate` (versioned, kind enum, locale), `EmailLog` (`to`, `kind`, `userId?`, `templateVersion`, `providerMessageId`, `status`, `error?`, `createdAt`), `UserEmailPreferences` (`marketing`, `productUpdates`, `securityAlerts` zawsze `true`).
- **M-02**: `TransactionalMailerService` — fasada nad `MailerService` z renderowaniem template, walidacją preferences, automatycznym `EmailLog`, retry przy chwilowych błędach SMTP, dead-letter dla 5xx.
- **M-03**: Renderer template — Markdown + zmienne (`{{firstName}}`, `{{domain}}`, `{{amount}}`), HTML + plaintext, locale `pl`/`en`. Polskie maile produkcyjne na start, angielskie jako fallback dla `locale=en`.
- **M-04**: Auth e-mails:
  - welcome / weryfikacja adresu po rejestracji (jeśli włączamy verify),
  - password reset link (token 30 min),
  - password changed,
  - 2FA enabled / 2FA disabled / recovery codes regenerated,
  - alert podejrzanego logowania (`SUSPICIOUS_LOGIN_BURST_BY_*` już istnieje, dotychczas tylko do operatora — dodać też do klienta),
  - account locked (po przekroczeniu liczby fail).
- **M-05**: Subscription / hosting e-mails:
  - subscription created (welcome do planu, link do panelu),
  - provisioning ready (login DA, hasło tylko raz, link do hosting managera),
  - period ending (3 dni i 7 dni przed `currentPeriodEnd`),
  - period ended / renewal failed (z linkiem do doładowania portfela albo zmianą metody Stripe),
  - subscription suspended (insufficient funds), subscription unsuspended,
  - subscription cancelled,
  - service migrated (G-7), migration external completed/failed (G-6),
  - backup ready / backup failed.
- **M-06**: Billing e-mails:
  - invoice issued (z hosted invoice URL i PDF),
  - invoice paid,
  - payment failed (3-day grace warning),
  - wallet topped up (Stripe Checkout success),
  - auto-topup charged from card,
  - auto-topup failed (link do zmiany karty),
  - promo code redeemed (potwierdzenie kwoty).
- **M-07**: Autoscaling e-mails:
  - autoscaler disabled (wallet empty + auto-suspend skalowania),
  - monthly autoscaling cost summary (1 dnia miesiąca, jeśli było skalowanie).
- **M-08**: Operational e-mails:
  - incident impacting your service (z `IncidentBanner` + powiązanie z węzłem klienta — wysyłka tylko klientom, których konta są na dotkniętym węźle),
  - planned maintenance (admin może rozpisać i zaplanować wysyłkę).
- **M-09**: Scheduler powiadomień okresowych — cron godzinowy: znajduje subskrypcje z `currentPeriodEnd` w oknie 3d/7d, wysyła „period ending" raz (idempotency po `(subId, kind, periodEnd)`).
- **M-10**: Settings → „Powiadomienia" — klient włącza/wyłącza marketing i product updates (security i transactional zawsze on).
- **M-11**: Admin → „Maile" — lista wysyłek (filtr po userId, kind, status), retry pojedynczego maila, podgląd treści, statystyki bounce/error.
- **M-12**: SPF/DKIM/DMARC — w `DEPLOY.md` runbook konfiguracji rekordów DNS dla domeny nadawczej (np. `noreply@verris.pl`), żeby nie lądować w spamie. Test przez `mail-tester.com`.
- **M-13**: Stopka maili — link do unsubscribe (dla marketingu), link do polityki prywatności, dane administratora danych. Wymagane przez RODO w mailach marketingowych.

### Zależności

- M-13 wymaga zakończonego L-02 (linki do polityki prywatności).
- M-04 i M-10 wymagają L-01 (`UserEmailPreferences` jest częścią schemy compliance).
- M-09 może działać niezależnie, ale powinien być włączony dopiero po przetestowaniu M-05/M-06.

### Kryteria DONE

- Klient po rejestracji dostaje welcome e-mail.
- Każda płatność i każdy event subskrypcji generuje mail (lub jest świadomie wykluczony).
- 3 dni i 7 dni przed końcem okresu klient dostaje przypomnienie.
- Auto-topup failed wysyła mail w czasie krótszym niż 5 minut po porażce.
- Każda wysyłka jest logowana w `EmailLog` z statusem.
- SPF/DKIM/DMARC ustawione, mail nie ląduje w spamie głównych dostawców.
- Klient ma pełną kontrolę nad preferencjami w settings.

## Sprint 3 — BOK może pracować bez impersonacji jako głównego narzędzia

**Cel:** staff dostaje kontekst klienta, usług i zgłoszeń bez konieczności ciągłego wchodzenia na konto klienta.

### Taski

- R-03: dodać linki ticket -> profil klienta, ticket -> impersonacja, kolumnę/filter klienta w skrzynce.
- R-01: stworzyć profil klienta 360° w staff panelu: dane konta, saldo, subskrypcje, węzeł, `daUsername`, ostatnie tickety, aktywne incydenty.
- R-06: udostępnić staffowi read-only listę subskrypcji klienta bez akcji suspend/unsuspend.
- R-02 / E-6 (pełny LIVE): diagnostyka DNS + SSL z poziomu profilu klienta lub usługi.
- S-10: pokazać aktywne incydenty status page dotyczące węzła klienta w profilu staff.
- Dodać podstawowe testy API dla RBAC staff vs admin.

### Kryteria DONE

- Staff identyfikuje usługę i węzeł klienta z ticketu w mniej niż 2 minuty.
- Staff widzi dane read-only, ale nie może wykonać akcji adminowych.
- Diagnostyka DNS/SSL zwraca wynik w UI w czasie poniżej 30 s i zapisuje zdarzenie audytowe przy uruchomieniu testu.

## Sprint 4 — Admin operacyjny i konfiguracja sprzedaży

**Cel:** admin może zarządzać klientami, planami i rozliczeniami bez SQL, curla i Stripe Dashboard jako jedynego źródła operacji.

### Taski

- R-04: admin edytuje konto klienta: blokada, zmiana emaila z ostrożną walidacją, reset hasła, notatka wewnętrzna.
- R-05: UI planów produktowych: ceny, limity LVE, EP/NPROC, status sprzedaży, `stripePriceMonthlyId`, `stripePriceYearlyId`.
- R-10: admin lista faktur: wyszukiwanie po kliencie, statusie, dacie, link hosted/PDF.
- A-10: toggle `canAccessGrafana` w UI użytkownika zamiast ręcznego SQL.
- A-08: maintenance mode węzła: blokada nowych provisioningów i jasna informacja w adminie.
- Rozszerzyć audit log o wszystkie nowe operacje admina.

### Kryteria DONE

- Nowy plan i Stripe Price IDs da się ustawić w panelu admina.
- Admin resetuje konto klienta bez dostępu do bazy.
- Maintenance mode wyklucza węzeł z wyboru podczas zakupu/provisioningu.

## Sprint 5 — Niezawodność provisioningów i operacji tła

**Cel:** operacje wolne lub podatne na timeouty przechodzą do kolejek, a klient widzi prawdziwy status zamiast zawieszonego requestu.

### Taski

- R-11 / B-7: wdrożyć BullMQ dla `provisioning.create-account`.
- Dodać statusy provisioningu widoczne dla klienta: queued, running, retrying, failed, completed.
- Dodać panel admina dla kolejki provisioningowej: lista jobów, błędy, retry, czas trwania.
- Dodać metryki kolejki do `/metrics` i dashboardu Grafana.
- Wprowadzić retry z idempotency dla wybranych błędów DA, bez podwójnego zakładania konta.
- Dodać dead-letter/recovery runbook w `DEPLOY.md`.
- Wykonać testy awarii DA: timeout, błędne credentials, brak pojemności węzła.

### Kryteria DONE

- Zakup nie trzyma HTTP dłużej niż 5 s, jeśli provisioning wymaga pracy w tle.
- Po błędzie DA klient widzi zrozumiały status, a admin ma retry.
- Metryki pokazują liczbę pending/failed jobs.

## Sprint 6 — Security hardening operatorów i ścieżki dostępu

**Cel:** konta staff/admin mają poziom ochrony adekwatny do impersonacji i dostępu do operacji technicznych.

### Taski

- R-08: pełny flow 2FA TOTP w staff panelu i admin panelu, analogiczny do klienta.
- Staff audit: ograniczony podgląd własnych akcji i akcji per klient, bez wrażliwych payloadów.
- Historia logowań operatorów, lockout widoczny administracyjnie i alert przy podejrzanej aktywności.
- Uporządkować sesje impersonacji: jasny powrót do źródłowego panelu, powód wymagany, czas wygaśnięcia widoczny.
- Dodać checklistę bezpieczeństwa przed LIVE: rotacja haseł seedowych, test 2FA, test recovery codes, test KMS dry-run.

### Kryteria DONE

- Staff i admin mogą włączyć 2FA i muszą przejść drugi krok przy logowaniu.
- Każda impersonacja ma powód, aktora, czas startu/końca i widoczny ślad w audycie.
- Brak sekretów DA/KMS/2FA w widokach staff.

## Sprint 7 — Uczciwa i potem automatyczna migracja klientów

**Cel:** najpierw usunąć rozjazd między obietnicą a faktycznym działaniem migracji, potem rozpocząć prawdziwą automatyzację.

### Taski

- R-MIG-0: zmienić copy w panelu klienta na uczciwe: „zlecenie migracji” tam, gdzie system tworzy ticket zamiast realnie przenosić dane.
- R-MIG-1: formularz pakietowy migracji: FTP/SFTP + MySQL + opcjonalnie IMAP + domena docelowa w jednym zgłoszeniu.
- S-05: staff kolejka migracji: status, metadane, auditowany dostęp do sekretów źródłowych, retry/anuluj.
- R-MIG-5: post-check HTTP i mail/ticket po zakończeniu lub błędzie.
- Zaprojektować architekturę workerów na węźle: agent compute-node zamiast ciężkich transferów przez control-plane.
- Rozpocząć R-MIG-2: transfer plików SFTP/rsync do `public_html` jako pierwszy automatyczny krok.

### Kryteria DONE

- UI nie sugeruje pełnej automatyzacji, jeśli jej jeszcze nie ma.
- Staff widzi wszystkie migracje w jednym miejscu i nie musi używać SQL do obsługi sekretów.
- Pierwszy typ migracji plików działa na stagingowym węźle bez obciążania control-plane.

## Sprint 8 — Standard hostingu PL i UX klienta

**Cel:** podnieść panel klienta do poziomu oczekiwanego przez mniej technicznych użytkowników.

### Taski

- U-06: onboarding po pierwszym zakupie: domena, DNS, SSL, backup, poczta.
- U-04: wykres zużycia LVE 24 h / 7 dni z `UsageMetric`.
- U-05: powiadomienia e-mail: faktura, koniec okresu, autoscaler wyłączony, incydent, provisioning failed.
- U-03 / R-15: szybki start WordPress lub integracja Softaculous, jeśli licencja i DA pozwalają.
- R-19: statystyki ruchu AWStats/Webalizer przez DA albo bezpieczny proxy widoku.
- S-03: canned responses z placeholderami w staff panelu.
- S-07: SLA timer na ticketach.

### Kryteria DONE

- Nowy klient wie, co zrobić po zakupie, bez ticketu do BOK.
- Klient widzi zasoby i podstawowe statystyki bez logowania do DA.
- Staff ma szybszą obsługę typowych zgłoszeń dzięki szablonom i SLA timerom.

## Sprint 9 — Płatności PL i beta LIVE

**Cel:** przygotować platformę pod polskich klientów i wejść w ograniczone testy beta przed publicznym LIVE.

### Taski

- R-09 / C-13: PayU/BLIK jako drugi gateway dla doładowań portfela, a później subskrypcji.
- Reconciliacja PayU z ledgerem: idempotency, webhooki, statusy błędów, ręczne dopasowanie w adminie.
- Test matrix billing: Stripe card, Stripe P24, PayU/BLIK, portfel, failed payment, refund/manual credit.
- Testy obciążeniowe na control-plane: login, dashboard, status page, zakup, webhook, kolejka provisioning.
- Ograniczona beta: 3-5 realnych kont testowych, osobny kanał supportu, dzienny przegląd incydentów i metryk.
- Freeze funkcjonalny przed publicznym LIVE i lista tylko krytycznych poprawek.

### Kryteria DONE

- PayU/BLIK poprawnie księguje portfel bez duplikacji transakcji.
- Control-plane mieści się stabilnie na 4 vCPU / 8 GB RAM przy zakładanym ruchu beta.
- Jest decyzja GO/NO-GO po beta i aktualna checklista regresji.

## Sprint 10+ — Dojrzałość produktu i skala

**Cel:** rozwijać przewagi, ale dopiero po potwierdzeniu stabilności i popytu.

### Kandydaci

- R-12: subkonta/IAM klienta.
- R-13: rejestracja i transfer domen przez rejestratora.
- R-17: role granularne w adminie.
- R-18: AI predykcja obciążenia i live chat.
- R-MIG-3/R-MIG-4/R-MIG-7: automatyczny import MySQL, IMAP i pełna globalna kolejka migracji.
- P-02/P-03: webhooks status page i kalendarz maintenance.

## Moduły przewagi konkurencyjnej do zaplanowania

Te pozycje nie są krytycznymi brakami do pierwszej sprzedaży, ale mogą dać panelowi Verris odczucie produktu bardziej dojrzałego niż typowy panel shared hostingu. Wdrażać je po bazowych sprintach stabilizacyjnych albo jako małe dodatki przy okazji prac w danym obszarze.

### Panel klienta

- **V-01 Health Score usługi** — wynik 0-100 dla usługi: DNS, SSL, świeżość backupu, brak incydentów, LVE w normie, wersja PHP, status poczty. Najlepszy moment: po Sprintach 3-5, gdy diagnostyka, status i usage są stabilne.
- **V-02 Asystent konfiguracji domeny** — klient wpisuje domenę, a panel pokazuje obecne rekordy DNS, wymagane rekordy, nameservery, propagację i checklistę SPF/DKIM/DMARC. Najlepszy moment: Sprint 8, razem z onboardingiem.
- **V-03 Backup restore preview** — przed restore panel pokazuje datę, rozmiar, elementy do nadpisania, ryzyko i wymagane potwierdzenie. Najlepszy moment: po dopięciu backupów i snapshotów.
- **V-04 Tryb bezpiecznych zmian** — przed SSL/DNS/restore/migracją panel proponuje snapshot albo backup i pokazuje rollback plan. Najlepszy moment: Sprint 8+.
- **V-05 Rekomendacje planu i autoscalingu** — komunikaty typu „plan wystarcza”, „upgrade będzie tańszy niż autoscaling”, „zbliżasz się do limitów”. Najlepszy moment: po U-04, gdy wykresy LVE są w UI.
- **V-06 Publiczny uptime badge klienta** — widget „Hosted by Verris, uptime 30 dni” do osadzenia na stronie klienta. Najlepszy moment: po stabilizacji status page i SLA.
- **V-07 Centrum domeny bez rejestratora** — DNS, SSL, mail records, SPF/DKIM/DMARC i nameservery w jednym miejscu, nawet zanim Verris będzie sprzedawał domeny. Najlepszy moment: Sprint 8.

### Panel staff

- **V-08 Timeline klienta** — oś zdarzeń: zakup, provisioning, płatności, tickety, incydenty, impersonacje, zmiany DNS/SSL. Najlepszy moment: po R-01, jako rozszerzenie profilu 360.
- **V-09 Sugestie odpowiedzi bez AI** — rules engine na podstawie diagnostyki: np. DNS nie wskazuje na IP Verris, wklej gotową instrukcję. Najlepszy moment: po R-02 i S-03.
- **V-10 Runbooki w tickecie** — checklisty „problem z SSL”, „DNS nie działa”, „strona wolna”, z przyciskami uruchamiającymi testy. Najlepszy moment: Sprint 8+.
- **V-11 Escalation button** — eskalacja do technicznego/admina z automatycznym dołączeniem usługi, węzła, diagnostyki, logów i incydentów. Najlepszy moment: po profilu 360 i diagnostyce.
- **V-12 Customer risk flag** — oznaczenia klientów ryzykownych: failed payments, dużo ticketów, powtarzające się awarie, wysokie zużycie zasobów. Najlepszy moment: po Sprintach 4-6.

### Panel admin

- **V-13 Preflight GO-LIVE dashboard** — interaktywny odpowiednik `GO_NO_GO_PROD.md`: DNS, Stripe, backup, probes, Grafana, node, webhooki, smoke test. Najlepszy moment: Sprint 0 jako mały wewnętrzny moduł.
- **V-14 Capacity planner** — prognoza „ile kont zmieści jeszcze węzeł” na podstawie planów, alokacji i realnego usage. Najlepszy moment: po A-04 i U-04.
- **V-15 Anomaly board** — lista nietypowych zdarzeń: LVE spike, failed webhooks, stale heartbeat, failed provisioning, wzrost ticketów. Najlepszy moment: po metrykach kolejki i status page.
- **V-16 Incident composer** — admin wybiera affected node/probes, a panel przygotowuje komunikat status page, banner klienta i mail do dotkniętych klientów. Najlepszy moment: po status page i powiadomieniach e-mail.
- **V-17 Changelog i komunikaty produktowe** — krótkie ogłoszenia w panelu klienta: nowe funkcje, prace techniczne, promocje. Najlepszy moment: Sprint 8+.
- **V-18 Feature flags per klient/plan** — włączanie nowych modułów wybranym klientom beta albo planom Pro/Business. Najlepszy moment: przed większymi funkcjami P2, np. AI, domeny, pełna migracja.

### Najlepsze szybkie przewagi

Jeśli wybierać tylko kilka po stabilizacji rdzenia LIVE, najwyższy stosunek efektu do kosztu mają: **V-01 Health Score**, **V-02 Asystent domeny**, **V-08 Timeline klienta**, **V-13 Preflight dashboard**, **V-14 Capacity planner** i **V-16 Incident composer**.

## Priorytet dla obecnego serwera 4 vCPU / 8 GB RAM

- Nie uruchamiać ciężkich transferów, skanów AV, AI ani importów baz w procesie API control-plane.
- Redis/BullMQ jest akceptowalny, ale joby ciężkie powinny trafić na compute-node lub osobny worker z limitami.
- Prometheus i Grafana zostają, ale retencję i dashboardy trzymać rozsądnie; cięższe analizy przenieść do zewnętrznego storage, gdy ruch urośnie.
- Backup lokalny musi mieć off-site; sam dysk tego serwera nie jest strategią produkcyjną.
- Przy beta mierzyć RSS kontenerów, CPU steal, I/O wait, czas odpowiedzi API i rozmiar Postgresa po każdym teście.

## Minimalny zakres przed pierwszymi testami beta

1. Sprint 0 w całości.
2. **Sprint 1 (Legal/RODO) w całości** — twardy LIVE blocker. Bez tego nie wolno przyjmować klientów.
3. **Sprint 2 (Maile transakcyjne) co najmniej**: M-01..M-06 (auth, subscription, billing). M-07/M-08 mogą być fast-follow.
4. Sprint 3 (BOK) co najmniej: R-03, R-01, R-02 w pełnym zakresie LIVE (nie wersja okrojona).
5. Sprint 4 (Admin) co najmniej: R-05, R-04 reset/blokada, Stripe Price IDs w UI.
6. Sprint 5 (Niezawodność) co najmniej: async provisioning albo potwierdzony brak timeoutów w testach DA.
7. Sprint 6 (Security) co najmniej: 2FA staff/admin, audyt impersonacji, KMS dry-run.
8. R-MIG-0, jeśli migracje pozostają tylko zgłoszeniem, żeby nie obiecywać automatyzacji.

## Definicja DONE dla każdego sprintu

- `pnpm typecheck` i `pnpm build` przechodzą lokalnie lub w CI.
- Nowe endpointy mają testy RBAC i walidacji DTO.
- Każda operacja staff/admin zapisuje audit log.
- Nowe funkcje mają empty/error/loading states w UI.
- Zaktualizowane są `PROJECT_STATUS.md` i ten plan, jeśli zmienia się zakres albo status.
- Smoke test z `GO_NO_GO_PROD.md` nie regresuje.
