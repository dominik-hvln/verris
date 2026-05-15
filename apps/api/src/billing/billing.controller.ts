import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { WalletTxType } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { CreateTopupCheckoutDto } from './dto/checkout.dto';
import { RedeemPromoDto, UpsertWalletAutoTopupDto } from './dto/promo.dto';
import { PromoService } from './promo.service';
import { WalletAutoTopupService } from './wallet-auto-topup.service';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly promo: PromoService,
    private readonly autoTopup: WalletAutoTopupService,
  ) {}

  @Get('wallet')
  @HttpCode(200)
  getWallet(@CurrentUser() user: { userId: string }) {
    return this.billing.getWalletSummary(user.userId);
  }

  @Get('payment-methods')
  @HttpCode(200)
  listPaymentMethods(@CurrentUser() user: { userId: string }) {
    return this.billing.listMyPaymentMethods(user.userId);
  }

  @Post('checkout-session')
  @HttpCode(200)
  createCheckout(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTopupCheckoutDto,
  ) {
    return this.billing.createTopupCheckoutSession({
      userId: user.userId,
      amount: dto.amount,
    });
  }

  @Get('wallet/transactions.csv')
  @Header('Cache-Control', 'no-store')
  async exportMyTransactionsCsv(
    @CurrentUser() user: { userId: string },
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
  ) {
    const filters = {
      userId: user.userId,
      ...parseDateRange(from, to),
      ...parseTxType(type),
    };
    const { csv, filename } = await this.billing.exportTransactionsCsv(filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /** C-14 — zamiana kodu promocyjnego na wpływ PROMO_CREDIT na portfel */
  @Post('promo/redeem')
  @HttpCode(200)
  redeemPromo(@CurrentUser() user: { userId: string }, @Body() dto: RedeemPromoDto) {
    return this.promo.redeemPromo(user.userId, dto.code);
  }

  /** C-9 — pobierz ustawienia automatycznego doładowania */
  @Get('wallet/auto-topup')
  async getAutoTopup(@CurrentUser() user: { userId: string }) {
    const row = await this.autoTopup.getForUser(user.userId);
    return {
      ...serializeAutoTop(row),
    };
  }

  /** C-9 — ustaw progi kwoty i kartę dla auto-doładowania */
  @Post('wallet/auto-topup')
  async upsertAutoTopup(@CurrentUser() user: { userId: string }, @Body() dto: UpsertWalletAutoTopupDto) {
    const normalized = normalizeMoney(dto.thresholdPln, 'thresholdPln');
    const amt = normalizeMoney(dto.topupAmountPln, 'topupAmountPln');
    const updated = await this.autoTopup.upsertForUser(user.userId, {
      enabled: dto.enabled,
      thresholdPln: normalized,
      topupAmountPln: amt,
      localPaymentMethodId: dto.localPaymentMethodId ?? null,
    });
    return serializeAutoTop(updated);
  }
}

function serializeAutoTop(row: {
  enabled?: boolean;
  threshold?: unknown;
  topupAmount?: unknown;
  currency?: string | null;
  paymentMethodId?: string | null;
  cooldownUntil?: Date | null;
  lastAttemptAt?: Date | null;
  lastAttemptOk?: boolean | null;
  lastAttemptError?: string | null;
  totalToppedUpAmount?: unknown;
  totalToppedUpCount?: number | null;
}) {
  const n = (v: unknown) =>
    typeof v === 'object' && v !== null && 'toFixed' in v && typeof (v as { toFixed: (d: number) => string }).toFixed === 'function'
      ? (v as { toFixed: (d: number) => string }).toFixed(2)
      : String(v ?? '');
  return {
    enabled: Boolean(row.enabled),
    thresholdPln: n(row.threshold),
    topupAmountPln: n(row.topupAmount),
    currency: row.currency ?? 'PLN',
    paymentMethodId: row.paymentMethodId ?? null,
    cooldownUntil: row.cooldownUntil?.toISOString() ?? null,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    lastAttemptOk: row.lastAttemptOk ?? null,
    lastAttemptError: row.lastAttemptError ?? null,
    totalToppedUpAmountPln: row.totalToppedUpAmount != null ? n(row.totalToppedUpAmount) : undefined,
    totalToppedUpCount: row.totalToppedUpCount ?? undefined,
  };
}

function normalizeMoney(raw: string, field: string): string {
  const s = raw.replace(',', '.').trim();
  const n = Number(s);
  if (!Number.isFinite(n)) throw new BadRequestException(`Niepoprawna kwota (${field}).`);
  return n.toFixed(2);
}

function parseDateRange(
  from?: string,
  to?: string,
): { from?: Date; to?: Date } {
  const parsed: { from?: Date; to?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Niepoprawna data `from`');
    parsed.from = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Niepoprawna data `to`');
    parsed.to = d;
  }
  return parsed;
}

function parseTxType(type?: string): { type?: WalletTxType } {
  if (!type) return {};
  const upper = type.toUpperCase() as WalletTxType;
  if (!(upper in WalletTxType)) throw new BadRequestException(`Nieznany typ transakcji: ${type}`);
  return { type: upper };
}
