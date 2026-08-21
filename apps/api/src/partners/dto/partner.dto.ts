import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BankPayoutDto {
  @IsString()
  @MaxLength(40)
  bankAccount!: string;
}

export class ProcessPayoutDto {
  @IsIn(['PAID', 'REJECTED'])
  action!: 'PAID' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdatePartnerProgramDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(90)
  commissionPct!: number;

  @IsInt()
  @Min(0)
  @Max(365)
  holdDays!: number;

  @IsInt()
  @Min(0)
  @Max(100000)
  minPayout!: number;

  @IsInt()
  @Min(0)
  @Max(1000)
  freeHostingThreshold!: number;

  @IsInt()
  @Min(0)
  @Max(100000)
  freeHostingCredit!: number;
}
