import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';
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
  @Matches(/^\d+([\.,]\d{1,2})?$/)
  thresholdPln!: string;

  @IsString()
  @Matches(/^\d+([\.,]\d{1,2})?$/)
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
}
