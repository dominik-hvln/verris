import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

/** O-1 — start a free trial for a trial-eligible plan. */
export class StartTrialDto {
  @IsUUID()
  planId!: string;

  /** Primary domain that will be created in DirectAdmin. */
  @IsString()
  @Length(4, 253)
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: 'Niepoprawny format domeny' })
  domain!: string;

  @IsOptional()
  @IsString()
  preferredRegion?: string;

  @IsOptional()
  @IsBoolean()
  ecoModeEnabled?: boolean;
}
