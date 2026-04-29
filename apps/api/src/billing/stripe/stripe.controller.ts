import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from '../billing.service';

/**
 * Webhook endpoint for Stripe.
 *
 * The express raw-body middleware is registered for this exact path in
 * main.ts so we can verify the HMAC signature on the unparsed payload.
 */
@Controller('billing/stripe')
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhook')
  @HttpCode(200)
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? (req.body as Buffer) : null);
    if (!raw) {
      return { received: false, reason: 'missing raw body' };
    }
    return this.billing.handleStripeWebhook(raw, signature);
  }
}
