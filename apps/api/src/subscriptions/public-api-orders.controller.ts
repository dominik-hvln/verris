import {
  BadRequestException,
  Body,
  CanActivate,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BillingInterval, SubscriptionPaymentSource, SubscriptionStatus } from '@verris/database';
import { Equals, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { ApiTokenGuard } from '../api-tokens/api-token.guard.js';
import { ApiScope } from '../api-tokens/api-scope.decorator.js';
import { API_SCOPES } from '../api-tokens/api-scopes.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { ConsentsService } from '../compliance/consents.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
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

/** Flaga przed strażnikiem tokenu: przy wyłączonych zamówieniach trasa odpowiada 404 każdemu (bez 401/403). */
@Injectable()
export class FlagaZamowienApiGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.API_ZAMOWIENIA !== '1') throw new NotFoundException('Zamówienia przez API nie są jeszcze dostępne.');
    return true;
  }
}

const KLUCZ_RE = /^[A-Za-z0-9_-]{8,100}$/;
const MAKS_NA_GODZINE = 10;
const normalizujDomene = (d: string) => d.trim().toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');

/**
 * L-08 część 2 (noc 15.10; decyzja właściciela 02.10: „zamówienia i skrzynki przez API — po starcie”).
 * DOMYŚLNIE WYŁĄCZONE: działa dopiero przy `API_ZAMOWIENIA=1` w env API (decyzja właściciela — oświadczenie
 * konsumenckie składane przez API, pieniądze). Ta sama ścieżka co zamówienie z panelu z płatnością z portfela
 * (SubscriptionsService.create: Z-10 domeny, miejsce na węźle, kody, rabat startowy, PB-28, zwrot przy błędzie), plus:
 * - tylko portfel (`WALLET` + `PORTFEL`) — API nie przekierowuje do karty ani Paynow;
 * - wymagana akceptacja aktualnego regulaminu i polityki (w panelu robi to okno ponownej zgody — API go nie ma);
 * - nagłówek `Idempotency-Key` (8–100 znaków): ponowienie z tym samym kluczem zwraca wynik pierwszego zamówienia,
 *   a nie zamawia drugi raz. Znacznik „rozpoczęte” trafia do bazy PRZED obciążeniem, a całość idzie pod blokadą
 *   doradczą PostgreSQL na klienta — także przy kilku instancjach API. Przerwane zamówienie (znacznik bez wyniku)
 *   blokuje ten klucz (409) — bez ryzyka drugiego obciążenia;
 * - ta sama domena (bez „www.”) z usługą w zakładaniu albo aktywną, zamówiona wcześniej przez API → 409;
 * - najwyżej 10 zamówień na godzinę na KONTO (limit trasy liczy też adres IP).
 */
