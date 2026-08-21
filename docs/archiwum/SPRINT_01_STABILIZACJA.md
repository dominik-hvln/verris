> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** plan 19 sprintów w `plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md` wraz z backlogiem XLSX
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Sprint 01 — Stabilizacja i gotowość do dalszych prac

> Ten sprint odpowiada Sprintowi 0 z `SPRINT_PLAN.md`, ale jest rozpisany jako pierwszy praktyczny backlog do wykonania teraz.

## Postęp realizacji (sprint 0)

| Sekcja | Status | Output |
| --- | --- | --- |
| 1. Środowisko (.env.prod, sekrety, DNS) | ⏳ operacyjne — wymaga serwera i kluczy |
| 2. Deploy control-plane | ⏳ operacyjne — wymaga serwera |
| 3. Storage + backup | ⏳ operacyjne — wymaga serwera |
| 4. Pierwszy węzeł hostingowy | ⏳ operacyjne — wymaga compute-node |
| **4b. Audyt Stripe `2026-04-22.dahlia`** | ✅ ZROBIONE | `STRIPE_DAHLIA_COMPATIBILITY.md`; helpery cross-version + naprawione 3 krytyczne bugi w `stripe.client.ts`, `billing.service.ts`, `subscriptions.service.ts`; pin `STRIPE_API_VERSION` env-friendly; runbook upgrade w `DEPLOY.md` |
| **4c. Audyt RODO + drafty** | ✅ ZROBIONE | `docs/legal/drafts/{terms,privacy,cookies,dpa}.md` + README; 4 drafty gotowe do lawyer review; założenia merytoryczne (kredyty 1:1, retencja, subprocessors EU) wypisane |
| **4d. Audyt mailingu** | ✅ ZROBIONE | `docs/mail/AUDIT.md`; pełna lista ~23 template'ów z triggerami w kodzie; rekomendacja Resend EU; plan SPF/DKIM/DMARC; schema bazy (`EmailTemplate`, `EmailLog`, `UserEmailPreferences`) |
| 5. Smoke test end-to-end | ⏳ operacyjne — wymaga deploya |
| 6. Metryki control-plane | 🟡 SZABLON | `PROD_HEALTH_CHECKLIST.md` — checklist do wypełnienia po deploy'u |
| 7. Preflight V-13 | ⏸️ DEFERRED do Sprintu 1 | wartość pojawia się dopiero gdy fetchery widzą realne dane |

**Status Sprintu 0 (kod-side):** zakończony. Pozostałe pozycje są operacyjne (deploy, DNS, klucze, smoke test) — wymagają wykonania na docelowym serwerze przed wystartowaniem Sprintu 1 (Legal/RODO).



## Cel sprintu

Potwierdzić, że aktualny panel działa end-to-end na docelowej architekturze i że dalsze development sprinty nie będą budowane na niezweryfikowanym deployu. Po tym sprincie powinniśmy wiedzieć, czy obecny control-plane 4 vCPU / 8 GB RAM wystarcza do bety oraz które elementy są realnym ryzykiem LIVE.

## Zakres

- Produkcyjny lub stagingowy deploy według `DEPLOY.md`.
- Pierwszy realny węzeł compute z CloudLinux + LiteSpeed + DirectAdmin.
- Smoke test pełnej pętli biznesowej.
- Backup + restore test.
- Monitoring, status page i bazowe metryki serwera.
- Krótki preflight dashboard lub przynajmniej audyt pod przyszły moduł V-13.

## Poza zakresem

- Nowe duże funkcje produktowe.
- PayU/BLIK.
- Automatyczna migracja klientów.
- BullMQ provisioning, chyba że smoke test pokaże timeouty DA.
- Refaktory UI niezwiązane z błędami smoke testu.
- Pełna implementacja RODO i compliance — to robi Sprint 1 (Legal) z `SPRINT_PLAN.md`.
- Pełna implementacja maili transakcyjnych — to robi Sprint 2 (Maile) z `SPRINT_PLAN.md`.

> **Uwaga LIVE blocker**: smoke test pre-LIVE w tym sprincie nie symuluje realnego klienta produkcyjnego. Pierwsi prawdziwi klienci nie mogą trafić na panel zanim Sprint 1 (RODO) i minimalna część Sprintu 2 (welcome, password reset, invoice, payment failed, period ending) nie zostaną wdrożone i przetestowane.

