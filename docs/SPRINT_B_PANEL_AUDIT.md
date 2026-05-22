# Sprint B — audyt paneli (100% LIVE)

> Data: 2026-05-21 (aktualizacja staff/admin) · Gałąź: `live-release-readiness`

## Podsumowanie

| Panel | Mocki / stuby w UI | Empty/error states | Akcja Sprint B |
|-------|-------------------|-------------------|----------------|
| **Klient** | Brak literalnych mocków | `PanelFetchError`, `HostingNoServiceState` | ✅ gates + IAM nav |
| **Staff** | Brak | API + banner błędu na każdej liście | ✅ audyt poniżej |
| **Admin** | Brak | Real API + empty + retry provisioning | ✅ audyt poniżej |
| **Status** | Public badge bez PII | operational/degraded | ✅ testy Sprint A |

---

## Panel klienta — ekrany

| Ścieżka | Status | Uwagi |
|---------|--------|-------|
| `/dashboard` | ✅ real | Błędy partial fetch z komunikatem |
| `/dashboard/services` | ✅ real | Plan change, autoscaling, DA |
| `/dashboard/services/new` | ✅ real | Stripe/portfel, provisioning |
| `/dashboard/billing` | ✅ real | Portfel, faktury, promo |
| `/dashboard/domains` | ✅ real | Checklist; rejestrator tylko gdy `configured` |
| `/dashboard/domains/registrar` | ✅ ukryte / fail-closed | Strona informacyjna bez providera |
| `/dashboard/dns`, `ssl`, `email`, `ftp`, `cron`, `databases`, `file-manager`, `backups` | ✅ real | DA + empty/error |
| `/dashboard/migrations` | ✅ real | Worker protocol (API) |
| `/dashboard/support` | ✅ real | Tickety, załączniki |
| `/dashboard/eco` | ✅ real | Domyślnie włączone; `NEXT_PUBLIC_FEATURE_ECO=false` aby ukryć |
| `/dashboard/referral` | ✅ real | Domyślnie włączone; `NEXT_PUBLIC_FEATURE_REFERRAL=false` aby ukryć |
| `/dashboard/iam` | ✅ real | Domyślnie włączone; subkonta bez dostępu; edycja uprawnień |
| `/dashboard/calculator` | ✅ real | Autoscaling pricing |
| `/legal/*` | ✅ real | Wersje z API |

### Zmiany wdrożone (klient + IAM)

1. **`client-features.ts`** — EKO + referral + IAM domyślnie ON (opt-out `=false`).
2. **`client-nav-access.ts`** — menu i portfel wg `customerPermissions`.
3. **API** — guard ścieżek hosting; `/users/me` dla `principalUserId`.
4. **IAM UI** — edycja uprawnień członka.

---

## Panel staff (BOK) — ekrany

| Ścieżka | Status | API / zachowanie |
|---------|--------|------------------|
| `/` (skrzynka) | ✅ real | `staffGetTickets`, sort priorytetów, filtr `userId`, błąd 401→login |
| `/tickets/active` | ✅ real | Lista aktywnych ticketów |
| `/tickets/[id]` | ✅ real | `TicketDetailPanel`: status, priorytet, dept, assignee, odpowiedzi + załączniki, eskalacja, runbook, risk |
| `/crm` | ✅ real | Wyszukiwarka klientów |
| `/crm/[userId]` | ✅ real | Profil 360: subskrypcje, domeny, timeline audytu, DNS/TLS diagnostic, impersonacja (powód wymagany) |
| `/crm/.../subscriptions/[id]` | ✅ real | Plan change staff, szablon ticketu |
| `/referral-enrollments` | ✅ real | Approve/reject enrollment |
| `/knowledge` | ✅ real | Canned responses z API |
| `/settings` | ✅ real | 2FA operatora |

### AI w ticketach

| Element | Status |
|---------|--------|
| Przycisk „Wygeneruj sugestię AI” | ✅ tylko gdy `GET /ai/status` → `configured: true` |
| Brak klucza `AI_API_KEY` | ✅ karta AI **nie renderuje się** (bez martwego przycisku) |
| Runbook / sugestie bez AI | ✅ zawsze widoczne |

**Wniosek:** osobny link w nawigacji do AI nie jest potrzebny — gate runtime w `ticket-detail-panel.tsx` spełnia wymóg Sprint B.

---

## Panel admin — ekrany

| Ścieżka | Status | API / zachowanie |
|---------|--------|------------------|
| `/` | ✅ real | Pulpit operacyjny |
| `/nodes`, `/nodes/init`, `/nodes/[id]` | ✅ real | Flota węzłów, init |
| `/plans`, `/plans/new`, `/plans/[id]` | ✅ real | CRUD planów, Stripe price id |
| `/subscriptions`, `/subscriptions/[id]` | ✅ real | Lista, plan change admin |
| `/provisioning-queue` | ✅ real | BullMQ depth; banner gdy brak `REDIS_URL`; retry z powodem |
| `/product-ops` | ✅ real | GO-LIVE preflight, flags, changelog, maintenance |
| `/status/probes`, `/status/incidents` | ✅ real | Monitory, incydenty |
| `/customers`, `/customers/[userId]` | ✅ real | Profil, impersonacja, portfel, operacje |
| `/tickets` | ✅ real | Lista + link do staff-panel |
| `/invoices`, `/billing` | ✅ real | Faktury, CSV rozliczeń |
| `/promo-codes` | ✅ real | Tworzenie kodów |
| `/referral-enrollments` | ✅ real | Review programu partnerskiego |
| `/operators` | ✅ real | Konta operatorów |
| `/autoscaling` | ✅ real | Cennik + revenue |
| `/compliance` | ✅ real | Żądania usunięcia danych |
| `/audit` | ✅ real | Filtry logów bezpieczeństwa |
| `/settings`, `/settings/platform` | ✅ real | 2FA, konfiguracja platformy |

**Wniosek:** brak mocków operacyjnych; empty states i komunikaty błędów na listach.

---

## Otwarte (niski priorytet)

- [ ] Spójność copy EKO na dashboardzie przy `FEATURE_ECO=false` (już warunkowe w `dashboard-charts.tsx`).
- [ ] IAM pełne R-12 — [`docs/IAM_LIVE_FOLLOWUP.md`](./IAM_LIVE_FOLLOWUP.md).

## Sprint C (w toku)

Zobacz [`docs/SPRINT_C_OPS.md`](./SPRINT_C_OPS.md): backup off-site, alerty Prometheus, checklist prod.
