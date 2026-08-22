import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Prisma, Role, StripeWebhookEventStatus } from '@verris/database';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../../common/guards/staff-permissions.guard';
import { StaffPerm } from '../../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { BillingService } from '../billing.service';
import { PROG_ALERTU_PROB } from './webhook-ewidencja';

/**
 * Z-05 — podgląd i ręczne ponowienie zdarzeń webhooka Stripe'a.
 *
 * Macierz audytu opisała stan sprzed tej zmiany jako „odzysk wyłącznie ręcznie
 * w bazie". To jest ta różnica: zamiast `UPDATE` na produkcyjnej bazie o drugiej
 * w nocy — lista i przycisk.
 */
@Controller('admin/billing/webhooki')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class StripeWebhookEventsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lista zdarzeń. Domyślnie tylko nieobsłużone, bo to one wymagają uwagi —
   * przetworzonych są tysiące i przewijanie ich przy awarii tylko przeszkadza.
   */
  @Get()
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_MANAGE')
  async lista(@Query('status') status?: string, @Query('limit') limit?: string) {
    const ile = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const filtr: Prisma.StripeWebhookEventWhereInput =
      status === 'wszystkie'
        ? {}
        : status === 'PROCESSED' || status === 'FAILED' || status === 'PENDING'
          ? { status: status as StripeWebhookEventStatus }
          : { status: { in: ['FAILED', 'PENDING'] } };

    const [wiersze, liczby] = await Promise.all([
      this.prisma.stripeWebhookEvent.findMany({
        where: filtr,
        orderBy: { createdAt: 'desc' },
        take: ile,
        select: {
          eventId: true,
          type: true,
          status: true,
          attempts: true,
          lastError: true,
          claimedAt: true,
          nextAttemptAt: true,
          processedAt: true,
          alertedAt: true,
          payloadPurgedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.stripeWebhookEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const wg = Object.fromEntries(liczby.map((l) => [l.status, l._count._all]));
    return {
      zdarzenia: wiersze.map((w) => ({
        ...w,
        // Treść zdarzenia NIE wychodzi na listę — zawiera dane płatnicze
        // klienta, a do decyzji „ponowić czy nie" wystarczy typ i błąd.
        mozliwePonowienie: w.status !== 'PROCESSED' && w.payloadPurgedAt === null,
        zaciete: w.status !== 'PROCESSED' && w.attempts >= PROG_ALERTU_PROB,
      })),
      podsumowanie: {
        pending: wg.PENDING ?? 0,
        failed: wg.FAILED ?? 0,
        processed: wg.PROCESSED ?? 0,
      },
      progAlertu: PROG_ALERTU_PROB,
    };
  }

  /**
   * Ponowne przetworzenie. Bezpieczne z definicji: księgowanie portfela jest
   * idempotentne po kluczu sesji Stripe'a, więc powtórzenie nie doda pieniędzy
   * drugi raz. Skutki uboczne, które NIE są idempotentne, to maile — powtórzone
   * ponowienie może wysłać drugie „doładowanie się powiodło". Świadomy wybór:
   * dwa maile są tańsze niż nieksięgowana wpłata.
   */
  @Post(':eventId/ponow')
  @HttpCode(200)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_MANAGE')
  async ponow(
    @Param('eventId') eventId: string,
    @CurrentUser() aktor: { userId: string },
  ) {
    await this.audit.record({
      action: 'STRIPE_WEBHOOK_PONOWIENIE_RECZNE',
      actorUserId: aktor.userId,
      details: { eventId },
    });
    return this.billing.przetworzPonownie(eventId);
  }
}
