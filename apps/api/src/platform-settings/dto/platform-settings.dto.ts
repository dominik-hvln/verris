import { IsInt, Max, Min } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  ecoPointsPerTree!: number;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  ecoBadgeImpressionsPerPoint!: number;

  @IsInt()
  @Min(1)
  @Max(100_000)
  ecoPointsPer10Credits!: number;

  @IsInt()
  @Min(5)
  @Max(24 * 60)
  clientIdleSessionMinutes!: number;

  @IsInt()
  @Min(5)
  @Max(24 * 60)
  staffIdleSessionMinutes!: number;

  @IsInt()
  @Min(5)
  @Max(24 * 60)
  adminIdleSessionMinutes!: number;
}
