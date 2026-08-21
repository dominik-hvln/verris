# Stripe `2026-04-22.dahlia` — raport zgodności

> Dokument powstał w ramach Sprintu 0 (sekcja 4b z `SPRINT_01_STABILIZACJA.md`). Pinujemy `Stripe-Version: 2026-04-22.dahlia` we wszystkich requestach (`apps/api/src/billing/stripe/stripe.client.ts`), więc identycznie webhooki przychodzą w schemacie dahlia. Dahlia jest aktualizacją monthly z linii Dahlia, której **majorem** jest Basil (`2025-03-31.basil`), więc to Basil wprowadził breaking changes które dotykają nas — dahlia tylko je dziedziczy.

## TL;DR

- Pin `2026-04-22.dahlia` powodował 3 krytyczne bugi w naszym kodzie ze schematu `Subscription` i `Invoice` z Basil (2025-03-31). Każdy pojedynczy bug **w pełni blokował kluczową ścieżkę** (sync subskrypcji, mapowanie faktur, pierwsza płatność).
- Wszystkie 3 zostały **naprawione w workspace** w sposób cross-version (helpers z fallbackiem do pre-Basil), więc test integracyjny może wciąż chodzić na koncie pinowanym do Acacia podczas okna upgrade.
- Pozostałe pola których używamy (`hosted_invoice_url`, `invoice_pdf`, `status_transitions.paid_at`, `customer`, `total`, `amount_paid`, `amount_due`, `metadata`, `currency`, `created`, `due_date`, `status`) **NIE** zostały zmienione w Basil ani Dahlia — pozostają stabilne.
- Smoke test syntetyczny (Stripe CLI) wymaga konta z domyślną wersją Acacia/Basil i webhook explicite na `2026-04-22.dahlia`. Plan testowy jest poniżej w sekcji „Smoke test”.

---

## Co i gdzie zostało naprawione

### 1. `Subscription.current_period_start/end` → `subscription.items.data[].current_period_*`

**Breaking change:** [Adds subscription item-level billing periods](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end) (Basil, 2025-03-31).

Pole `current_period_start/end` zostało **usunięte z roota `Subscription`** i dodane do każdego elementu `items.data[i]`. Dla naszych single-item subskrypcji (jeden plan = jeden price) `items.data[0].current_period_*` jest prawidłowym źródłem.

**Co używaliśmy źle:**

- `apps/api/src/billing/billing.service.ts:399-411` — `handleSubscriptionUpsert` odrzucał każdy webhook jako "malformed" (sprawdzał `typeof stripeSub.current_period_start !== 'number'`).
- `apps/api/src/subscriptions/subscriptions.service.ts:800-801` — `startStripeRecurring` pisał `new Date(undefined * 1000)` = `Invalid Date` do bazy.
- `apps/api/src/subscriptions/subscriptions.service.ts:894-911` — `syncFromStripeSubscriptionEvent` brało parametry z BillingService, ale BillingService nie miał skąd ich wziąć po Basilu.

**Fix:**

- Nowy helper `getSubscriptionPeriod(sub)` w `stripe.client.ts` (linie ~140) — czyta `items.data[0]` z fallbackiem do legacy root pól.
- Typ `StripeSubscription` ma teraz `items.data[].current_period_*` jako wymagane, root pola są opcjonalne `@deprecated`.
- `BillingService.handleSubscriptionUpsert` woła helper, łapie wyjątek przy malformed payload i loguje warn.
- `SubscriptionsService.startStripeRecurring` woła helper przed zapisem do bazy.

### 2. `Invoice.subscription` → `invoice.parent.subscription_details.subscription`

**Breaking change:** [Invoicing resources now specify how they were generated](https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects) (Basil, 2025-03-31).

Stripe wprowadził unifikację dla wielu typów upstream'u (subscription, quote, invoice item) w obiekcie `parent`. Pole `invoice.subscription` **zniknęło**.

**Co używaliśmy źle:**

