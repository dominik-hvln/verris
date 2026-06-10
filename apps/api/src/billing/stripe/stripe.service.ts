import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  DEFAULT_STRIPE_API_VERSION,
  StripeClient,
  StripeCheckoutSessionInput,
  StripeCustomer,
  StripeInvoice,
  StripePrice,
  StripeSubscription,
} from './stripe.client';

const SIGNATURE_TOLERANCE_S = 300;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: StripeClient | null;
  private readonly webhookSecret: string | null;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('stripeSecretKey');
    this.webhookSecret = config.get<string>('stripeWebhookSecret') ?? null;
    // `STRIPE_API_VERSION` env override is for emergency rollback during a
    // dahlia → next-major upgrade window. See `DEPLOY.md` →
    // "Stripe API upgrade" runbook for the full procedure.
    const apiVersion =
      config.get<string>('stripeApiVersion') ?? DEFAULT_STRIPE_API_VERSION;
    this.client = secretKey ? new StripeClient(secretKey, apiVersion) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  isWebhookConfigured(): boolean {
    return this.webhookSecret !== null;
  }

  async createCheckoutSession(input: StripeCheckoutSessionInput) {
    return this.requireClient().createCheckoutSession(input);
  }

  // ---------------------------------------------------------------------------
  // Customers (lazy-create per User on first card subscription)
  // ---------------------------------------------------------------------------

  async createCustomer(input: {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<StripeCustomer> {
    return this.requireClient().createCustomer(input);
  }

  async getCustomer(customerId: string): Promise<StripeCustomer> {
    return this.requireClient().getCustomer(customerId);
  }

  async updateCustomerEmail(customerId: string, email: string): Promise<void> {
    await this.requireClient().updateCustomer(customerId, { email });
  }

  /**
   * Sprint 4 / R-05 — bezpieczne odczytanie Stripe Price (zwraca `null` gdy
   * Stripe nie jest skonfigurowany, błąd 404 podnosi do BadRequestException).
   */
  async createProduct(input: {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<{ id: string; name: string }> {
    return this.wrapStripe(() => this.requireClient().createProduct(input));
  }

  async updateProduct(
    productId: string,
    input: { name?: string; description?: string; metadata?: Record<string, string> },
  ): Promise<{ id: string }> {
    return this.wrapStripe(() => this.requireClient().updateProduct(productId, input));
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
    return this.wrapStripe(() => this.requireClient().createRecurringPrice(input));
  }

  async deactivatePrice(priceId: string): Promise<StripePrice> {
    return this.wrapStripe(() => this.requireClient().deactivatePrice(priceId));
  }

  async retrievePriceOrThrow(priceId: string): Promise<StripePrice> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Stripe nie jest skonfigurowany — ustaw STRIPE_SECRET_KEY zanim użyjesz Price ID.',
      );
    }
    try {
      return await this.client.retrievePrice(priceId);
    } catch (e) {
      const msg = (e as Error).message;
      throw new BadRequestException(
        `Stripe odrzucił Price ID "${priceId}": ${msg}. Skopiuj poprawne ID z Dashboard.`,
      );
    }
  }

  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<StripeCustomer> {
    return this.requireClient().setDefaultPaymentMethod(customerId, paymentMethodId);
  }

  async attachPaymentMethod(paymentMethodId: string, customerId: string) {
    return this.requireClient().attachPaymentMethod(paymentMethodId, customerId);
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async createSubscription(input: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
    trialPeriodDays?: number;
  }): Promise<StripeSubscription> {
    return this.requireClient().createSubscription(input);
  }

  async cancelSubscription(
    subscriptionId: string,
    opts: { atPeriodEnd?: boolean } = {},
  ): Promise<StripeSubscription> {
    return this.requireClient().cancelSubscription(subscriptionId, opts);
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.requireClient().retrieveSubscription(subscriptionId);
  }

  async updateSubscriptionPrice(input: {
    subscriptionId: string;
    subscriptionItemId: string;
    newPriceId: string;
    prorationBehavior?: 'create_prorations' | 'none';
  }): Promise<StripeSubscription> {
    return this.requireClient().updateSubscriptionPrice(input);
  }

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  async listInvoices(opts: {
    customerId?: string;
    subscriptionId?: string;
    limit?: number;
  }): Promise<{ data: StripeInvoice[]; has_more: boolean }> {
    return this.requireClient().listInvoices(opts);
  }

  async retrieveInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.requireClient().retrieveInvoice(invoiceId);
  }

  /** C-9: charge a saved PaymentMethod without customer interaction. */
  async createOffSessionPaymentIntent(input: {
    customerId: string;
    stripePaymentMethodId: string;
    amountMinor: number;
    currency: string;
    metadata?: Record<string, string>;
    idempotencyKey: string;
  }) {
    return this.requireClient().createOffSessionPaymentIntent(input);
  }

  private requireClient(): StripeClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Płatności Stripe nie są skonfigurowane (brak STRIPE_SECRET_KEY).',
      );
    }
    return this.client;
  }

  private async wrapStripe<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`Stripe API error: ${msg}`);
      throw new BadRequestException(`Stripe: ${msg}`);
    }
  }

  /**
   * Verifies a Stripe webhook signature using HMAC-SHA256 against the secret.
   * Mirrors the algorithm Stripe documents for the t=…,v1=… header format.
   *
   * Throws UnauthorizedException on any failure so callers can rely on the
   * boolean result type.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): void {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('Brak STRIPE_WEBHOOK_SECRET');
    }
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing Stripe-Signature header');
    }

    // Audit F-16: during a webhook-secret roll Stripe sends MULTIPLE `v1`
    // entries — the delivery is valid if ANY of them matches our secret.
    const entries = signatureHeader
      .split(',')
      .map((kv) => kv.trim().split('='))
      .filter((p): p is [string, string] => p.length === 2);
    const timestamp = entries.find(([k]) => k === 't')?.[1];
    const v1Signatures = entries.filter(([k]) => k === 'v1').map(([, v]) => v);
    if (!timestamp || v1Signatures.length === 0) {
      throw new UnauthorizedException('Invalid Stripe-Signature header');
    }

    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts)) throw new UnauthorizedException('Invalid signature timestamp');

    const ageS = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (ageS > SIGNATURE_TOLERANCE_S) {
      throw new UnauthorizedException('Stripe webhook timestamp out of tolerance');
    }

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', this.webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    const anyMatch = v1Signatures.some((v1) => {
      const sig = Buffer.from(v1, 'hex');
      return sig.length === expectedBuf.length && timingSafeEqual(sig, expectedBuf);
    });
    if (!anyMatch) {
      throw new UnauthorizedException('Stripe signature mismatch');
    }
  }

  parseEvent(rawBody: Buffer): { type: string; id: string; data: { object: Record<string, unknown> } } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }
    const event = parsed as { type?: unknown; id?: unknown; data?: unknown };
    if (typeof event.type !== 'string' || typeof event.id !== 'string' || typeof event.data !== 'object') {
      throw new BadRequestException('Invalid Stripe event shape');
    }
    return event as { type: string; id: string; data: { object: Record<string, unknown> } };
  }
}
