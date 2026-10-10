import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { PromoKind } from '@verris/database';

export class RedeemPromoDto {
  @IsString()
  @Length(3, 40)
  code!: string;
}

export class UpsertWalletAutoTopupDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(/^\d+([.,]\d{1,2})?$/)
  thresholdPln!: string;

  @IsString()
  @Matches(/^\d+([.,]\d{1,2})?$/)
  topupAmountPln!: string;

  @IsOptional()
  @IsString()
  localPaymentMethodId?: string | null;
}

export class AdminCreatePromoDto {
  @Matches(/^[a-zA-Z0-9_-]{3,40}$/)
  code!: string;

  @IsEnum(PromoKind)
  kind!: PromoKind;

  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  maxRedemptions?: number;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string;

  /** Tylko dla `SERVICE_PERCENT_OFF` — rabat na kolejne odnowienia z portfela. */
  @IsOptional()
  @IsBoolean()
  appliesToRenewals?: boolean;
}

/** B1 — PATCH kodu: pole pominięte = bez zmian, `null` = zdjęcie terminu/limitu/opisu. */
export class AdminUpdatePromoDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedemptions?: number | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