- `apps/api/src/billing/billing.service.ts:439, 515` — `handleInvoicePaid` i `handleInvoicePaymentFailed` zawsze kwitowały `subscriptionId = null` na dahlia, więc nigdy nie aktywowały subskrypcji po opłacie i nigdy nie zawieszały po fail'u.

**Fix:**

- Nowy helper `getInvoiceSubscriptionId(invoice)` w `stripe.client.ts` — czyta `invoice.parent.subscription_details.subscription` (po sprawdzeniu `parent.type === 'subscription_details'`), z fallbackiem do legacy `invoice.subscription`.
- Typ `StripeInvoice` ma teraz `parent: { type, subscription_details } | null` jako pole pierwszorzędne, `subscription?` zostaje jako `@deprecated`.
- Oba handler'y w `BillingService` używają helper'a.

### 3. `Invoice.payment_intent.client_secret` → `invoice.confirmation_secret.client_secret`

**Breaking change:** [Adds support for multiple (partial) payments on invoices](https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices) (Basil, 2025-03-31).

Stripe pozwolił wielu płatnościom na jedną fakturę i w związku z tym usunął jedno-do-jednego pole `invoice.payment_intent`. Klient płacący przez Payment Element **musi teraz** użyć `invoice.confirmation_secret.client_secret` (musi być expandowane).

**Co używaliśmy źle:**

- `apps/api/src/subscriptions/subscriptions.service.ts:810-813` — `startStripeRecurring` brało `latest_invoice.payment_intent.client_secret`. Pod dahlia to pole **nie istnieje**, więc klient nigdy nie dostawał `paymentIntentClientSecret` — pierwsza płatność za subskrypcję była niemożliwa.

**Fix:**

- Nowy helper `getInvoiceClientSecret(invoice)` w `stripe.client.ts` — czyta w kolejności: `invoice.confirmation_secret`, `invoice.payments.data[0].payment.payment_intent.client_secret`, legacy `invoice.payment_intent.client_secret`.
- Typ `StripeInvoice` ma teraz `confirmation_secret?: { client_secret, type } | null`.
- `StripeClient.createSubscription` i `retrieveSubscription` mają teraz `expand[]=latest_invoice.confirmation_secret` PLUS legacy `expand[]=latest_invoice.payment_intent` (cross-compat).
- `SubscriptionsService.startStripeRecurring` woła helper.

---

## Pozostałe breaking changes z Basil/Dahlia — sprawdzone, neutralne dla nas

| Change | Czy nas dotyczy? | Dlaczego nie |
| --- | --- | --- |
| `payment_intent.charges` removed (2022-11-15) | Nie | Nigdy nie czytamy `charges` na PI. Używamy `pi.id`, `pi.metadata`, `pi.amount_received`, `pi.last_payment_error`. |
| `Invoice.charge`, `paid`, `paid_out_of_band` removed (Basil) | Nie | Nigdy nie używaliśmy `charge` (mamy własny ledger). `paid`/`paid_out_of_band` zastąpione przez `status === 'paid'`. |
| `PaymentIntent.invoice`, `Charge.invoice` removed (Basil) | Nie | Nasza droga jest invoice → PI, nie odwrotnie. |
| `Credit Note.refund` → `refunds[]` (Basil) | Nie | Nie używamy Credit Notes. |
| Invoice line items: `pricing` zamiast `price` (Basil) | Nie | Czytamy `total` z faktury, nie line items. |
| Invoice tax modeling (Basil) | Nie | Nie korzystamy ze Stripe Tax — VAT liczymy lokalnie. |
| Subscription `prorate` deprecated (2020) | Nie | Nigdy nie pasowaliśmy tego parametru. |
| Checkout Session UI mode enum changes (2026-03-25.dahlia, breaking) | Nie | Używamy `mode=payment` (top-up), nie subscription mode w Checkout Session. |
| Checkout shipping_details removed (Basil) | Nie | Nie ma shippingu (cyfrowy hosting). |
| Adds Pix recurring (Dahlia) | Nie | PL not relevant. |
| Adds Sunbit BNPL (Dahlia) | Nie | US only. |
| Adds Blik recurring in Stripe Billing (Dahlia, non-breaking) | Potencjalnie tak | **Future work** — wtedy gdy dodamy P24/Blik dla subskrypcji rekurencyjnych. Obecnie Blik tylko one-shot przez P24 w Checkout Session top-up. |
| Setup Attempt PM details `moto` (Dahlia) | Nie | MOTO nie używamy. |
| Managed Payments (Dahlia, non-breaking) | Nie | Stripe MoR nie jest dla nas, mamy własne faktury PL. |

