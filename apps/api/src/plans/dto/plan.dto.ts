import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug może zawierać tylko a-z, 0-9 i myślniki' })
  slug!: string;

  @IsString()
  @Length(2, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt() @Min(50) @Max(2000)
  cpuLimit!: number;

  @IsInt() @Min(256) @Max(65536)
  ramLimitMb!: number;

  @IsInt() @Min(1024)
  diskLimitMb!: number;

  @IsOptional() @IsInt() @Min(1024)
  ioLimitKbps?: number;

  @IsOptional() @IsInt() @Min(64)
  iopsLimit?: number;

  @IsOptional() @IsInt() @Min(1) @Max(2000)
  entryProcesses?: number;

  @IsOptional() @IsInt() @Min(16) @Max(4000)
  nprocLimit?: number;

  @IsOptional() @IsInt() @Min(0)
  includedTransferGb?: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(100000)
  priceMonthly!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(1000000)
  priceYearly!: number;

  @IsOptional() @IsString() @Length(3, 3)
  currency?: string;

  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;

  // Stripe recurring price IDs — required only if you intend to sell this plan
  // through Stripe Subscriptions (paymentSource=STRIPE_CARD on /subscriptions).
  // Format: "price_..." copied from the Stripe Dashboard. Leave blank to disable
  // card recurring for this plan; SubscriptionsService will return a clear error.
  @IsOptional() @IsString() @Length(3, 80) @Matches(/^price_/, {
    message: 'Stripe Price ID musi zaczynać się od "price_"',
  })
  stripePriceMonthlyId?: string;

  @IsOptional() @IsString() @Length(3, 80) @Matches(/^price_/, {
    message: 'Stripe Price ID musi zaczynać się od "price_"',
  })
  stripePriceYearlyId?: string;

  @IsOptional() @IsNumber() @Min(1) @Max(10)
  autoscalingMaxOverscaleCpu?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(10)
  autoscalingMaxOverscaleRam?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(10)
  autoscalingMaxOverscaleDisk?: number;
}

export class ValidateStripePriceDto {
  @IsString() @Length(3, 80) @Matches(/^price_/, {
    message: 'Stripe Price ID musi zaczynać się od "price_"',
  })
  priceId!: string;

  @IsString() @Matches(/^(month|year)$/)
  interval!: 'month' | 'year';

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(1000000)
  expectedAmount!: number;

  @IsOptional() @IsString() @Length(3, 3)
  expectedCurrency?: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @Length(2, 80)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsInt() @Min(50) @Max(2000)
  cpuLimit?: number;

  @IsOptional() @IsInt() @Min(256) @Max(65536)
  ramLimitMb?: number;

  @IsOptional() @IsInt() @Min(1024)
  diskLimitMb?: number;

  @IsOptional() @IsInt() @Min(1024)
  ioLimitKbps?: number;

  @IsOptional() @IsInt() @Min(64)
  iopsLimit?: number;

  @IsOptional() @IsInt() @Min(1) @Max(2000)
  entryProcesses?: number;

  @IsOptional() @IsInt() @Min(16) @Max(4000)
  nprocLimit?: number;

  @IsOptional() @IsInt() @Min(0)
  includedTransferGb?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(100000)
  priceMonthly?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(1000000)
  priceYearly?: number;

  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;

  @IsOptional() @IsString() @Length(3, 80) @Matches(/^price_/, {
    message: 'Stripe Price ID musi zaczynać się od "price_"',
  })
  stripePriceMonthlyId?: string;

  @IsOptional() @IsString() @Length(3, 80) @Matches(/^price_/, {
    message: 'Stripe Price ID musi zaczynać się od "price_"',
  })
  stripePriceYearlyId?: string;

  @IsOptional() @IsNumber() @Min(1) @Max(10)
  autoscalingMaxOverscaleCpu?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(10)
  autoscalingMaxOverscaleRam?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(10)
  autoscalingMaxOverscaleDisk?: number;
}
