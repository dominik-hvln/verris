import {
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { PlanChangeService } from './plan-change.service';
import { TrialService } from './trial.service';
import {
  CancelSubscriptionDto,
  ConvertTrialDto,
  CreateSubscriptionDto,
  PreviewSubscriptionPromoDto,
  UpdateAutoscalingDto,
  UpdateSubscriptionPreferencesDto,
} from './dto/subscription.dto';
import { StartTrialDto } from './dto/trial.dto';
import { ChangePlanDto, PreviewPlanChangeDto } from './dto/plan-change.dto';
import { RateLimit } from '../common/guards/rate-limit.guard';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly planChange: PlanChangeService,
    private readonly trial: TrialService,
  ) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.subscriptions.listForUser(user.userId);
  }

  // O-1 — free trial -----------------------------------------------------------

  /** Czy to konto może jeszcze uruchomić darmowy okres próbny. */
  @Get('trial/eligibility')
  trialEligibility(@CurrentUser() user: { userId: string }) {
    return this.trial.eligibility(user.userId);
  }

  /** Uruchom darmowy okres próbny (jeden na konto). */
  @RateLimit({ limit: 3, windowMs: 60 * 60 * 1000, scope: 'subscriptions:trial-start' })
  @Post('trial')
  @HttpCode(201)
  startTrial(@CurrentUser() user: { userId: string }, @Body() dto: StartTrialDto) {
    return this.trial.startTrial(user.userId, dto);
  }

  /**
   * Przekształć trwający okres próbny na płatną usługę (płatność z portfela).
   * Wymaga oświadczenia konsumenckiego (upk) — walidacja Equals(true) w DTO.
   */
  @Post(':id/convert')
  @HttpCode(200)
  convertTrial(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() _dto: ConvertTrialDto,
  ) {
    return this.trial.convertFromWallet(user.userId, id);
  }

  @Patch(':id/preferences')
  @HttpCode(200)
  updatePreferences(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionPreferencesDto,
  ) {
    return this.subscriptions.updatePreferences(user.userId, id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.subscriptions.getForUser(user.userId, id);
  }

  @Post('preview-promo')
  @HttpCode(200)
  previewPromo(
    @CurrentUser() user: { userId: string },
    @Body() dto: PreviewSubscriptionPromoDto,
  ) {
    return this.subscriptions.previewSubscriptionPromo(user.userId, dto);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateSubscriptionDto) {
    return this.subscriptions.create(user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CancelSubscriptionDto = {},
  ) {
    return this.subscriptions.cancel(user.userId, id, { atPeriodEnd: dto.atPeriodEnd });
  }

  /** Dokończ pierwszą płatność Stripe (Hosted Invoice) dla PENDING_PAYMENT. */
  @Post(':id/payment-retry')
  @HttpCode(200)
  paymentRetry(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.subscriptions.getPaymentRetryUrl(user.userId, id);
  }

  @Patch(':id/autoscaling')
  @HttpCode(200)
  updateAutoscaling(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateAutoscalingDto,
  ) {
    return this.subscriptions.setAutoscaling({
      userId: user.userId,
      subscriptionId: id,
      enabled: dto.enabled,
      maxMonthlyCost: dto.maxMonthlyCost,
      scaleCpu: dto.scaleCpu,
      scaleRam: dto.scaleRam,
      scaleDisk: dto.scaleDisk,
    });
  }

  @Get(':id/autoscaling/history')
  getAutoscalingHistory(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.subscriptions.getAutoscalingHistory(user.userId, id);
  }

  @Post(':id/plan/preview')
  @HttpCode(200)
  previewPlanChange(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: PreviewPlanChangeDto,
  ) {
    return this.planChange.previewForUser(
      user.userId,
      id,
      dto.targetPlanId,
      dto.targetInterval,
    );
  }

  @Patch(':id/plan')
  @HttpCode(200)
  changePlan(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ChangePlanDto,
  ) {
    return this.planChange.changeForUser(
      user.userId,
      id,
      dto.targetPlanId,
      dto.targetInterval,
    );
  }
}