---

## Diff czytanego pola — pre-Basil vs Basil/Dahlia

| Field (kod) | Pre-Basil (`2025-02-24.acacia` i wcześniejsze) | Basil/Dahlia (`2025-03-31.basil` i nowsze) |
| --- | --- | --- |
| Subscription period | `subscription.current_period_start/end` | `subscription.items.data[0].current_period_start/end` |
| Invoice → subscription link | `invoice.subscription` (string) | `invoice.parent.subscription_details.subscription` (po `parent.type === 'subscription_details'`) |
| First-payment client secret | `invoice.payment_intent.client_secret` | `invoice.confirmation_secret.client_secret` (musi być expanded) |
| Hosted invoice URL | `invoice.hosted_invoice_url` | bez zmian |
| Status transitions (paid_at) | `invoice.status_transitions.paid_at` | bez zmian |
| Invoice → user mapping | `invoice.metadata.verrisUserId` (nasze) | bez zmian |
| Invoice currency / total | `invoice.currency`, `invoice.total` | bez zmian |
| Subscription items prices | `subscription.items.data[].price.id` | bez zmian |

---

## Smoke test plan (manualny, na koncie testowym)

> Wymaga: konta Stripe z włączonym test mode, Stripe CLI ≥ 1.20, ngrok lub publiczny `verris.pl` z trafficiem do `/billing/stripe/webhook`.

### Setup

```bash
stripe login
stripe listen \
  --api-version 2026-04-22.dahlia \
  --forward-to https://api.verris.pl/billing/stripe/webhook
```

### Scenariusze do przejścia (wszystkie powinny być GREEN)

1. **Wallet top-up (Checkout Session, mode=payment)**

   ```bash
   stripe trigger checkout.session.completed \
     --api-version 2026-04-22.dahlia
   ```

   - Sprawdzić `WalletTransaction` z `type=TOPUP`, `paymentProvider='STRIPE'`.
   - Sprawdzić audit log `WALLET_TOPUP_COMPLETED`.

2. **Pierwsza płatność za subskrypcję (Payment Element, default_incomplete)**

   - Z panelu klienta wywołać `POST /subscriptions/start-stripe-recurring` (lub równoważne route).
   - Endpoint MUSI zwrócić `paymentIntentClientSecret` ≠ `undefined`. Bez tego klient nie zapłaci.
   - Klient finalizuje płatność (Stripe Element). Webhook `invoice.paid` MUSI zaktywować subskrypcję (sprawdzić `Subscription.status = ACTIVE`).

3. **Sync webhooków subskrypcji**

   ```bash
   stripe trigger customer.subscription.updated \
     --api-version 2026-04-22.dahlia
   ```

   - Webhook **NIE** może być odrzucany jako malformed.
   - `Subscription.currentPeriodStart/End` w naszej bazie MUSI być uzupełnione.

4. **Renewal — kolejna faktura**

   ```bash
   stripe trigger invoice.payment_succeeded \
     --api-version 2026-04-22.dahlia
   ```

   - Webhook MUSI zmapować fakturę na lokalną subskrypcję.
   - Audit log `INVOICE_PAID` z poprawnym `stripeSubscriptionId`.

5. **Failed payment (suspend grace period)**

   ```bash
   stripe trigger invoice.payment_failed \
     --api-version 2026-04-22.dahlia
   ```

   - Webhook **NIE** może wypisać "without subscription on invoice= — ignoring" (to było objawem braku `getInvoiceSubscriptionId`).
   - Subskrypcja MUSI dostać `pendingSuspendReason='PAYMENT_FAILED'`.

