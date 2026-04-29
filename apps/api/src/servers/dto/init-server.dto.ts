import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class InitServerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

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
}
