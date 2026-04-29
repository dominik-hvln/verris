import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ServerStatus } from '@ekohost/database';

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hostname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsEnum(ServerStatus)
  status?: ServerStatus;
}
