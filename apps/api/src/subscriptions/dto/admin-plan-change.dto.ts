import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class AdminPreviewPlanChangeDto {
  @IsUUID()
  targetPlanId!: string;
}

export class AdminChangePlanDto {
  @IsUUID()
  targetPlanId!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;

  /** Tylko ADMIN: zmiana planu bez obciążenia portfela / Stripe. */
  @IsOptional()
  @IsBoolean()
  skipBilling?: boolean;
}
