import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class HostingSslLetsencryptDto {
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  domain!: string;

  @IsOptional()
  @IsBoolean()
  includeWww?: boolean;
}

export class HostingSslPasteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  domain!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  certificate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  privateKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  caBundle?: string;
}
