import { Logger } from '@nestjs/common';

const STRIPE_API = 'https://api.stripe.com/v1';

export interface StripeCheckoutSessionInput {
  amountMinor: number; // smallest currency unit (groszy)
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId?: string;
  metadata?: Record<string, string>;
  description?: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  payment_status: string;
  amount_total: number;
  currency: string;
  client_reference_id: string | null;
  customer_email: string | null;
  metadata: Record<string, string> | null;
  payment_intent: string | null;
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  invoice_settings: {
    default_payment_method: string | null;
  } | null;
  metadata: Record<string, string> | null;
}

/**
 * Sprint 4 / R-05 — minimalny shape `Price` z `GET /v1/prices/{id}`.
 * Walidujemy: aktywność, walutę, kwotę, interval recurring i tryb produktu.
 */
export interface StripePrice {
  id: string;
  object: 'price';
  active: boolean;
  currency: string;
  unit_amount: number | null;
  unit_amount_decimal: string | null;
  type: 'one_time' | 'recurring';
  recurring: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
    usage_type: 'licensed' | 'metered';
  } | null;
  product: string;
  livemode: boolean;
  metadata: Record<string, string> | null;
}

/**
 * Invoice shape under API `2025-03-31.basil` and later (including
 * `2026-04-22.dahlia`).
 *
 * Breaking changes vs pre-Basil that we mirror here:
 *  - `subscription`, `quote`, `subscription_details`, `subscription_proration_date`,
 *    `payment_intent`, `charge`, `paid`, `paid_out_of_band`,
 *    `application_fee_amount`, `transfer_data` — all REMOVED from root.
 *  - `parent` field added: contains `{ type: 'subscription_details', subscription_details: { subscription, ... } }`
 *    when invoice came from a subscription, `quote_details` for quotes, etc.
 *  - `confirmation_secret` field added (must be expanded): replaces
 *    `latest_invoice.payment_intent.client_secret` for Payment Element flows.
 *  - `payments` array added (must be expanded): list of `InvoicePayment`
 *    objects connecting the invoice to one or more PaymentIntents/Charges.
 *
 * We keep optional pre-Basil fields (`subscription?`, `payment_intent?`) as
 * deprecated for backward-compat in case smoke tests are run against an older
 * test account during the dahlia rollout — readers must call the helpers
 * (`getInvoiceSubscriptionId`, `getInvoiceClientSecret`) instead of touching
 * these directly.
 */
export interface StripeInvoice {
  id: string;
  number: string | null;
  status: string;
  customer: string | null;
  amount_due: number;
  amount_paid: number;
  total: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created: number;
  due_date: number | null;
  status_transitions?: { paid_at: number | null; finalized_at: number | null } | null;
  metadata: Record<string, string> | null;

  /**
   * Basil+: explicit upstream resource that produced this invoice. We only
   * read `subscription_details.subscription` today; ignore `quote_details`,
   * `self_serve_subscription_details`, etc.
   */
  parent?:
    | {
        type: 'subscription_details';
        subscription_details: { subscription: string | null } | null;
      }
    | {
        type: string;
        subscription_details?: { subscription: string | null } | null;
      }
    | null;

  /**
   * Basil+: replaces the old `latest_invoice.payment_intent.client_secret`
   * convention for Payment Element subscription flows. Only present when
   * the invoice was retrieved with `expand[]=confirmation_secret`.
   */
  confirmation_secret?: { client_secret: string; type: string } | null;

  /**
   * Basil+: list of payment connections (PaymentIntent / out-of-band) that
   * settled or attempted this invoice. Only present when expanded.
   */
  payments?: {
    data: Array<{
      id: string;
      status: string;
      payment: {
        type: string;
        payment_intent?: string | { id: string; client_secret: string | null; status: string } | null;
      };
    }>;
  } | null;

