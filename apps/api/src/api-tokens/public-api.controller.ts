import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTokenGuard } from './api-token.guard';
import { ApiScope } from './api-scope.decorator';
import { API_SCOPES } from './api-scopes';

type ApiAuth = { userId: string; scopes: string[]; tokenId: string };
function auth(req: Request): ApiAuth {
  return (req as unknown as { apiAuth: ApiAuth }).apiAuth;
}

/**
 * Publiczne API klienta v1 (tokeny vrs_live). Read-only w MVP, account-scoped.
 * Uwierzytelnianie: nagłówek Authorization: Bearer <token>.
 */
@Controller('api/v1')
@UseGuards(ApiTokenGuard)
export class PublicApiController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @ApiScope(API_SCOPES.SERVICES_READ)
  async me(@Req() req: Request) {
    const u = await this.prisma.user.findUnique({
      where: { id: auth(req).userId },
      select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
    });
    return u;
  }

  @Get('services')
  @ApiScope(API_SCOPES.SERVICES_READ)
  async services(@Req() req: Request) {
    const rows = await this.prisma.subscription.findMany({
      where: { userId: auth(req).userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, interval: true, serviceTag: true,
        currentPeriodEnd: true, createdAt: true,
        plan: { select: { name: true, productKind: true } },
        account: { select: { domain: true } },
      },
      take: 200,
    });
    return rows.map((s) => ({
      id: s.id,
      serviceTag: s.serviceTag,
      status: s.status,
      interval: s.interval,
      product: s.plan?.productKind ?? 'HOSTING',
      plan: s.plan?.name ?? null,
      domain: s.account?.domain ?? null,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  @Get('services/:id')
  @ApiScope(API_SCOPES.SERVICES_READ)
  async service(@Req() req: Request, @Param('id') id: string) {
    const s = await this.prisma.subscription.findFirst({
      where: { id, userId: auth(req).userId },
      select: {
        id: true, status: true, interval: true, serviceTag: true, priceAmount: true, currency: true,
        currentPeriodStart: true, currentPeriodEnd: true, createdAt: true,
        plan: { select: { name: true, productKind: true } },
        account: { select: { domain: true } },
      },
    });
    if (!s) throw new NotFoundException('Usługa nie istnieje.');
    return {
      id: s.id,
      serviceTag: s.serviceTag,
      status: s.status,
      interval: s.interval,
      product: s.plan?.productKind ?? 'HOSTING',
      plan: s.plan?.name ?? null,
      domain: s.account?.domain ?? null,
      price: Number(s.priceAmount),
      currency: s.currency,
      currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  }

  @Get('billing/wallet')
  @ApiScope(API_SCOPES.BILLING_READ)
  async wallet(@Req() req: Request) {
    const u = await this.prisma.user.findUnique({
      where: { id: auth(req).userId },
      select: { walletBalance: true, walletCurrency: true },
    });
    return { balance: Number(u?.walletBalance ?? 0), currency: u?.walletCurrency ?? 'PLN' };
  }

  @Get('invoices')
  @ApiScope(API_SCOPES.INVOICES_READ)
  async invoices(@Req() req: Request) {
    const rows = await this.prisma.invoice.findMany({
      where: { userId: auth(req).userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, number: true, status: true, amount: true, currency: true, issuedAt: true, createdAt: true },
    });
    return rows.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      amount: Number(i.amount),
      currency: i.currency,
      issuedAt: i.issuedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    }));
  }
}
