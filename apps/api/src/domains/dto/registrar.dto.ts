import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class DomainSearchDto {
  @IsString()
  @MaxLength(63)
  label!: string;
}

export class DomainQuotePeriodsDto {
  @IsString()
  @MaxLength(253)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10, { each: true })
  years?: number[];
}

export class DomainAvailabilityDto {
  @IsString()
  @MaxLength(253)
  name!: string;
}

export class DomainQuoteDto extends DomainAvailabilityDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  years?: number;
}

export class RegisterDomainDto {
  @IsString()
  @MaxLength(253)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  years?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  nameservers?: string[];
}

export class TransferDomainDto extends RegisterDomainDto {
  @IsString()
  @MaxLength(256)
  authCode!: string;
}