  /**
   * Stripe Smart Retries: when present, the next automatic payment attempt
   * (Unix seconds). null after retries are exhausted. Used by the
   * "subscription-payment-failed" email to tell the customer when to expect
   * the retry.
   */
  next_payment_attempt?: number | null;

  /**
   * Last finalization error (e.g. tax calculation issue). Pre-Basil this was
   * `last_finalization_error.message`; we read the message field directly.
   */
  last_finalization_error?: { code?: string | null; message?: string | null } | null;

  /**
   * Last payment error from Stripe (card declined, insufficient funds, etc.).
   * Comes via the latest `PaymentIntent` on the invoice. We surface the
   * `message` directly to the user — Stripe localizes it for us.
   */
  last_payment_error?: { code?: string | null; message?: string | null } | null;

  /**
   * Pre-Basil legacy fallback. Will not be present under dahlia, but kept
   * optional so we can read it in tests against older test accounts.
   * @deprecated use {@link getInvoiceSubscriptionId}.
   */
  subscription?: string | null;

  /**
   * Pre-Basil legacy fallback. @deprecated use {@link getInvoiceClientSecret}.
   */
  payment_intent?: string | { id: string; client_secret: string | null; status: string } | null;
}

/**
 * Subscription shape under API `2025-03-31.basil` and later (including
 * `2026-04-22.dahlia`).
 *
 * Breaking change vs pre-Basil:
 *  - Root `current_period_start` / `current_period_end` REMOVED.
 *  - Same fields ADDED to each `items.data[i]` (subscription items).
 *
 * `items.data[0]` is always present for active subscriptions because at
 * least one price/item is required to create one. Multi-item subscriptions
 * (mixed prices) all share the same period in our usage today, but the
 * helper still picks `items.data[0]` to be explicit.
 */
export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  metadata: Record<string, string> | null;
  latest_invoice: string | StripeInvoice | null;

  items: {
    data: Array<{
      id: string;
      price: { id: string };
      /** Basil+: per-item billing period. */
      current_period_start: number;
      current_period_end: number;
    }>;
  };

  /**
   * Pre-Basil legacy fallback. Will not be present under dahlia.
   * @deprecated use {@link getSubscriptionPeriod}.
   */
  current_period_start?: number;
  /** @deprecated use {@link getSubscriptionPeriod}. */
  current_period_end?: number;
}

// ---------------------------------------------------------------------------
// Helpers — read fields with version-aware fallbacks
// ---------------------------------------------------------------------------

/**
 * Returns `{ start, end }` for a Basil+ subscription. Falls back to root
 * `current_period_*` if present (pre-Basil test accounts) so smoke tests don't
 * fail during a transitional window.
 *
 * Throws if neither is present — callers can catch and skip the webhook.
 */
export function getSubscriptionPeriod(sub: StripeSubscription): { start: number; end: number } {
  const item = sub.items?.data?.[0];
  if (item && typeof item.current_period_start === 'number' && typeof item.current_period_end === 'number') {
    return { start: item.current_period_start, end: item.current_period_end };
  }
  if (typeof sub.current_period_start === 'number' && typeof sub.current_period_end === 'number') {
    return { start: sub.current_period_start, end: sub.current_period_end };
  }
  throw new Error(
    `Cannot read billing period from subscription ${sub.id} — neither items.data[0].current_period_* nor root current_period_* present. Make sure items.data is included in webhook payload (Basil+) or use Stripe-Version <= 2025-02-24.acacia.`,
  );
}

/**
 * Returns the Stripe Subscription id linked to an invoice, or `null` if the
 * invoice was not generated by a subscription (e.g. one-off invoice).
 *
 * Basil+: read from `invoice.parent.subscription_details.subscription`.
 * Pre-Basil: fall back to `invoice.subscription`.
 */
export function getInvoiceSubscriptionId(invoice: StripeInvoice): string | null {
  const parent = invoice.parent;
  if (parent && parent.type === 'subscription_details' && parent.subscription_details) {
    return parent.subscription_details.subscription ?? null;
  }
  if (parent && parent.subscription_details) {
    return parent.subscription_details.subscription ?? null;
  }
  if (typeof invoice.subscription === 'string') return invoice.subscription;
  return null;
}

