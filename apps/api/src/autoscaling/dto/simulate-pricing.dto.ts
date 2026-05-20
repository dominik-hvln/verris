import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AutoscalingResource } from '@verris/database';

export class SimulatePricingDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  cpuPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ramGb?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diskGb?: number;

  /** Draft rule merged into active catalog for preview (AS-3.2). */
  @IsOptional()
  @IsEnum(AutoscalingResource)
  draftResource?: AutoscalingResource;

  @IsOptional()
  @IsNumber()
  @Min(0)
  draftPricePerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  draftThresholdAbove?: number;
}