## Taski sprintu

### 1. Przygotowanie środowiska

- Zweryfikować domeny i DNS dla paneli: `panel`, `staff`, `admin`, `api`, `status`, `grafana`.
- Uzupełnić `.env.prod` z `.env.prod.example`.
- Wygenerować i zapisać bezpiecznie:
  - `JWT_SECRET`
  - `APP_KMS_KEY`
  - `POSTGRES_PASSWORD`
  - `STRIPE_WEBHOOK_SECRET`
  - `METRICS_AUTH_TOKEN`
- Ustawić SMTP do ticketów, alertów i maili operacyjnych.
- Zweryfikować `CLIENT_PANEL_URL`, `STAFF_PANEL_URL`, `ADMIN_PANEL_URL`, `PUBLIC_API_URL`, `PUBLIC_STATUS_URL`.

### 2. Deploy control-plane

- Wykonać build i start:
  - `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
- Uruchomić migracje przez `ops/scripts/prod-migrate-deploy.sh`.
- Uruchomić seed admin/staff przez `ops/scripts/prod-seed.sh`.
- Zmienić hasła kont seedowych.
- Sprawdzić:
  - `/healthz`
  - `/readyz`
  - panel klienta
  - panel staff
  - panel admin
  - status page
  - Grafana przez SSO

### 3. Konfiguracja storage i backupu

- Ustawić trwały katalog `TICKET_UPLOAD_DIR`.
- Zamontować volume lub bind mount dla załączników ticketów.
- Uruchomić `ops/backup-postgres.sh` ręcznie.
- Zainstalować cron backupu.
- Skonfigurować off-site backup, np. `rclone` do S3/B2/NFS.
- Wykonać test restore na środowisku testowym lub stagingowym.

### 4. Pierwszy węzeł hostingowy

- Przygotować compute-node: CloudLinux, LVE tools, LiteSpeed, LSPHP, DirectAdmin.
- Uruchomić bootstrap z panelu admina.
- Zaakceptować węzeł w adminie.
- Skonfigurować DirectAdmin credentials i wykonać test połączenia.
- Dodać minimum probes:
  - HTTPS
  - DA_API
  - MYSQL
  - SMTP
  - IMAP
- Potwierdzić heartbeat i telemetry LVE.

### 4b. Audyt Stripe pod API `2026-04-22.dahlia`

Kod (`apps/api/src/billing/stripe/stripe.client.ts:312`) pinuje header `Stripe-Version: 2026-04-22.dahlia` dla każdego requestu. Trzeba zweryfikować spójność całego stacka pod tą wersją:

- Sprawdzić w Stripe Dashboard, że default API version konta jest zgodna lub kompatybilna z `2026-04-22.dahlia`. Jeśli niezgodna — webhooki przyjdą w innej strukturze niż request body.
- Przeczytać release notes Stripe API od poprzedniej wersji do `2026-04-22.dahlia`. Wynotować breaking changes dotyczące: `Subscription`, `Invoice`, `Checkout.Session`, `PaymentIntent`, `SetupIntent`, `Customer`.
- W `StripeClient` zweryfikować każde użyte pole z odpowiedzi pod kątem zmian: enums statusów subskrypcji, struktura `invoice.lines`, `payment_intent.charges`, `subscription.items.data[*].price`, metadata mapping.
- W `BillingService.handleStripeWebhook` zweryfikować obsługę `customer.subscription.created/updated/deleted`, `invoice.created/finalized/paid/payment_succeeded/payment_failed`, `payment_intent.succeeded/payment_failed`, `checkout.session.completed`. Sprawdzić, czy odbierane payloady pasują do dahlia.
- Uruchomić Stripe CLI w trybie `--api-version=2026-04-22.dahlia` i przepuścić syntetyczne eventy: nowy zakup z subskrypcją, nieudany payment, manualne refunds, auto-topup z `WalletAutoTopup`.
- Zweryfikować, że `InvoicesService.upsertFromStripe` nie traci żadnych pól (Hosted Invoice URL, PDF URL, statusy `DRAFT/OPEN/PAID/VOID/UNCOLLECTIBLE`) na dahlia.
- Sprawdzić, że `payment_behavior=default_incomplete` w `startStripeRecurring` zwraca w dahlia oczekiwany kształt: `latest_invoice.payment_intent.client_secret` lub `latest_invoice.confirmation_secret` (Stripe ostatnio zmieniał ten payload — po dahlia może wymagać aktualizacji odczytu).
- Dopisać w `DEPLOY.md` runbook upgrade Stripe API: jak zmieniać tę wersję bezpiecznie (Stripe ma 7 dni okna na rollback default API version).
- Zaktualizować test webhooków (jeśli są) na dahlia format payloadów.

Po smoke teście udokumentować wynik w notatce „Stripe 2026-04-22.dahlia compatibility report" — co działa, co wymaga zmian, kiedy migrować na kolejną wersję.

### 4c. Audyt RODO i compliance (przygotowanie do Sprintu 1)

W Sprincie 01 nie wdrażamy całego RODO, ale wychodzimy z gotowym scope'm i treściami prawnymi, żeby Sprint 1 mógł wystartować bez szukania prawnika w trakcie:

- Sprawdzić, czy mamy zgłoszenie zbioru danych w UODO (Inspektor Ochrony Danych nie jest wymagany dla małej firmy, ale wpis do rejestru czynności przetwarzania — TAK).
- Pozyskać lub przygotować draft regulaminu świadczenia usług hostingowych (lawyer review). Wzory z OVH, home.pl, nazwa.pl jako benchmark; treść własna.
- Pozyskać lub przygotować draft polityki prywatności i polityki cookies (lawyer review).
- Przygotować draft DPA (Umowy powierzenia przetwarzania danych) dla klientów B2B.
- Wynotować dane administratora danych: pełna nazwa firmy, adres, NIP, REGON, e-mail kontaktu DPO/IOD, sposób kontaktu w sprawie RODO.
- Zdecydować retencję: ile czasu trzymać `LoginAttempt`, `AuditLog`, dane usuniętego konta (FV w PL: 5 lat), backupy.
- Zdecydować, czy panel używa cookies analitycznych (Plausible, GA, Hotjar) — jeśli tak, projekt cookie banner z opt-in.
- Wyjście: 4 dokumenty (terms, privacy, cookies, DPA) jako drafty Markdown, gotowe do zaimportowania w `LegalDocument` w Sprincie 1.

### 4d. Audyt mailingu (przygotowanie do Sprintu 2)

- Wybrać dostawcę SMTP transakcyjnego: Resend / Postmark / SendGrid / Amazon SES. Założyć konto sandbox.
- Zarejestrować domenę nadawczą (np. `noreply@verris.pl`, `kontakt@verris.pl`) i dodać rekordy SPF, DKIM, DMARC. Zweryfikować w `mail-tester.com`.
- Spisać listę wszystkich e-maili do wdrożenia w Sprincie 2 (templates M-04..M-08), z konkretnymi triggerami w kodzie (`auth.service.register` → welcome, `subscription.service.create` → subscription created, etc.).
- Przygotować copy maili w PL (drafty Markdown) — tone of voice, struktura, CTA. To prawdziwe godziny pracy product/copy, nie wciskać do Sprintu 2 ad-hoc.
- Sprawdzić, czy `MailerService` (E-3) potrzebuje rozszerzeń (np. attachements, reply-to per kind).

### 5. Smoke test end-to-end

- Zalogować się jako admin, staff i klient.
- Utworzyć lub zarejestrować konto klienta testowego.
- Skonfigurować plan ze Stripe Price ID albo trybem testowym.
- Wykonać zakup usługi:
  - portfel
  - Stripe test, jeśli skonfigurowany
- Potwierdzić provisioning konta w DirectAdmin.
- Wykonać minimum jedną operację z panelu klienta przez DA, np. SSL/DNS/backup.
- Utworzyć ticket z załącznikiem.
- Odpowiedzieć jako staff.
- Sprawdzić impersonację i zakończenie impersonacji.
- Sprawdzić fakturę/link hosted invoice.
- Przetestować suspend/unsuspend.
- Sprawdzić publiczny status page i incydenty po symulowanym failu probe, jeśli bezpieczne.

### 6. Metryki i wydajność control-plane

- Zebrać bazowe zużycie:
  - RAM per kontener
  - CPU idle/load
  - I/O wait
  - rozmiar bazy
  - czas odpowiedzi `/readyz`
  - czas ładowania dashboardów
- Sprawdzić logi kontenerów po smoke teście.
- Zanotować wszystkie warningi, timeouty DA i webhook errors.
- Ustalić progi alarmowe dla beta:
  - API p95
  - stale heartbeat
  - failed provisioning
  - failed Stripe webhook
  - wolne miejsce na dysku

### 7. Preflight V-13 — wersja minimalna

- Na razie nie budować pełnego modułu, ale zebrać listę danych potrzebnych do przyszłego dashboardu:
  - DNS/TLS status
  - Stripe webhook configured
  - backup last successful
  - probes count/health
  - first node active
  - Grafana SSO ok
  - smoke test last run
- Jeśli starczy czasu, dodać prostą stronę admin-only „Preflight” jako readonly checklistę.

## Kolejność wykonania

1. Env + sekrety.
2. Deploy control-plane.
3. Migracje + seed.
4. Monitoring, Grafana, backup.
5. Audyt Stripe `2026-04-22.dahlia` na środowisku z testowymi kluczami.
6. Audyt RODO + drafty dokumentów prawnych (lawyer review w tle).
7. Audyt mailingu + wybór dostawcy SMTP + rekordy DNS nadawczej domeny.
8. Compute-node + DirectAdmin.
9. Smoke test end-to-end.
10. Pomiary wydajności.
11. Lista błędów i decyzja GO/NO-GO do Sprintu 1 (Legal/RODO) i Sprintu 2 (Maile).

## Kryteria DONE

- `GO_NO_GO_PROD.md` nie ma krytycznych punktów NO-GO.
- Wszystkie aplikacje działają po HTTPS.
- Admin, staff i klient mogą się zalogować.
- Co najmniej jedna usługa hostingowa została provisionowana na realnym węźle DA.
- Ticket z załącznikiem działa od klienta do staffa.
- Backup jest wykonany i odtworzony testowo.
- Grafana i status page pokazują dane.
- Znamy bazowe zużycie control-plane po smoke teście.
- Spisany raport zgodności Stripe `2026-04-22.dahlia` z odpowiedzią na: webhooki, subscription flow, invoices, auto-topup.
- Drafty regulaminu, polityki prywatności, polityki cookies i DPA gotowe (po lawyer review lub w trakcie).
- Dostawca SMTP transakcyjnego wybrany, domena nadawcza skonfigurowana z SPF/DKIM/DMARC (test `mail-tester.com` ≥ 9/10).
- Lista templates maili do Sprintu 2 z triggerami w kodzie spisana.
- Wszystkie błędy smoke testu są zapisane jako taski do kolejnego sprintu.

## Ryzyka

- **Timeout DA przy zakupie** — jeśli wystąpi, przyspieszyć BullMQ z obecnego Sprintu 5.
- **Brak off-site backupu** — blokuje realne beta testy z danymi klientów.
- **Za duże zużycie RAM przez Grafanę/Prometheus** — ograniczyć retencję, dashboardy i zasoby kontenerów.
- **Niepełna konfiguracja Stripe webhook** — blokuje test płatności i faktur.
- **Brak prawdziwego węzła DA** — nie da się uznać panelu za gotowy do testów hostingu.
- **Brak gotowych draftów prawnych** — opóźni Sprint 1 (Legal). Lawyer review może trwać 1-2 tygodnie, więc trzeba ruszyć z tym równolegle do prac technicznych w Sprincie 01.
- **Domain reputation maili** — świeża domena nadawcza może lądować w spamie. Trzeba „rozgrzewać" SMTP od początku (welcome maile do siebie, do staffu, monitorować bounce rate).

## Output sprintu

- Uzupełniona checklista `GO_NO_GO_PROD.md` lub osobna notatka z wynikami.
- Lista bugów i tasków do Sprintu 1 (Legal/RODO) i Sprintu 2 (Maile).
- Decyzja, czy aktualny serwer 4 vCPU / 8 GB RAM wystarcza do bety.
- Drafty 4 dokumentów prawnych (terms, privacy, cookies, DPA) gotowe do importu w Sprincie 1.
- Konto u dostawcy SMTP transakcyjnego z poprawnymi rekordami DNS, gotowe do podłączenia w Sprincie 2.
- Zaktualizowany `PROJECT_STATUS.md` i `SPRINT_PLAN.md`, jeśli smoke test zmieni priorytety.