/**
 * Returns the `client_secret` the customer needs to confirm the first payment
 * of a Payment Element subscription flow.
 *
 * Basil+: prefer `invoice.confirmation_secret.client_secret`, falling back to
 * `invoice.payments.data[0].payment.payment_intent.client_secret` (when only
 * `payments` is expanded). Pre-Basil: read `invoice.payment_intent.client_secret`.
 */
export function getInvoiceClientSecret(invoice: StripeInvoice): string | null {
  if (invoice.confirmation_secret?.client_secret) {
    return invoice.confirmation_secret.client_secret;
  }
  const firstPayment = invoice.payments?.data?.[0];
  if (firstPayment && firstPayment.payment.payment_intent && typeof firstPayment.payment.payment_intent !== 'string') {
    return firstPayment.payment.payment_intent.client_secret ?? null;
  }
  if (invoice.payment_intent && typeof invoice.payment_intent !== 'string') {
    return invoice.payment_intent.client_secret ?? null;
  }
  return null;
}

/**
 * Default Stripe API version. Pin lives here, not in `request()`, so the
 * runbook upgrade procedure (`DEPLOY.md` → "Stripe API upgrade") is a
 * single-file change. The constructor accepts an override so tests and
 * env-driven rollbacks can pin without code changes.
 *
 * Major version family: Dahlia (April 2026). Monthly minors of Dahlia are
 * backward-compatible; breaking changes only happen at the next major.
 */
export const DEFAULT_STRIPE_API_VERSION = '2026-04-22.dahlia';

