import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { DomenaZamowienia } from './domena-zamowienia.js';

/** O-1 — start a free trial for a trial-eligible plan. */
export class StartTrialDto {
  @IsUUID()
  planId!: string;

  /** Primary domain that will be created in DirectAdmin. */
  @DomenaZamowienia()
  domain!: string;

  @IsOptional()
  @IsString()
  preferredRegion?: string;

  @IsOptional()
  @IsBoolean()
  ecoModeEnabled?: boolean;
}
