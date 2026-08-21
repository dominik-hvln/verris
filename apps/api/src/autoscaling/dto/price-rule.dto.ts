import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AutoscalingResource } from '@verris/database';

export class CreatePriceRuleDto {
  @IsEnum(AutoscalingResource)
  resource!: AutoscalingResource;

  @IsOptional()
  @IsString()
  @Length(2, 32)
  unit?: string; // optional — API sets cpu_pct | ram_mb | disk_mb from resource

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1000)
  pricePerUnit!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  thresholdAbove?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdatePriceRuleDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1000)
  pricePerUnit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  thresholdAbove?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