/**
 * Tiny Stripe HTTP client over global fetch — avoids pulling in the official
 * SDK (and its transitive deps) for the few endpoints we currently need.
 *
 * All requests use HTTPS Basic auth with the secret key as the username (per
 * Stripe's documented form-encoded REST API).
 */
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name);

  constructor(
    private readonly secretKey: string,
    private readonly apiVersion: string = DEFAULT_STRIPE_API_VERSION,
  ) {}

  // ---------------------------------------------------------------------------
  // Checkout (one-shot top-ups)
  // ---------------------------------------------------------------------------

  async createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('payment_method_types[0]', 'card');
    body.set('payment_method_types[1]', 'p24'); // Polski Przelew24/BLIK fallback dla PL kart
    body.set('customer_email', input.customerEmail);
    body.set('success_url', input.successUrl);
    body.set('cancel_url', input.cancelUrl);
    if (input.clientReferenceId) body.set('client_reference_id', input.clientReferenceId);

    body.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
    body.set(
      'line_items[0][price_data][product_data][name]',
      input.description ?? 'Doładowanie portfela Verris',
    );
    body.set('line_items[0][price_data][unit_amount]', String(input.amountMinor));
    body.set('line_items[0][quantity]', '1');

    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        body.set(`metadata[${key}]`, value);
      }
    }

    return this.request<StripeCheckoutSession>('POST', '/checkout/sessions', body);
  }

  async retrieveCheckoutSession(id: string): Promise<StripeCheckoutSession> {
    return this.request<StripeCheckoutSession>('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
  }

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------

  async createCustomer(input: {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<StripeCustomer> {
    const body = new URLSearchParams();
    body.set('email', input.email);
    if (input.name) body.set('name', input.name);
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }
    return this.request<StripeCustomer>('POST', '/customers', body);
  }

  async getCustomer(customerId: string): Promise<StripeCustomer> {
    return this.request<StripeCustomer>('GET', `/customers/${encodeURIComponent(customerId)}`);
  }

  async updateCustomer(
    customerId: string,
    input: { email?: string },
  ): Promise<StripeCustomer> {
    const body = new URLSearchParams();
    if (input.email !== undefined) body.set('email', input.email);
    return this.request<StripeCustomer>(
      'POST',
      `/customers/${encodeURIComponent(customerId)}`,
      body,
    );
  }

  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<StripeCustomer> {
    const body = new URLSearchParams();
    body.set('invoice_settings[default_payment_method]', paymentMethodId);
    return this.request<StripeCustomer>(
      'POST',
      `/customers/${encodeURIComponent(customerId)}`,
      body,
    );
  }

  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string,
  ): Promise<{ id: string; customer: string | null }> {
    const body = new URLSearchParams();
    body.set('customer', customerId);
    return this.request<{ id: string; customer: string | null }>(
      'POST',
      `/payment_methods/${encodeURIComponent(paymentMethodId)}/attach`,
      body,
    );
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Creates a Stripe Subscription with `payment_behavior=default_incomplete`
   * so the first invoice waits for client-side confirmation. The caller
   * receives `latest_invoice.payment_intent.client_secret` (or
   * `latest_invoice.hosted_invoice_url`) and can hand the customer off to
   * Stripe to finish payment.
   */
  async createSubscription(input: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
    trialPeriodDays?: number;
  }): Promise<StripeSubscription> {
    const body = new URLSearchParams();
    body.set('customer', input.customerId);
    body.set('items[0][price]', input.priceId);
    body.set('payment_behavior', 'default_incomplete');
    body.set('payment_settings[save_default_payment_method]', 'on_subscription');
    // Basil+ (`2025-03-31.basil` / `2026-04-22.dahlia`): the old
    // `latest_invoice.payment_intent.client_secret` chain was removed when
    // Stripe introduced multi-payment invoices. The replacement is the new
    // `confirmation_secret` on the invoice. We expand both so the caller
    // can fall back to the legacy chain on test accounts still pinned to
    // pre-Basil API version.
    body.set('expand[0]', 'latest_invoice.confirmation_secret');
    body.set('expand[1]', 'latest_invoice.payment_intent');
    if (input.trialPeriodDays && input.trialPeriodDays > 0) {
      body.set('trial_period_days', String(input.trialPeriodDays));
    }
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }
    return this.request<StripeSubscription>('POST', '/subscriptions', body);
  }

  async cancelSubscription(
    subscriptionId: string,
    opts: { atPeriodEnd?: boolean } = {},
  ): Promise<StripeSubscription> {
    if (opts.atPeriodEnd) {
      const body = new URLSearchParams();
      body.set('cancel_at_period_end', 'true');
      return this.request<StripeSubscription>(
        'POST',
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        body,
      );
    }
    return this.request<StripeSubscription>(
      'DELETE',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.request<StripeSubscription>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice.confirmation_secret&expand[]=latest_invoice.payment_intent`,
    );
  }

  /**
   * Swaps the subscription's primary price and creates Stripe prorations for the
   * unused portion of the current period (PC-1 / plan change).
   */
  async updateSubscriptionPrice(input: {
    subscriptionId: string;
    subscriptionItemId: string;
    newPriceId: string;
    prorationBehavior?: 'create_prorations' | 'none';
  }): Promise<StripeSubscription> {
    const body = new URLSearchParams();
    body.set('items[0][id]', input.subscriptionItemId);
    body.set('items[0][price]', input.newPriceId);
    body.set('proration_behavior', input.prorationBehavior ?? 'create_prorations');
    return this.request<StripeSubscription>(
      'POST',
      `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
      body,
    );
  }

  // ---------------------------------------------------------------------------
  // Prices (Sprint 4 / R-05 — admin walidacja Stripe Price IDs przy edycji planów)
  // ---------------------------------------------------------------------------

  async retrievePrice(priceId: string): Promise<StripePrice> {
    return this.request<StripePrice>(
      'GET',
      `/prices/${encodeURIComponent(priceId)}`,
    );
  }

  async createProduct(input: {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<{ id: string; name: string }> {
    const body = new URLSearchParams();
    body.set('name', input.name);
    if (input.description) body.set('description', input.description);
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }
    return this.request<{ id: string; name: string }>('POST', '/products', body);
  }

  async updateProduct(
    productId: string,
    input: { name?: string; description?: string; metadata?: Record<string, string> },
  ): Promise<{ id: string }> {
    const body = new URLSearchParams();
    if (input.name !== undefined) body.set('name', input.name);
    if (input.description !== undefined) body.set('description', input.description);
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }
    return this.request<{ id: string }>(
      'POST',
      `/products/${encodeURIComponent(productId)}`,
      body,
    );
  }

  async createRecurringPrice(input: {
    productId: string;
    unitAmountMinor: number;
    currency: string;
    interval: 'month' | 'year';
    nickname?: string;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<StripePrice> {
    const body = new URLSearchParams();
    body.set('product', input.productId);
    body.set('currency', input.currency.toLowerCase());
    body.set('unit_amount', String(input.unitAmountMinor));
    body.set('recurring[interval]', input.interval);
    body.set('recurring[interval_count]', '1');
    if (input.nickname) body.set('nickname', input.nickname);
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }
    return this.request<StripePrice>('POST', '/prices', body, {
      idempotencyKey: input.idempotencyKey,
    });
  }

  async deactivatePrice(priceId: string): Promise<StripePrice> {
    const body = new URLSearchParams();
    body.set('active', 'false');
    return this.request<StripePrice>(
      'POST',
      `/prices/${encodeURIComponent(priceId)}`,
      body,
    );
  }

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  async listInvoices(opts: {
    customerId?: string;
    subscriptionId?: string;
    limit?: number;
  }): Promise<{ data: StripeInvoice[]; has_more: boolean }> {
    const qs = new URLSearchParams();
    if (opts.customerId) qs.set('customer', opts.customerId);
    if (opts.subscriptionId) qs.set('subscription', opts.subscriptionId);
    qs.set('limit', String(Math.min(opts.limit ?? 25, 100)));
    return this.request<{ data: StripeInvoice[]; has_more: boolean }>(
      'GET',
      `/invoices?${qs.toString()}`,
    );
  }

  async retrieveInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.request<StripeInvoice>(
      'GET',
      `/invoices/${encodeURIComponent(invoiceId)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // PaymentIntents (C-9 auto top-up — off-session card charge)
  // ---------------------------------------------------------------------------

  async createOffSessionPaymentIntent(input: {
    customerId: string;
    stripePaymentMethodId: string;
    amountMinor: number;
    currency: string;
    metadata?: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ id: string; status: string; amount: number; currency: string }> {
    const body = new URLSearchParams();
    body.set('amount', String(input.amountMinor));
    body.set('currency', input.currency.toLowerCase());
    body.set('customer', input.customerId);
    body.set('payment_method', input.stripePaymentMethodId);
    body.set('confirm', 'true');
    body.set('off_session', 'true');
    body.set('payment_method_types[0]', 'card');
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }
    return this.request<{ id: string; status: string; amount: number; currency: string }>(
      'POST',
      '/payment_intents',
      body,
      { idempotencyKey: input.idempotencyKey },
    );
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: URLSearchParams,
    opts?: { idempotencyKey?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
      'Content-Type':
        method === 'POST' ? 'application/x-www-form-urlencoded' : 'application/json',
      'Stripe-Version': this.apiVersion,
    };
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    const res = await fetch(`${STRIPE_API}${path}`, {
      method,
      headers,
      body: method === 'POST' && body ? body.toString() : undefined,
    });

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }

    if (!res.ok) {
      const err = (payload as { error?: { message?: string } } | undefined)?.error?.message;
      this.logger.error(`Stripe ${method} ${path} failed: ${res.status} ${err ?? ''}`);
      throw new Error(err ?? `Stripe request failed (${res.status})`);
    }

    return payload as T;
  }
}