6. **Auto-topup off-session PI**

   ```bash
   stripe trigger payment_intent.succeeded \
     --api-version 2026-04-22.dahlia \
     --add payment_intent:metadata[verris_kind]=wallet_auto_topup \
     --add payment_intent:metadata[verris_user_id]=<test-user-id>
   ```

   - `WalletTransaction TOPUP` z `paymentProvider='STRIPE'`, `metadata.channel='wallet_auto_topup'`.

7. **Cancel subscription at period end**

   - W panelu klienta zaznaczyć cancel.
   - `customer.subscription.updated` (z `cancel_at_period_end: true`) MUSI ustawić `Subscription.cancelAt`.

### Acceptance po smoke teście

- Wszystkie 7 scenariuszy GREEN.
- Brak błędów w log'ach API typu „malformed payload", „cannot read billing period", „cannot map invoice".
- W Stripe Dashboard → Workbench → Webhooks: 100% deliveries success na endpoincie `/billing/stripe/webhook`.

---

## Kompatybilność wsteczna (transitional)

Nasze helpery (`getSubscriptionPeriod`, `getInvoiceSubscriptionId`, `getInvoiceClientSecret`) najpierw czytają Basil+ pola, a potem fallbackują do legacy. Dlatego:

- **Konto pinowane na `2025-02-24.acacia`** — kod nadal działa (helpers używają legacy fallback).
- **Konto pinowane na `2026-04-22.dahlia`** — kod używa `parent`, `confirmation_secret`, `items.data[0].current_period_*`.
- **Webhook endpoint w Stripe Dashboard pinowany na inny version niż request header** — nie róbcie tego, miksowanie generuje kwiatki. Endpoint **MUSI** być na `2026-04-22.dahlia` (lub upgrade'owany razem z naszym pinem).

---

## Rekomendowany follow-up

1. **Pin `Stripe-Version` w env, nie w kodzie** (małe TODO):

   - Przenieść `'2026-04-22.dahlia'` z `stripe.client.ts:312` do `STRIPE_API_VERSION` env, default `2026-04-22.dahlia`.
   - Dzięki temu rollback przy regresji to zmiana ENV + restart, zamiast revert kodu.

2. **Test webhook signature replay** — udokumentować w runbook'u procedurę replay'u eventu webhooka po fix'ie kodu. Stripe CLI: `stripe events resend <event_id>`.

3. **Single-item subscription assumption** — `getSubscriptionPeriod` zakłada `items.data[0]` jako reprezentatywny. Gdy będziemy chcieli dodać addony (np. dodatkowy storage pack), trzeba zmienić logikę na sumę okresów (lub osobne aktywacje per item). Obecnie one-plan-per-subscription ✓.

4. **Migracja test webhooks** — jeśli mamy gdzieś E2E testy mockujące Stripe payloady, sprawdzić czy nie trzymają pre-Basil shape. Obecnie nie ma takich testów (`apps/api/test/` skupia się na auth + RBAC).

5. **Dodać raport `Workbench → API versions` jako monthly check** — Stripe co miesiąc release'uje dahlia minor (np. 2026-05-XX.dahlia), żeby wiedzieć czy ktoś popłatał coś nieumyślnie. Dopisane do `DEPLOY.md` runbook'u.

---

## Status

- [x] Audyt kodu i identyfikacja breaking changes
- [x] Code-fix dla 3 krytycznych regresji
- [x] Helpers cross-version
- [x] Typecheck zielony
- [x] Lint zielony (na zmodyfikowanych plikach)
- [ ] Smoke test na koncie testowym Stripe (wymaga klucza testowego — operacyjne)
- [ ] Pin `Stripe-Version` przeniesione do env (follow-up, nie blocker)
- [ ] Runbook upgrade Stripe API w `DEPLOY.md`

Last updated: Sprint 0, May 2026.
