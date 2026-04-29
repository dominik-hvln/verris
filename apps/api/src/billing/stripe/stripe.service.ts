import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  StripeClient,
  StripeCheckoutSessionInput,
  StripeCustomer,
  StripeInvoice,
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
    this.client = secretKey ? new StripeClient(secretKey) : null;
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

    const parts = Object.fromEntries(
      signatureHeader
        .split(',')
        .map((kv) => kv.trim().split('='))
        .filter((p): p is [string, string] => p.length === 2),
    );
    const timestamp = parts['t'];
    const v1 = parts['v1'];
    if (!timestamp || !v1) {
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

    const sig = Buffer.from(v1, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sig.length !== expectedBuf.length || !timingSafeEqual(sig, expectedBuf)) {
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