@Controller('api/v1/orders')
@UseGuards(FlagaZamowienApiGuard, ApiTokenGuard)
export class PublicApiOrdersController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly consents: ConsentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiScope(API_SCOPES.ORDERS_WRITE)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'api:orders' })
  async zamow(@Req() req: Request, @Body() body: ZamowienieApiDto, @Headers('idempotency-key') klucz?: string) {
    if (process.env.API_ZAMOWIENIA !== '1') throw new NotFoundException('Zamówienia przez API nie są jeszcze dostępne.');
    if (!klucz || !KLUCZ_RE.test(klucz)) {
      throw new BadRequestException('Wymagany nagłówek Idempotency-Key (8–100 znaków: litery, cyfry, „-” i „_”) — ten sam przy ponowieniu.');
    }
    const { userId, tokenId } = (req as unknown as { apiAuth: { userId: string; tokenId: string } }).apiAuth;
    // Blokada doradcza na klienta w transakcji: zamówienia jednego klienta idą po kolei we wszystkich instancjach API.
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`api-order:${userId}`}))`;
        return this.zamowPodBlokada(userId, tokenId, klucz, body);
      },
      { maxWait: 30_000, timeout: 180_000 },
    );
  }

  private znacznik(action: string, userId: string, details: Record<string, unknown>) {
    // Wprost przez Prisma (nie AuditService, który połyka błędy) — bez zapisu znacznika nie wolno obciążyć.
    return this.prisma.auditLog.create({ data: { action, userId, actorUserId: userId, details: details as never } });
  }

  private async zamowPodBlokada(userId: string, tokenId: string, klucz: string, body: ZamowienieApiDto) {
    const wpisy = await this.prisma.auditLog.findMany({
      where: { userId, action: { in: ['API_ORDER_STARTED', 'API_ORDER_CREATED', 'API_ORDER_FAILED'] }, details: { path: ['idempotencyKey'], equals: klucz } },
      orderBy: { createdAt: 'desc' },
      select: { action: true, details: true },
    });
    const wynik = wpisy.find((w) => w.action === 'API_ORDER_CREATED');
    if (wynik) return (wynik.details as { odpowiedz: unknown }).odpowiedz;
    if (wpisy[0]?.action === 'API_ORDER_STARTED') {
      throw new ConflictException('Zamówienie z tym kluczem jest w toku albo zostało przerwane — sprawdź listę usług (GET /api/v1/services), zanim zamówisz z nowym kluczem.');
    }

    const godzinaTemu = new Date(Date.now() - 60 * 60 * 1000);
    if ((await this.prisma.auditLog.count({ where: { userId, action: 'API_ORDER_STARTED', createdAt: { gte: godzinaTemu } } })) >= MAKS_NA_GODZINE) {
      throw new HttpException('Limit zamówień przez API: 10 na godzinę na konto.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const domena = body.domain ? normalizujDomene(body.domain) : null;
    if (domena) {
      const wczesniej = await this.prisma.auditLog.findMany({
        where: { userId, action: 'API_ORDER_CREATED', details: { path: ['domain'], equals: domena } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { details: true },
      });
      for (const w of wczesniej) {
        const id = (w.details as { subscriptionId?: string } | null)?.subscriptionId;
        if (!id) continue;
        const sub = await this.prisma.subscription.findUnique({ where: { id }, select: { id: true, status: true } });
        // PENDING_PAYMENT po zamówieniu z API = zwrot po nieudanym zakładaniu — wolno zamówić ponownie.
        if (sub && (sub.status === SubscriptionStatus.PROVISIONING || sub.status === SubscriptionStatus.ACTIVE)) {
          throw new ConflictException(`Usługa dla domeny ${domena} jest już zamówiona (id ${sub.id}) — sprawdź GET /api/v1/services/${sub.id}.`);
        }
      }
    }

    const zgoda = await this.consents.checkReConsent(userId);
    if (zgoda.required) {
      throw new ConflictException('Zaakceptuj aktualny regulamin i politykę prywatności w panelu Verris, zanim zamówisz usługę przez API.');
    }

    await this.znacznik('API_ORDER_STARTED', userId, { idempotencyKey: klucz, tokenId, domain: domena });
    let wynik2;
    try {
      wynik2 = await this.subscriptions.create(userId, {
        planId: body.planId,
        interval: body.interval,
        domain: domena ?? undefined,
        immediatePerformanceConsent: body.immediatePerformanceConsent,
        promoCode: body.promoCode,
        preferredRegion: body.preferredRegion,
        paymentSource: SubscriptionPaymentSource.WALLET,
        oplata: 'PORTFEL',
      });
    } catch (err) {
      // SubscriptionsService oddaje środki przy błędzie — klucz wolno użyć ponownie.
      await this.znacznik('API_ORDER_FAILED', userId, { idempotencyKey: klucz, tokenId, blad: err instanceof Error ? err.message.slice(0, 300) : 'błąd' });
      throw err;
    }
    const s = wynik2.subscription;
    const odpowiedz = {
      id: s.id,
      serviceTag: s.serviceTag,
      status: s.status,
      interval: s.interval,
      price: s.priceAmount?.toString() ?? null,
      currency: s.currency,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    };
    await this.znacznik('API_ORDER_CREATED', userId, { idempotencyKey: klucz, tokenId, domain: domena, subscriptionId: s.id, odpowiedz });
    return odpowiedz;
  }
}
