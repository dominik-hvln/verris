import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { BillingInterval, SubscriptionPaymentSource } from '@verris/database';

export class CreateSubscriptionDto {
  @IsUUID()
  planId!: string;

  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  /** Source of payment for this subscription's recurring charges. */
  @IsEnum(SubscriptionPaymentSource)
  paymentSource!: SubscriptionPaymentSource;

  /**
   * Primary domain that will be created in DirectAdmin. Required for hosting /
   * e-mail products; ignored for app-level products (EMAIL_MARKETING), which
   * activate without a DA account. Walidacja obecności jest w serwisie wg planu.
   */
  @IsOptional()
  @IsString()
  @Length(4, 253)
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: 'Niepoprawny format domeny' })
  domain?: string;

  /** Optional region preference (e.g. "PL-WAW"). Used as a tie-breaker. */
  @IsOptional()
  @IsString()
  preferredRegion?: string;

  /** Whether autoscaling is enabled at sign-up. Default false. */
  @IsOptional()
  @IsBoolean()
  autoscalingEnabled?: boolean;

  /** Whether eco mode is enabled at sign-up. Default false. */
  @IsOptional()
  @IsBoolean()
  ecoModeEnabled?: boolean;

  /** Rabat procentowy na usługę (tylko płatność z portfela). */
  @IsOptional()
  @IsString()
  @Length(3, 40)
  promoCode?: string;
}

export class PreviewSubscriptionPromoDto {
  @IsUUID()
  planId!: string;

  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  @IsString()
  @Length(3, 40)
  code!: string;
}

export class SuspendSubscriptionDto {
  @IsString()
  @Length(2, 60)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class UnsuspendSubscriptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  chargeRenewal?: boolean;
}

export class CancelSubscriptionDto {
  /**
   * When true (default), the subscription stays active until the end of the
   * already-paid period and Stripe is told to cancel at period end (no further
   * charges). When false, we cancel immediately and tear down the hosting now.
   */
  @IsOptional()
  @IsBoolean()
  atPeriodEnd?: boolean;
}

export class UpdateAutoscalingDto {
  @IsBoolean()
  enabled!: boolean;

  /** Monthly cap in PLN. Set to 0 to mean "no cap" (cap will be enforced
   *  by the engine refusing to scale once reached). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999.99)
  maxMonthlyCost?: number;

  @IsOptional()
  @IsBoolean()
  scaleCpu?: boolean;

  @IsOptional()
  @IsBoolean()
  scaleRam?: boolean;

  @IsOptional()
  @IsBoolean()
  scaleDisk?: boolean;
}

export class UpdateSubscriptionPreferencesDto {
  @IsBoolean()
  ecoModeEnabled!: boolean;
}
