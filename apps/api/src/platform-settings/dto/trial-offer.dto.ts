import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** UX-3 — konfiguracja oferty okresu próbnego (czytana publicznie + admin). */
export interface TrialOfferConfig {
  /** Ścieżka darmowego trialu bez karty. */
  freeEnabled: boolean;
  /** Ścieżka z kartą + rabat na 1. rok. */
  cardEnabled: boolean;
  /** Rabat % przy płatności rocznej z góry. */
  annualDiscountPct: number;
  /** Rabat % przy rozliczeniu miesięcznym (1. rok). */
  monthlyDiscountPct: number;
  /** Kod promo auto-stosowany dla ścieżki rocznej (pusty = bez auto-rabatu). */
  annualPromoCode: string;
  /** Kod promo auto-stosowany dla ścieżki miesięcznej. */
  monthlyPromoCode: string;
}

export class UpdateTrialOfferDto {
  @IsBoolean()
  freeEnabled!: boolean;

  @IsBoolean()
  cardEnabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(90)
  annualDiscountPct!: number;

  @IsInt()
  @Min(0)
  @Max(90)
  monthlyDiscountPct!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  annualPromoCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  monthlyPromoCode?: string;
}
