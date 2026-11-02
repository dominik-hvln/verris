import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Co tester chce sprawdzić — te same wartości wysyła formularz verris.pl/beta. */
export const ZAKRESY_BETA = ['WORDPRESS', 'SKLEP', 'STRONY_DLA_KLIENTOW', 'POCZTA', 'INNE'] as const;
export type ZakresBeta = (typeof ZAKRESY_BETA)[number];

export class UtmZgloszeniaDto {
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(100) medium?: string;
  @IsOptional() @IsString() @MaxLength(100) campaign?: string;
  @IsOptional() @IsString() @MaxLength(100) content?: string;
  @IsOptional() @IsString() @MaxLength(100) term?: string;
}

/** POST /public/beta/zgloszenia — formularz otwartej bety na verris.pl/beta. */
export class ZgloszenieBetaDto {
  @IsString() @MinLength(1) @MaxLength(100) imie!: string;

  @IsEmail() @MaxLength(320) email!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(ZAKRESY_BETA, { each: true })
  zakres!: ZakresBeta[];

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Adres strony musi zaczynać się od http:// albo https://.' })
  @MaxLength(2048)
  strona?: string;

  @IsOptional() @IsString() @MaxLength(100) obecnyHosting?: string;

  @IsOptional() @IsString() @MaxLength(1000) uwagi?: string;

  /** Zgoda na kontakt w sprawie testów — bez niej zgłoszenia nie przyjmujemy. */
  @IsBoolean() @Equals(true, { message: 'Zgoda jest wymagana.' }) zgoda!: true;

  /** Treść klauzuli pokazanej przy polu zgody (dowód RODO). */
  @IsString() @MinLength(1) @MaxLength(2000) zgodaTekst!: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => UtmZgloszeniaDto) utm?: UtmZgloszeniaDto;

  @IsOptional() @IsString() @MaxLength(2048) page?: string;

  /** Pułapka na boty — pole ukryte w formularzu; człowiek go nie wypełnia. */
  @IsOptional() @IsString() @MaxLength(200) firma?: string;

  @IsOptional() @IsString() @MaxLength(4096) captchaToken?: string;
}
