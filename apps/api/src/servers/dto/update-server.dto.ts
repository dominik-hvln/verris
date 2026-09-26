import { KODY_REGIONOW } from '../regiony.js';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ServerStatus } from '@verris/database';

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hostname?: string;

  // P-13 — region trafia do deklaracji lokalizacji danych w panelu klienta; tylko kody z listy.
  @IsOptional()
  @IsIn([...KODY_REGIONOW, ''])
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsEnum(ServerStatus)
  status?: ServerStatus;
}
