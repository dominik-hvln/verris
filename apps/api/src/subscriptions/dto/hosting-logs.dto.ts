import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** K-04/K-05 — zapytanie o log domeny. */
export class LogiHostinguQueryDto {
  @IsIn(['access', 'error'])
  type!: 'access' | 'error';

  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(1000)
  lines?: number;
}
