import { BillingInterval } from '@verris/database';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class PreviewPlanChangeDto {
  @IsUUID()
  targetPlanId!: string;

  @IsOptional()
  @IsEnum(BillingInterval)
  targetInterval?: BillingInterval;
}

export class ChangePlanDto {
  @IsUUID()
  targetPlanId!: string;

  @IsOptional()
  @IsEnum(BillingInterval)
  targetInterval?: BillingInterval;
}
