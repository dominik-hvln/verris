import { BadRequestException, Controller, Headers, HttpCode, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { DomainRegistrarService, type ZdarzenieOp } from './domain-registrar.service.js';

const rowne = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Webhook OpenProvidera: `Authorization: Bearer <api_key>` + `X-Webhook-Signature: t=<unix>,v1=<hex>`,
 * gdzie v1 = HMAC-SHA256(secret, `${t}.${surowa treść}`). Znacznik czasu najwyżej 5 min od teraz (powtórki).
 * https://support.openprovider.eu/hc/en-us/articles/34308521422610--Webhook-Notification-System
 */
export function sprawdzWebhookOp(o: { raw: Buffer; auth?: string; podpis?: string; apiKey: string; secret: string; teraz?: number }): boolean {
  if (!o.auth || !rowne(o.auth, `Bearer ${o.apiKey}`)) return false;
  const czesci = Object.fromEntries((o.podpis ?? '').split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  const t = Number(czesci.t);
  if (!Number.isInteger(t) || !czesci.v1) return false;
  if (Math.abs((o.teraz ?? Date.now() / 1000) - t) > 300) return false;
  const oczekiwany = createHmac('sha256', o.secret).update(`${t}.`).update(o.raw).digest('hex');
  return rowne(czesci.v1.toLowerCase(), oczekiwany);
}

/** Bez logowania — autentyczność: klucz + podpis; na Caddy dodatkowo tylko adresy OpenProvidera. */
@Controller('webhooks')
export class OpenproviderWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly registrar: DomainRegistrarService,
  ) {}

  @Post('openprovider')
  @HttpCode(200)
  async odbierz(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('authorization') auth?: string,
    @Headers('x-webhook-signature') podpis?: string,
  ): Promise<{ ok: true }> {
    const apiKey = this.config.get<string>('OPENPROVIDER_WEBHOOK_API_KEY');
    const secret = this.config.get<string>('OPENPROVIDER_WEBHOOK_SECRET');
    if (!apiKey || !secret) throw new NotFoundException();
    const raw = req.rawBody ?? Buffer.alloc(0);
    if (!sprawdzWebhookOp({ raw, auth, podpis, apiKey, secret })) throw new UnauthorizedException();
    let ev: ZdarzenieOp;
    try {
      ev = JSON.parse(raw.toString('utf8')) as ZdarzenieOp;
    } catch {
      throw new BadRequestException();
    }
    await this.registrar.zdarzenieOp(ev);
    return { ok: true };
  }
}
