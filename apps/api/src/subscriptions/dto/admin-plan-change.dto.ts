import { BillingInterval } from '@verris/database';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class AdminPreviewPlanChangeDto {
  @IsUUID()
  targetPlanId!: string;

  @IsOptional()
  @IsEnum(BillingInterval)
  targetInterval?: BillingInterval;
}

export class AdminChangePlanDto {
  @IsUUID()
  targetPlanId!: string;

  @IsOptional()
  @IsEnum(BillingInterval)
  targetInterval?: BillingInterval;

  @IsString()
  @Length(3, 500)
  reason!: string;

  /** Tylko ADMIN: zmiana planu bez obciążenia portfela / Stripe. */
  @IsOptional()
  @IsBoolean()
  skipBilling?: boolean;
}
