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
import { Role, WalletTxType } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { AdminCreditWalletDto } from './dto/admin-credit.dto';
import { PromoService } from './promo.service';
import { AdminCreatePromoDto } from './dto/promo.dto';

@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BillingAdminController {
  constructor(
    private readonly billing: BillingService,
    private readonly promo: PromoService,
  ) {}

  @Post('wallet/credit')
  @HttpCode(200)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_MANAGE')
  creditWallet(
    @Body() dto: AdminCreditWalletDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.billing.adminCreditWallet({
      userId: dto.userId,
      amount: dto.amount,
      description: dto.description,
      idempotencyKey: dto.idempotencyKey,
      actorUserId: actor.userId,
    });
  }

  @Post('promo-codes')
  @HttpCode(201)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('PROMO_MANAGE')
  createPromo(@Body() dto: AdminCreatePromoDto, @CurrentUser() actor: { userId: string }) {
    return this.promo.createPromoCode({
      code: dto.code,
      kind: dto.kind,
      value: dto.value,
      description: dto.description,
      maxRedemptions: dto.maxRedemptions ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      appliesToRenewals: dto.appliesToRenewals,
      actorUserId: actor.userId,
    });
  }

  @Get('promo-codes')
  @HttpCode(200)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('PROMO_MANAGE')
  listPromoCodes() {
    return this.promo.listPromoCodes();
  }

  @Get('wallet/transactions.csv')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_VIEW')
  @Header('Cache-Control', 'no-store')
  async exportTransactionsCsv(
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
  ) {
    const filters: Parameters<BillingService['exportTransactionsCsv']>[0] = {};
    if (userId) filters.userId = userId;
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Niepoprawna data `from`');
      filters.from = d;
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Niepoprawna data `to`');
      filters.to = d;
    }
    if (type) {
      const upper = type.toUpperCase() as WalletTxType;
      if (!(upper in WalletTxType)) throw new BadRequestException(`Nieznany typ transakcji: ${type}`);
      filters.type = upper;
    }

    const { csv, filename } = await this.billing.exportTransactionsCsv(filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
