import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlansService } from './plans.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  ValidateStripePriceDto,
} from './dto/plan.dto';
import { StripeService } from '../billing/stripe/stripe.service';

@Controller('admin/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PlansAdminController {
  constructor(
    private readonly plans: PlansService,
    private readonly stripe: StripeService,
  ) {}

  @Get()
  list() {
    return this.plans.listAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.plans.getById(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreatePlanDto, @CurrentUser() actor: { userId: string }) {
    return this.plans.create(dto, actor.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.plans.update(id, dto, actor.userId);
  }

  @Post(':id/sync-stripe')
  @HttpCode(200)
  syncStripe(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.plans.syncStripeCatalog(id, actor.userId);
  }

  @Delete(':id')
  @HttpCode(200)
  deactivate(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.plans.deactivate(id, actor.userId);
  }

  /**
   * Sprint 4 / R-05 — preflight Stripe Price ID przed save w UI. Pozwala
   * adminowi sprawdzić zgodność (interval, waluta, kwota, active) zanim
   * spróbuje zapisać plan i zobaczyć błąd dopiero z `PATCH /admin/plans/:id`.
   */
  @Post('validate-stripe-price')
  @HttpCode(200)
  async validateStripePrice(@Body() dto: ValidateStripePriceDto) {
    const stripe = await this.stripe.retrievePriceOrThrow(dto.priceId);
    const expectedCurrency = (dto.expectedCurrency ?? 'PLN').toLowerCase();
    const issues: string[] = [];
    if (!stripe.active) issues.push('Price jest nieaktywny w Stripe.');
    if (stripe.type !== 'recurring' || !stripe.recurring) {
      issues.push('Price nie jest recurring.');
    } else {
      if (
        stripe.recurring.interval !== dto.interval ||
        stripe.recurring.interval_count !== 1
      ) {
        issues.push(
          `Interval w Stripe: ${stripe.recurring.interval}×${stripe.recurring.interval_count}, oczekiwany ${dto.interval}×1.`,
        );
      }
      if (stripe.recurring.usage_type !== 'licensed') {
        issues.push('Price jest metered, oczekiwane licensed.');
      }
    }
    if (stripe.currency.toLowerCase() !== expectedCurrency) {
      issues.push(
        `Waluta w Stripe: ${stripe.currency.toUpperCase()}, oczekiwana ${expectedCurrency.toUpperCase()}.`,
      );
    }
    const expectedMinor = Math.round(dto.expectedAmount * 100);
    if (stripe.unit_amount === null) {
      issues.push('Price nie ma unit_amount (custom pricing).');
    } else if (stripe.unit_amount !== expectedMinor) {
      issues.push(
        `Kwota w Stripe: ${(stripe.unit_amount / 100).toFixed(2)} ${stripe.currency.toUpperCase()}, oczekiwana ${dto.expectedAmount.toFixed(2)}.`,
      );
    }
    if (issues.length > 0) {
      throw new BadRequestException(issues.join(' '));
    }
    return {
      ok: true,
      stripe: {
        id: stripe.id,
        currency: stripe.currency.toUpperCase(),
        unitAmount: stripe.unit_amount,
        active: stripe.active,
        livemode: stripe.livemode,
        product: stripe.product,
        interval: stripe.recurring?.interval ?? null,
      },
    };
  }
}
