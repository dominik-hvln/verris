import { IsIn, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max } from 'class-validator';

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

  /** M-10 — waluta wpłaty (portfel liczy w K, przeliczenie po kursie NBP). */
  @IsOptional()
  @IsIn(['PLN', 'EUR', 'USD'])
  currency?: 'PLN' | 'EUR' | 'USD';
}

/** M-09/M-10 — podgląd: stawka VAT nabywcy i ile K wyjdzie z wpłaty. */
export class TopupQuoteDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  amount!: number;

  @IsIn(['PLN', 'EUR', 'USD'])
  currency!: 'PLN' | 'EUR' | 'USD';
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
