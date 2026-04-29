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

export interface StripeInvoice {
  id: string;
  number: string | null;
  status: string;
  customer: string | null;
  subscription: string | null;
  amount_due: number;
  amount_paid: number;
  total: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created: number;
  due_date: number | null;
  status_transitions?: { paid_at: number | null; finalized_at: number | null } | null;
  payment_intent?: string | { id: string; client_secret: string | null; status: string } | null;
  metadata: Record<string, string> | null;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  metadata: Record<string, string> | null;
  latest_invoice:
    | string
    | {
        id: string;
        hosted_invoice_url: string | null;
        payment_intent:
          | string
          | { id: string; client_secret: string | null; status: string }
          | null;
      }
    | null;
  items?: { data: Array<{ price: { id: string } }> } | null;
}

/**
 * Tiny Stripe HTTP client over global fetch — avoids pulling in the official
 * SDK (and its transitive deps) for the few endpoints we currently need.
 *
 * All requests use HTTPS Basic auth with the secret key as the username (per
 * Stripe's documented form-encoded REST API).
 */
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name);

  constructor(private readonly secretKey: string) {}

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
      input.description ?? 'Doładowanie portfela EkoHost',
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
    // Expand the latest invoice + its payment intent so the caller can
    // immediately drive the on-page payment confirmation flow.
    body.set('expand[0]', 'latest_invoice.payment_intent');
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
      `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice.payment_intent`,
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
      'Stripe-Version': '2024-06-20',
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
