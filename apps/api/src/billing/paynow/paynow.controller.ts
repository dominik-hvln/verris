import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from '../billing.service.js';

/**
 * Powiadomienia Paynow (bez logowania — autentyczność sprawdza podpis HMAC z surowej treści).
 * Adres do wpisania w panelu Paynow (Ustawienia → Sklepy i punkty płatności → Adres powiadomień):
 * `PUBLIC_API_URL/billing/paynow/powiadomienia`. Surowa treść jak przy webhooku Stripe: `rawBody: true` w main.ts.
 * https://docs.paynow.pl/docs/v3/integration#notifications — odpowiedź 200 z pustą treścią.
 */
@Controller('billing/paynow')
export class PaynowPowiadomieniaController {
  constructor(private readonly billing: BillingService) {}

  @Post('powiadomienia')
  @HttpCode(200)
  async powiadomienie(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('signature') podpis?: string,
  ): Promise<void> {
    const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.alloc(0));
    await this.billing.handlePaynowNotification(raw, podpis);
  }
}
