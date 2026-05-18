import { IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max } from 'class-validator';

export class CreateTopupCheckoutDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  amount!: number;

  /**
   * Optional percent-bonus promo code applied at checkout. Validated at
   * service level (active, not expired, not yet redeemed by the user). The
   * bonus is credited AFTER Stripe pays out and the topup itself lands.
   */
  @IsOptional()
  @IsString()
  @Length(3, 40)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Kod promocyjny może zawierać tylko litery, cyfry, _ i -.',
  })
  promoCode?: string;
}

export class PreviewTopupPromoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  amount!: number;

  @IsString()
  @Length(3, 40)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Kod promocyjny może zawierać tylko litery, cyfry, _ i -.',
  })
  promoCode!: string;
}
