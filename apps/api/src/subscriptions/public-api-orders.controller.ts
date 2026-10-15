import { Body, ConflictException, Controller, HttpCode, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { BillingInterval, SubscriptionPaymentSource } from '@verris/database';
import { Equals, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { ApiTokenGuard } from '../api-tokens/api-token.guard.js';
import { ApiScope } from '../api-tokens/api-scope.decorator.js';
import { API_SCOPES } from '../api-tokens/api-scopes.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ConsentsService } from '../compliance/consents.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/** Zamówienie przez publiczne API — wyłącznie z salda portfela (bez karty i Paynow, bez przekierowań). */
export class ZamowienieApiDto {
  @IsUUID()
  planId!: string;

  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  /** Domena główna (hosting, poczta); dla produktów bez konta DA pomijana. */
  @IsOptional()
  @IsString()
  @Length(4, 253)
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: 'Niepoprawny format domeny' })
  domain?: string;

  /**
   * Oświadczenie konsumenckie jak w panelu (art. 15 ust. 3 i art. 21 ust. 2 upk; Regulamin §4 ust. 4) — wysłane przez
   * właściciela konta jego tokenem. Bez `true` zamówienie jest odrzucane; trafia do dziennika jak z panelu.
   */
  @IsBoolean()
  @Equals(true, {
    message: 'Wymagane jest oświadczenie o żądaniu rozpoczęcia świadczenia usługi przed upływem terminu odstąpienia od umowy.',
  })
  immediatePerformanceConsent!: boolean;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  promoCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  preferredRegion?: string;
}

/**
 * L-08 część 2 (noc 15.10; decyzja właściciela 02.10: „zamówienia i skrzynki przez API — po starcie”).
 * DOMYŚLNIE WYŁĄCZONE: działa dopiero przy `API_ZAMOWIENIA=1` w env API (decyzja właściciela — oświadczenie
 * konsumenckie składane przez API, pieniądze). Ta sama ścieżka co zamówienie z panelu z płatnością z portfela
 * (SubscriptionsService.create: Z-10 domeny, miejsce na węźle, kody, rabat startowy, PB-28, zwrot przy błędzie), plus:
 * - tylko portfel (`WALLET` + `PORTFEL`) — API nie przekierowuje do operatora płatności;
 * - wymagana akceptacja aktualnego regulaminu i polityki (w panelu robi to okno ponownej zgody — API go nie ma);
 * - limit 10 zamówień na godzinę na adres, jak w panelu; ślad w dzienniku z identyfikatorem tokenu.
 */
@Controller('api/v1/orders')
@UseGuards(ApiTokenGuard)
export class PublicApiOrdersController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly consents: ConsentsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiScope(API_SCOPES.ORDERS_WRITE)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'api:orders' })
  async zamow(@Req() req: Request, @Body() body: ZamowienieApiDto) {
    if (process.env.API_ZAMOWIENIA !== '1') throw new NotFoundException('Zamówienia przez API nie są jeszcze dostępne.');
    const { userId, tokenId } = (req as unknown as { apiAuth: { userId: string; tokenId: string } }).apiAuth;
    const zgoda = await this.consents.checkReConsent(userId);
    if (zgoda.required) {
      throw new ConflictException('Zaakceptuj aktualny regulamin i politykę prywatności w panelu Verris, zanim zamówisz usługę przez API.');
    }
    const wynik = await this.subscriptions.create(userId, {
      planId: body.planId,
      interval: body.interval,
      domain: body.domain,
      immediatePerformanceConsent: body.immediatePerformanceConsent,
      promoCode: body.promoCode,
      preferredRegion: body.preferredRegion,
      paymentSource: SubscriptionPaymentSource.WALLET,
      oplata: 'PORTFEL',
    });
    const s = wynik.subscription;
    await this.audit.record({ action: 'API_ORDER_CREATED', userId, actorUserId: userId, details: { subscriptionId: s.id, tokenId } });
    return {
      id: s.id,
      serviceTag: s.serviceTag,
      status: s.status,
      interval: s.interval,
      price: s.priceAmount?.toString() ?? null,
      currency: s.currency,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    };
  }
}
