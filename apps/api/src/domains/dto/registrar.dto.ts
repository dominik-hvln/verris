import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** A-13 — dane abonenta domeny (właściciela). Idą do rejestratora i dalej do rejestru (WHOIS/NASK). */
export class RegistrantDto {
  @IsString() @MinLength(1) @MaxLength(64) @Matches(/^[^<>{}\x00-\x1f]+$/)
  firstName!: string;

  @IsString() @MinLength(1) @MaxLength(64) @Matches(/^[^<>{}\x00-\x1f]+$/)
  lastName!: string;

  @IsOptional() @IsString() @MaxLength(128) @Matches(/^[^<>{}\x00-\x1f]*$/)
  companyName?: string | null;

  /** NIP / VAT-UE; przy firmie z PL rejestr wymaga NIP. */
  @IsOptional() @IsString() @MaxLength(20) @Matches(/^[A-Za-z0-9 -]*$/)
  vat?: string | null;

  @IsString() @MinLength(1) @MaxLength(96) @Matches(/^[^<>{}\x00-\x1f]+$/)
  street!: string;

  @IsString() @MinLength(1) @MaxLength(16) @Matches(/^[0-9A-Za-z/ -]+$/)
  houseNumber!: string;

  @IsString() @MinLength(2) @MaxLength(12) @Matches(/^[0-9A-Za-z -]+$/)
  zipcode!: string;

  @IsString() @MinLength(1) @MaxLength(64) @Matches(/^[^<>{}\x00-\x1f]+$/)
  city!: string;

  @IsString() @Matches(/^[A-Za-z]{2}$/, { message: 'Kraj: dwuliterowy kod (np. PL).' })
  country!: string;

  @IsString() @Matches(/^\+\d{1,3}$/, { message: 'Kierunkowy kraju: np. +48.' })
  phoneCountryCode!: string;

  @IsString() @Matches(/^[\d ]{6,15}$/, { message: 'Telefon: same cyfry, 6–15.' })
  phone!: string;

  @IsEmail() @MaxLength(254)
  email!: string;
}

export class TransferLockDto {
  @IsBoolean()
  locked!: boolean;
}

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

  /** A-13 (decyzja 2026-09-23): abonentem jest klient, nie operator. */
  @IsDefined({ message: 'Podaj dane abonenta (właściciela) domeny.' })
  @ValidateNested()
  @Type(() => RegistrantDto)
  registrant!: RegistrantDto;
}

export class TransferDomainDto extends RegisterDomainDto {
  @IsString()
  @MaxLength(256)
  authCode!: string;
}
