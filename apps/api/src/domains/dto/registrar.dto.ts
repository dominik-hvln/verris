import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  /**
   * Oświadczenie konsumenckie (art. 38 ust. 1 pkt 1 ustawy o prawach
   * konsumenta; Regulamin §12 ust. 7–8): żądanie natychmiastowego wykonania
   * usługi rejestracji oraz potwierdzenie wiedzy, że z chwilą zarejestrowania
   * domeny (pełnego wykonania usługi) prawo odstąpienia wygasa. Wymagane
   * `true`; fakt złożenia trafia do dziennika audytu (dowód).
   */
  @IsBoolean()
  @Equals(true, {
    message:
      'Wymagane jest oświadczenie o żądaniu natychmiastowej rejestracji domeny i przyjęciu do wiadomości utraty prawa odstąpienia z chwilą jej zarejestrowania.',
  })
  withdrawalWaiverConsent!: boolean;
}

export class TransferDomainDto extends RegisterDomainDto {
  @IsString()
  @MaxLength(256)
  authCode!: string;
}
